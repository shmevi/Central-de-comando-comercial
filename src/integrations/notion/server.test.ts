import { describe, it, expect } from 'vitest';
import { queryAll } from './adapter';
import { createNotionApiAdapter, normalizeProgress, statusGroupOf, toUuid } from './apiAdapter';
import { PROPS } from './config';
import { createMockNotionAdapter, MOCK_IDS as I, MOCK_NOTION_CONFIG as CFG } from './mockAdapter';
import { handleNotionSync } from './serverHandler';

const TOKEN = 'token-de-teste-falso-nao-e-credencial';
const PERSON = CFG.person_id;
const OTHER = 'de3ff000000000000000000000000001';
const DS = { tarefas: CFG.tasks_data_source_id, krs: CFG.krs_data_source_id, objetivos: CFG.objectives_data_source_id };

/** Schema de status no formato da API (grupos com option_ids). */
const statusSchema = (prop: string, opts: [string, string, 'To-do' | 'In progress' | 'Complete'][]) => ({
  object: 'data_source',
  properties: { [prop]: { id: 'st', type: 'status', status: {
    options: opts.map(([id, name]) => ({ id, name })),
    groups: ['To-do', 'In progress', 'Complete'].map((g) => ({ name: g, option_ids: opts.filter((o) => o[2] === g).map((o) => o[0]) })),
  } } },
});
const apiTask = (id: string, who: string[], status: [string, string]) => ({
  object: 'page', id: toUuid(id), url: `https://www.notion.so/${id}`, last_edited_time: '2026-11-07T12:00:00.000Z', last_edited_by: { id: toUuid(PERSON) },
  archived: false, in_trash: false, parent: { type: 'data_source_id', data_source_id: toUuid(DS.tarefas) },
  properties: {
    [PROPS.tarefas.title]: { id: 't', type: 'title', title: [{ plain_text: 'Título ' }, { plain_text: 'da tarefa' }] },
    [PROPS.tarefas.responsible]: { id: 'r', type: 'people', people: who.map((w) => ({ object: 'user', id: toUuid(w) })) },
    [PROPS.tarefas.status]: { id: 'st', type: 'status', status: { id: status[0], name: status[1] } },
    [PROPS.tarefas.priority]: { id: 'p', type: 'select', select: { name: 'Importante e Urgente' } },
    [PROPS.tarefas.due_date]: { id: 'd', type: 'date', date: { start: '2026-11-10', end: null } },
  },
});

type Call = { method: string; url: string; headers: Record<string, string>; body: any };
function fakeNotion(routes: (c: Call) => { status?: number; body?: unknown; headers?: Record<string, string> } | undefined) {
  const calls: Call[] = [];
  const f = (async (url: string, init: RequestInit = {}) => {
    const c: Call = { method: init.method ?? 'GET', url, headers: init.headers as Record<string, string>, body: init.body ? JSON.parse(String(init.body)) : null };
    calls.push(c);
    const r = routes(c) ?? { status: 404, body: { object: 'error', code: 'object_not_found', message: 'não encontrado' } };
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200, headers: r.headers });
  }) as unknown as typeof fetch;
  return { f, calls };
}

