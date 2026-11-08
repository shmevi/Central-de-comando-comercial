import { describe, it, expect } from 'vitest';
import { queryAll } from './adapter';
import { createNotionApiAdapter, normalizeProgress, statusGroupOf, toUuid } from './apiAdapter';
import { PROPS } from './config';
import { createMockNotionAdapter, MOCK_IDS as I, MOCK_NOTION_CONFIG as CFG } from './mockAdapter';
import { handleNotionSync } from './serverHandler';
import { planNotionSync } from './plan';
import { createRemoteNotionReader, type InvokeFn } from './remoteReader';

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

describe('Edge Function notion-sync', () => {
  const REST = 'https://exemplo.supabase.co';
  const JWT = 'Bearer eyJ.usuario.teste';
  function central(opts: { config?: Record<string, unknown>; access?: string | null; states?: unknown[] } = {}) {
    const calls: { url: string; auth: string }[] = [];
    const f = (async (url: string, init: RequestInit = {}) => {
      const h = init.headers as Record<string, string>;
      calls.push({ url, auth: h.Authorization });
      const table = new URL(url).pathname.split('/').pop();
      const access = opts.access === undefined ? PERSON : opts.access;
      const rows = table === 'settings' ? [{ id: 's', notion_config: opts.config ?? CFG }]
        : table === 'notion_access' ? (access ? [{ user_id: 'u1', person_id: access }] : [])
        : table === 'notion_sync_state' ? (opts.states ?? []) : [];
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
  it('sem vínculo em notion_access: 403 e nenhuma chamada ao Notion', async () => {
    const { f } = central({ access: null });
    let notionCalls = 0;
    for (const body of [{}, { mode: 'read' }]) {
      const r = await handleNotionSync(post(body), { env: env({ SUPABASE_URL: REST, NOTION_TOKEN: TOKEN }), fetch: f, makeAdapter: () => { notionCalls++; return createMockNotionAdapter(); } });
      expect(r.status).toBe(403);
    }
    expect(notionCalls).toBe(0);
    expect((await handleNotionSync(post({ mode: 'escrever' }), { env: env({ SUPABASE_URL: REST, NOTION_TOKEN: TOKEN }), fetch: f })).status).toBe(400);
  });
  it('o responsável é sempre o do vínculo: trocar o ID nas Configurações não lê tarefas de outra pessoa', async () => {
    const { f } = central({ config: { ...CFG, person_id: OTHER } }); // usuário digitou o ID de outra pessoa
    const queried: string[] = [];
    const base = createMockNotionAdapter();
    const r = await handleNotionSync(post({ mode: 'read' }), {
      env: env({ SUPABASE_URL: REST, NOTION_TOKEN: TOKEN }), fetch: f,
      makeAdapter: () => ({ ...base, query: (src, q) => { queried.push(q.personId); return base.query(src, q); } }),
    });
    expect(r.status).toBe(200);
    expect(queried.length).toBeGreaterThan(0);
    expect(queried.every((p) => p === PERSON)).toBe(true);
    const { person_id, read } = await r.json();
    expect(person_id).toBe(PERSON);
    expect(read.tarefas.map((p: any) => p.id)).not.toContain(I.t_so_outra);
  });
  it('modo read: devolve só o que é do responsável, minimizado; o resto vira esqueleto sem dados', async () => {
    const { f } = central({ states: [{ id: 'x', entity: 'tarefas', notion_page_id: 'de3000000000000000000000000fake01', local_id: 'l', sync_status: 'ok', is_demo: true }] });
    const retrieved: string[][] = [];
    const base = createMockNotionAdapter({ leaky: true });
    const r = await handleNotionSync(post({ mode: 'read' }), {
      env: env({ SUPABASE_URL: REST, NOTION_TOKEN: TOKEN }), fetch: f, now: () => '2026-11-07T15:00:00.000Z',
      makeAdapter: () => ({ ...base, retrieve: (src, ids) => { retrieved.push(ids); return base.retrieve(src, ids); } }),
    });
    expect(r.status).toBe(200);
    const text = await r.text();
    expect(text).not.toContain(TOKEN);
    expect(text).not.toContain('Tarefa de outra pessoa');
    expect(text).not.toContain('KR de outra pessoa');
    expect(text).not.toContain('Tarefa sem responsável');
    expect(text).not.toContain(OTHER); // corresponsáveis não saem
    expect(retrieved.flat()).not.toContain('de3000000000000000000000000fake01'); // estado de demonstração não é buscado
    const { mode, read } = JSON.parse(text);
    expect(mode).toBe('read');
    const outra = read.tarefas.find((p: any) => p.id === I.t_so_outra);
    expect(outra).toEqual({ id: I.t_so_outra, last_edited_time: expect.any(String), parent_data_source_id: CFG.tasks_data_source_id, archived: false, properties: {} });
    const minha = read.tarefas.find((p: any) => p.id === I.t_responsavel_e_outra);
    expect(minha.properties[PROPS.tarefas.responsible]).toEqual({ type: 'people', ids: [PERSON] });
    expect(minha.properties[PROPS.tarefas.title].text).toContain('Atualizar playbook');
    // O navegador planeja com o que recebeu e chega ao mesmo resultado do dry-run (a barreira 2 continua valendo).
    let n = 0;
    const plan = await planNotionSync({ config: { ...CFG, person_id: PERSON }, notion: read, missing: read.missing, local: { tasks: [], objectives: [], states: [], reviews: [] }, isDemo: false, now: '2026-11-07T15:00:00.000Z', newId: () => `id-${++n}` });
    expect(plan.taskCreates.map((t) => t.external_ref).sort()).toEqual([I.t_responsavel, I.t_responsavel_e_outra, I.t_pausada, I.t_concluida].map((x) => `notion:${x}`).sort());
    expect(plan.taskCreates.every((t) => t.institution_id === null && !t.is_demo)).toBe(true);
    expect(plan.counts.fora_do_escopo).toBeGreaterThanOrEqual(3);
    expect(plan.objectiveCreates).toHaveLength(2);
  });
});

describe('Leitura real pelo navegador (chama a Edge Function)', () => {
  const REST = 'https://exemplo.supabase.co';
  /** Imita supabase.functions.invoke: 2xx → data; senão → error com a Response em `context`. */
  const invokeVia = (handler: (req: Request) => Promise<Response>): InvokeFn => async (name, opts) => {
    const res = await handler(new Request(`${REST}/functions/v1/${name}`, { method: 'POST', headers: { Authorization: 'Bearer eyJ.u.t', apikey: 'sb_publishable_teste' }, body: JSON.stringify(opts.body) }));
    return res.ok ? { data: await res.json(), error: null } : { data: null, error: Object.assign(new Error('Edge Function returned a non-2xx status code'), { context: res }) };
  };
  const centralFetch = (access: string | null) => (async (url: string) => {
    const table = new URL(url).pathname.split('/').pop();
    const rows = table === 'settings' ? [{ id: 's', notion_config: CFG }] : table === 'notion_access' ? (access ? [{ user_id: 'u', person_id: access }] : []) : [];
    return new Response(JSON.stringify(rows), { status: 200 });
  }) as unknown as typeof fetch;
  const deps = (access: string | null) => ({ env: (k: string) => ({ SUPABASE_URL: REST, NOTION_TOKEN: TOKEN } as Record<string, string>)[k], fetch: centralFetch(access), makeAdapter: () => createMockNotionAdapter() });

  it('pede só o modo "read" e devolve as páginas do responsável, marcadas como NÃO demonstração', async () => {
    const bodies: unknown[] = [];
    const reader = createRemoteNotionReader(async (n, o) => { bodies.push(o.body); return invokeVia((r) => handleNotionSync(r, deps(PERSON)))(n, o); });
    expect(reader.isDemo).toBe(false);
    const got = await reader.read(CFG, []);
    expect(bodies).toEqual([{ mode: 'read' }]);
    expect(got.person_id).toBe(PERSON);
    expect(got.read.tarefas.map((p) => p.id).sort()).toEqual([I.t_responsavel, I.t_responsavel_e_outra, I.t_status_desconhecido, I.t_prioridade_desconhecida, I.t_pausada].sort());
  });
  it('erro do servidor chega com a mensagem dele (ex.: conta sem vínculo)', async () => {
    const reader = createRemoteNotionReader(invokeVia((r) => handleNotionSync(r, deps(null))));
    await expect(reader.read(CFG, [])).rejects.toThrow(/não está liberada/);
  });
  it('resposta fora do formato é recusada (nada é gravado)', async () => {
    const reader = createRemoteNotionReader(async () => ({ data: { mode: 'dry_run', report: {} }, error: null }));
    await expect(reader.read(CFG, [])).rejects.toThrow(/Resposta inesperada/);
    const offline = createRemoteNotionReader(async () => ({ data: null, error: new Error('Failed to send a request to the Edge Function') }));
    await expect(offline.read(CFG, [])).rejects.toThrow(/Não foi possível falar com o servidor/);
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
