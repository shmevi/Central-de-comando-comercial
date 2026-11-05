import { describe, it, expect, beforeEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { SupabaseRepository, PAGE_SIZE, friendlyDbError } from './supabaseRepository';
import { resolveDataConfig } from './config';

type Call = { method: string; url: URL; body: any };

/** Servidor PostgREST falso: guarda as chamadas e responde como o Supabase. */
function fakeClient(rows: any[], fail?: { status: number; code: string; message: string }) {
  const calls: Call[] = [];
  const fetchFn = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, url, body });
    if (fail) return new Response(JSON.stringify({ code: fail.code, message: fail.message, details: null, hint: null }), { status: fail.status, headers: { 'content-type': 'application/json' } });
    if (method === 'GET') {
      const offset = Number(url.searchParams.get('offset') ?? 0), limit = Number(url.searchParams.get('limit') ?? rows.length);
      return new Response(JSON.stringify(rows.slice(offset, offset + limit)), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    const echo = { id: 'novo', created_at: 'x', updated_at: 'x', user_id: 'do-banco', ...(Array.isArray(body) ? body[0] : body) };
    return new Response(JSON.stringify(echo), { status: 201, headers: { 'content-type': 'application/json' } });
  };
  const client = createClient('https://projeto.supabase.co', 'sb_publishable_teste', { global: { fetch: fetchFn as typeof fetch }, auth: { persistSession: false } });
  return { client, calls };
}

describe('SupabaseRepository', () => {
  it('lê todas as linhas em páginas (não corta em 1000)', async () => {
    const rows = Array.from({ length: 1200 }, (_, i) => ({ id: String(i), created_at: '', updated_at: '' }));
    const { client, calls } = fakeClient(rows);
    const list = await new SupabaseRepository('routine_blocks', () => client).list();
    expect(list).toHaveLength(1200);
    expect(calls.map((c) => c.url.searchParams.get('offset'))).toEqual(['0', String(PAGE_SIZE), String(PAGE_SIZE * 2)]);
    expect(calls[0].url.pathname).toBe('/rest/v1/routine_blocks');
  });
  it('nunca envia user_id, created_at ou updated_at (o banco controla)', async () => {
    const { client, calls } = fakeClient([]);
    const r = new SupabaseRepository('tasks', () => client);
    await r.create({ title: 'T', user_id: 'forjado', created_at: 'x' } as any);
    await r.update('abc', { title: 'U', id: 'outro', user_id: 'forjado', updated_at: 'x' } as any);
    const [ins, upd] = calls;
    expect(ins.method).toBe('POST');
    expect(JSON.stringify(ins.body)).not.toMatch(/user_id|created_at/);
    expect(upd.method).toBe('PATCH');
    expect(upd.url.searchParams.get('id')).toBe('eq.abc');
    expect(upd.body).toEqual({ title: 'U' });
  });
  it('erro de tabela ausente explica que falta aplicar a migration', async () => {
    const { client } = fakeClient([], { status: 404, code: 'PGRST205', message: "Could not find the table 'public.tasks' in the schema cache" });
    await expect(new SupabaseRepository('tasks', () => client).list()).rejects.toThrow(/migration/);
  });
  it('traduz erros comuns', () => {
    expect(friendlyDbError({ code: '42501', message: 'new row violates row-level security policy' }, 'Falha ao criar')).toMatch(/sem permissão/);
    expect(friendlyDbError({ code: '23505', message: 'duplicate key' }, 'Falha ao criar')).toMatch(/já existe/);
    expect(friendlyDbError({ code: 'PGRST301', message: 'JWT expired' }, 'Falha')).toMatch(/sessão expirou/);
  });
});

describe('configuração (variáveis VITE_*)', () => {
  const jwt = (role: string) => `x.${btoa(JSON.stringify({ role })).replace(/=+$/, '')}.y`;
  it('sem variáveis → modo local', () => expect(resolveDataConfig({})).toEqual({ mode: 'local' }));
  it('URL e chave → Supabase', () => {
    expect(resolveDataConfig({ VITE_SUPABASE_URL: 'https://abc.supabase.co/', VITE_SUPABASE_ANON_KEY: jwt('anon') })).toMatchObject({ mode: 'supabase', url: 'https://abc.supabase.co' });
  });
  it('modo Supabase sem variáveis NÃO cai para local em silêncio', () => {
    const c = resolveDataConfig({ VITE_DATA_MODE: 'supabase' });
    expect(c.mode).toBe('supabase');
    expect(c.error).toMatch(/não foram definidas/);
  });
  it('aceita o nome novo da chave (publishable)', () => {
    expect(resolveDataConfig({ VITE_SUPABASE_URL: 'https://abc.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x' })).toMatchObject({ mode: 'supabase', key: 'sb_publishable_x' });
  });
  it('recusa chave secreta', () => {
    expect(resolveDataConfig({ VITE_SUPABASE_URL: 'https://abc.supabase.co', VITE_SUPABASE_ANON_KEY: jwt('service_role') }).error).toMatch(/SECRETA/);
    expect(resolveDataConfig({ VITE_SUPABASE_URL: 'https://abc.supabase.co', VITE_SUPABASE_ANON_KEY: 'sb_secret_abc' }).error).toMatch(/SECRETA/);
  });
  it('recusa URL da API em vez da URL do projeto', () => {
    expect(resolveDataConfig({ VITE_SUPABASE_URL: 'https://abc.supabase.co/rest/v1', VITE_SUPABASE_ANON_KEY: 'sb_publishable_x' }).error).toMatch(/endereço do projeto/);
  });
});

describe('primeiro acesso (seed) idempotente', () => {
  beforeEach(() => {
    const mem = new Map<string, string>();
    (globalThis as any).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => mem.set(k, v), removeItem: (k: string) => mem.delete(k), key: () => null, length: 0, clear: () => mem.clear() };
  });
  it('completa um primeiro acesso interrompido sem duplicar', async () => {
    const { repo } = await import('./index');
    const { ensureSeed, resetSeedGuard } = await import('./seed');
    // simula queda depois de criar só 1 instituição
    await repo('institutions').create({ code: 'CPPEM', name: 'CPPEM', color: '#000', active: true });
    resetSeedGuard(); await ensureSeed();
    resetSeedGuard(); await ensureSeed();
    expect((await repo('institutions').list()).map((i) => i.code).sort()).toEqual(['COLEGIO_CPPEM', 'CPPEM', 'UNICIVE']);
    expect(await repo('tasks').list()).toHaveLength(3);
    expect(await repo('settings').list()).toHaveLength(1);
    expect(await repo('routine_templates').list()).toHaveLength(1);
  });
});