describe('API do Notion (adaptador do servidor)', () => {
  const schema = statusSchema(PROPS.tarefas.status, [['a', 'Não iniciada', 'To-do'], ['b', 'Em andamento', 'In progress'], ['c', 'Pausada', 'In progress'], ['d', 'Concluída', 'Complete']]);
  it('consulta com filtro na origem: pessoa pelo UUID e status pelos nomes dos grupos ativos', async () => {
    const { f, calls } = fakeNotion((c) => {
      if (c.method === 'GET' && c.url.endsWith(`/data_sources/${toUuid(DS.tarefas)}`)) return { body: schema };
      if (c.method === 'POST' && c.url.endsWith('/query')) return { body: { results: [apiTask('de300000000000000000000000000001', [OTHER, PERSON], ['a', 'Não iniciada'])], has_more: false } };
    });
    const a = createNotionApiAdapter({ token: TOKEN, dataSources: DS, fetch: f });
    const pages = await queryAll(a, 'tarefas', { dataSourceId: DS.tarefas, personId: PERSON, personProperty: PROPS.tarefas.responsible, statusProperty: PROPS.tarefas.status, statusGroups: ['to_do', 'in_progress'] });
    const q = calls.find((c) => c.url.endsWith('/query'))!;
    expect(q.url).toBe(`https://api.notion.com/v1/data_sources/${toUuid(DS.tarefas)}/query`);
    expect(q.body.filter.and[0]).toEqual({ property: 'RESPONSÁVEL', people: { contains: toUuid(PERSON) } });
    expect(q.body.filter.and[1].or.map((x: any) => x.status.equals).sort()).toEqual(['Em andamento', 'Não iniciada', 'Pausada']); // sem "Concluída"
    expect(q.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(q.headers['Notion-Version']).toBe('2025-09-03');
    // Página normalizada
    const p = pages[0];
    expect(p.id).toBe('de300000000000000000000000000001');
    expect(p.parent_data_source_id).toBe(DS.tarefas);
    expect(p.properties[PROPS.tarefas.responsible]).toEqual({ type: 'people', ids: [OTHER, PERSON] });
    expect(p.properties[PROPS.tarefas.status]).toEqual({ type: 'status', name: 'Não iniciada', group: 'to_do' });
    expect(p.properties[PROPS.tarefas.title]).toEqual({ type: 'title', text: 'Título da tarefa' });
    // Só leitura: nenhum PATCH/DELETE, e POST só para /query
    expect(calls.every((c) => c.method === 'GET' || (c.method === 'POST' && c.url.endsWith('/query')))).toBe(true);
  });
  it('pagina pelo cursor', async () => {
    let n = 0;
    const { f } = fakeNotion((c) => {
      if (c.method === 'GET') return { body: schema };
      n++;
      return n === 1 ? { body: { results: [apiTask('de300000000000000000000000000001', [PERSON], ['a', 'Não iniciada'])], has_more: true, next_cursor: 'cur-2' } }
        : { body: { results: [apiTask('de300000000000000000000000000002', [PERSON], ['b', 'Em andamento'])], has_more: false } };
    });
    const a = createNotionApiAdapter({ token: TOKEN, dataSources: DS, fetch: f });
    const pages = await queryAll(a, 'tarefas', { dataSourceId: DS.tarefas, personId: PERSON, personProperty: PROPS.tarefas.responsible });
    expect(pages.map((p) => p.id)).toEqual(['de300000000000000000000000000001', 'de300000000000000000000000000002']);
  });
  it('429: espera o Retry-After e tenta de novo; erro final não vaza o token', async () => {
    const waits: number[] = []; let n = 0;
    const { f } = fakeNotion(() => (++n === 1 ? { status: 429, headers: { 'Retry-After': '2' }, body: {} } : { body: schema }));
    const a = createNotionApiAdapter({ token: TOKEN, dataSources: DS, fetch: f, sleep: async (ms) => { waits.push(ms); } });
    await a.query('tarefas', { dataSourceId: DS.tarefas, personId: PERSON, personProperty: PROPS.tarefas.responsible }).catch(() => null);
    expect(waits).toEqual([2000]);
    const bad = fakeNotion(() => ({ status: 401, body: { object: 'error', code: 'unauthorized', message: 'API token is invalid.' } }));
    const b = createNotionApiAdapter({ token: TOKEN, dataSources: DS, fetch: bad.f, sleep: async () => {} });
    const err = (await b.query('tarefas', { dataSourceId: DS.tarefas, personId: PERSON, personProperty: PROPS.tarefas.responsible, statusProperty: PROPS.tarefas.status, statusGroups: ['to_do'] }).then(() => null, (e: unknown) => e)) as Error;
    expect(err.message).toMatch(/401/);
    expect(err.message).not.toContain(TOKEN);
  });
  it('página inexistente ou sem acesso (404) simplesmente não volta; relação com mais de 25 itens é buscada inteira', async () => {
    const kr = {
      object: 'page', id: toUuid(I.k_normal), last_edited_time: '2026-11-07T12:00:00.000Z', parent: { type: 'data_source_id', data_source_id: toUuid(DS.krs) },
      properties: {
        [PROPS.krs.objective]: { id: 'rel', type: 'relation', relation: [{ id: toUuid(I.o1) }], has_more: true },
        [PROPS.krs.target]: { id: 'm', type: 'number', number: 10 }, [PROPS.krs.current]: { id: 'a', type: 'number', number: 4 },
        [PROPS.krs.progress]: { id: 'pg', type: 'formula', formula: { type: 'number', number: 0.4 } },
      },
    };
    const { f } = fakeNotion((c) => {
      if (c.url.includes('/data_sources/')) return { body: statusSchema(PROPS.krs.status, [['x', 'A caminho', 'To-do']]) };
      if (c.url.endsWith(`/pages/${toUuid(I.k_normal)}`)) return { body: kr };
      if (c.url.includes(`/pages/${toUuid(I.k_normal)}/properties/rel`)) return { body: { results: [{ relation: { id: toUuid(I.o1) } }, { relation: { id: toUuid(I.o2) } }], has_more: false } };
    });
    const a = createNotionApiAdapter({ token: TOKEN, dataSources: DS, fetch: f });
    const got = await a.retrieve('krs', [I.k_normal, 'de30000000000000000000000000ffff']);
    expect(got).toHaveLength(1);
    expect(got[0].properties[PROPS.krs.objective]).toEqual({ type: 'relation', ids: [I.o1, I.o2] });
    expect(got[0].properties[PROPS.krs.progress]).toEqual({ type: 'formula', value: 40 }); // 0,4 confirmado por 4/10
  });
  it('escala do progresso só quando confirmável pelos próprios Meta/Atual', () => {
    expect(normalizeProgress(0.4, 10, 4)).toBe(40);
    expect(normalizeProgress(40, 10, 4)).toBe(40);
    expect(normalizeProgress('40%', null, null)).toBe(40);
    expect(normalizeProgress(0.4, null, null)).toBeNull();
    expect(normalizeProgress(0.9, 10, 4)).toBeNull();
    expect(statusGroupOf('To-do')).toBe('to_do');
    expect(statusGroupOf('In progress')).toBe('in_progress');
    expect(statusGroupOf('Complete')).toBe('complete');
  });
});

describe('Edge Function notion-sync (dry-run)', () => {
  const REST = 'https://exemplo.supabase.co';
  const JWT = 'Bearer eyJ.usuario.teste';
  function central(opts: { config?: Record<string, unknown> } = {}) {
    const calls: { url: string; auth: string }[] = [];
    const f = (async (url: string, init: RequestInit = {}) => {
      const h = init.headers as Record<string, string>;
      calls.push({ url, auth: h.Authorization });
      const table = new URL(url).pathname.split('/').pop();
      const rows = table === 'settings' ? [{ id: 's', notion_config: opts.config ?? CFG }] : [];
      return new Response(JSON.stringify(rows), { status: 200 });
    }) as unknown as typeof fetch;
    return { f, calls };
  }
  const env = (vals: Record<string, string>) => (k: string) => vals[k];
  const post = (body: unknown, auth = JWT) => new Request('https://x/functions/v1/notion-sync', { method: 'POST', headers: { Authorization: auth, apikey: 'sb_publishable_teste', 'content-type': 'application/json' }, body: JSON.stringify(body) });

  it('recusa sem sessão, recusa escrita e falha fechado sem token', async () => {
    const { f, calls } = central();
    const deps = { env: env({ SUPABASE_URL: REST }), fetch: f };
    expect((await handleNotionSync(new Request('https://x', { method: 'OPTIONS' }), deps)).status).toBe(204);
    expect((await handleNotionSync(new Request('https://x', { method: 'GET' }), deps)).status).toBe(405);
    expect((await handleNotionSync(post({}, ''), deps)).status).toBe(401);
    expect((await handleNotionSync(post({ dry_run: false }), { ...deps, env: env({ SUPABASE_URL: REST, NOTION_TOKEN: TOKEN }) })).status).toBe(403);
    const r = await handleNotionSync(post({}), deps);
    expect(r.status).toBe(503);
    expect(calls).toHaveLength(0); // sem token: não lê nem a Central
  });
  it('configuração incompleta: 422 e nenhuma chamada ao Notion', async () => {
    const { f } = central({ config: { ...CFG, krs_data_source_id: '' } });
    let notionCalls = 0;
    const r = await handleNotionSync(post({}), { env: env({ SUPABASE_URL: REST, NOTION_TOKEN: TOKEN }), fetch: f, makeAdapter: () => { notionCalls++; return createMockNotionAdapter(); } });
    expect(r.status).toBe(422);
    expect(notionCalls).toBe(0);
  });
  it('dry-run: lê a Central com o JWT de quem chamou, devolve só contagens e IDs, sem token e sem títulos', async () => {
    const { f, calls } = central();
    let usedToken = '';
    const r = await handleNotionSync(post({}), {
      env: env({ SUPABASE_URL: REST, NOTION_TOKEN: TOKEN }), fetch: f, now: () => '2026-11-07T15:00:00.000Z',
      makeAdapter: (t) => { usedToken = t; return createMockNotionAdapter({ leaky: true }); },
    });
    expect(r.status).toBe(200);
    expect(usedToken).toBe(TOKEN);
    expect(calls.every((c) => c.auth === JWT)).toBe(true); // RLS: só os dados de quem chamou
    const text = await r.text();
    expect(text).not.toContain(TOKEN);
    expect(text).not.toContain('Demonstração'); // nenhum título de página
    const { dry_run, report } = JSON.parse(text);
    expect(dry_run).toBe(true);
    expect(report.tarefas).toMatchObject({ do_responsavel: 6, criar: 4, valor_desconhecido: 2 }); // leaky: inclui a concluída
    expect(report.tarefas.ignoradas).toBe(2); // outra pessoa + sem responsável: só contados
    expect(report.krs).toMatchObject({ do_responsavel: 5, normais: 3, sem_objetivo: 1, multiplos_objetivos: 1, enviados_para_revisao: 2, ignorados: 1 });
    expect(report.objetivos).toMatchObject({ agrupando_krs: 2, criar: 2 });
    expect(text).not.toContain(I.t_so_outra);
    expect(text).not.toContain(I.k_so_outra);
  });
});

describe('Código de servidor fora do navegador', () => {
  it('nenhuma tela importa o adaptador da API nem o handler da Edge Function', () => {
    const files = import.meta.glob('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    const offenders = Object.entries(files)
      .filter(([path]) => !path.includes('/integrations/notion/') && !path.endsWith('.test.ts'))
      .filter(([, src]) => /apiAdapter|serverHandler/.test(src))
      .map(([path]) => path);
    expect(Object.keys(files).length).toBeGreaterThan(20);
    expect(offenders).toEqual([]);
    const notion = Object.entries(files).filter(([p]) => p.includes('/integrations/notion/') && !p.endsWith('.test.ts') && !/apiAdapter|serverHandler/.test(p));
    expect(notion.filter(([, src]) => /from '\.\/(apiAdapter|serverHandler)'/.test(src)).map(([p]) => p)).toEqual([]);
  });
});
