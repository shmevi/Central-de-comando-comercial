import { describe, it, expect, beforeEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { SupabaseRepository, PAGE_SIZE, friendlyDbError } from './supabaseRepository';
import { resolveDataConfig } from './config';

type Call = { method: string; url: URL; body: any };

/** Servidor PostgREST falso: guarda as chamadas e responde como o Supabase. */
function fakeClient(rows: any[], fail?: { status: number; code: string; message: string }, withCount = true) {
  const calls: Call[] = [];
  const fetchFn = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, url, body });
    if (fail) return new Response(JSON.stringify({ code: fail.code, message: fail.message, details: null, hint: null }), { status: fail.status, headers: { 'content-type': 'application/json' } });
    if (method === 'GET') {
      const offset = Number(url.searchParams.get('offset') ?? 0), limit = Number(url.searchParams.get('limit') ?? rows.length);
      const page = rows.slice(offset, offset + limit);
      // Como o PostgREST: com Prefer count=exact, o total vem no Content-Range
      const wantsCount = /count=exact/.test(String((init?.headers as Record<string, string> | undefined)?.Prefer ?? new Headers(init?.headers).get('Prefer') ?? ''));
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (wantsCount && withCount) headers['content-range'] = `${offset}-${offset + page.length - 1}/${rows.length}`;
      return new Response(JSON.stringify(page), { status: 200, headers });
    }
    const echo = (b: any) => ({ id: 'novo', created_at: 'x', updated_at: 'x', user_id: 'do-banco', ...b });
    return new Response(JSON.stringify(Array.isArray(body) ? body.map(echo) : echo(body)), { status: 201, headers: { 'content-type': 'application/json' } });
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
  it('com o total informado, as páginas seguintes são pedidas em paralelo', async () => {
    const rows = Array.from({ length: 1700 }, (_, i) => ({ id: String(i), created_at: '', updated_at: '' }));
    const { client, calls } = fakeClient(rows);
    const list = await new SupabaseRepository('routine_blocks', () => client).list();
    expect(list.map((r) => r.id)).toEqual(rows.map((r) => r.id)); // ordem preservada
    expect(calls).toHaveLength(4);
  });
  it('sem o total (servidor antigo), continua lendo página por página', async () => {
    const rows = Array.from({ length: 1200 }, (_, i) => ({ id: String(i), created_at: '', updated_at: '' }));
    const { client } = fakeClient(rows, undefined, false);
    expect(await new SupabaseRepository('tasks', () => client).list()).toHaveLength(1200);
  });
  it('log de sincronização: só os registros mais recentes (backup leva tudo)', async () => {
    const rows = Array.from({ length: 900 }, (_, i) => ({ id: String(i), created_at: '', updated_at: '' }));
    const { client, calls } = fakeClient(rows);
    const r = new SupabaseRepository('sync_logs', () => client);
    await r.list();
    expect(calls[0].url.searchParams.get('limit')).toBe('300');
    expect(calls[0].url.searchParams.get('order')).toBe('created_at.desc,id.desc');
    expect(await r.list({ all: true })).toHaveLength(900);
  });
  it('criação em lote: uma requisição, com default do banco para campos ausentes', async () => {
    const { client, calls } = fakeClient([]);
    await new SupabaseRepository('sync_logs', () => client).createMany([{ message: 'a' }, { message: 'b' }] as any);
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].body).toHaveLength(2);
    expect(calls[0].url.searchParams.get('columns')).toBeTruthy(); // supabase-js manda as colunas → ausentes usam DEFAULT
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
