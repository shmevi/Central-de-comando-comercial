import { describe, it, expect } from 'vitest';
import type { NotionSyncState, Objective, Task } from '@/domain/types';
import { createNotionApiAdapter, toUuid } from './apiAdapter';
import { KR_STATUS, PROPS, krColumnOf } from './config';
import { createMockNotionAdapter, mockData, MOCK_IDS as I, MOCK_NOTION_CONFIG as CFG, MOCK_PEOPLE } from './mockAdapter';
import { applyPush, parseChanges, MAX_PUSH } from './pushCore';
import { planNotionSync } from './plan';
import { stateHash } from './hash';
import { pendingPushes } from './push';
import { handleNotionSync } from './serverHandler';

const fresh = () => { const data = mockData(); return { data, a: createMockNotionAdapter({ data, now: () => '2026-11-08T10:00:00.000Z' }) }; };
const statusOf = (p: { properties: Record<string, any> }, prop: string) => p.properties[prop]?.name;

describe('Envio ao Notion: validação (pushCore)', () => {
  it('tarefa do responsável: grava só o campo pedido e devolve a página minimizada', async () => {
    const { data, a } = fresh();
    const [r] = await applyPush(a, CFG, [{ entity: 'tarefas', page_id: I.t_responsavel_e_outra, fields: { status: 'concluida' }, base: { status: 'em_andamento' } }]);
    expect(r.status).toBe('enviado');
    expect(r.written).toEqual(['status']);
    const page = data.tarefas.find((p) => p.id === I.t_responsavel_e_outra)!;
    expect(statusOf(page, PROPS.tarefas.status)).toBe('Concluída');
    expect(page.properties[PROPS.tarefas.title]).toEqual({ type: 'title', text: '[Demonstração] Atualizar playbook com a equipe' }); // título intacto
    expect(r.page!.last_edited_time).toBe('2026-11-08T10:00:00.000Z');
    expect(r.page!.properties[PROPS.tarefas.responsible]).toEqual({ type: 'people', ids: [CFG.person_id] }); // corresponsável não sai
  });
  it('página de outra pessoa ou sem responsável: recusada, nada gravado e nenhum dado dela na resposta', async () => {
    const { data, a } = fresh();
    const before = JSON.stringify(data);
    const res = await applyPush(a, CFG, [
      { entity: 'tarefas', page_id: I.t_so_outra, fields: { status: 'concluida' }, base: { status: 'a_fazer' } },
      { entity: 'tarefas', page_id: I.t_sem_responsavel, fields: { title: 'x' }, base: { title: 'y' } },
      { entity: 'krs', page_id: I.k_so_outra, fields: { current: 5 }, base: { current: 1 } },
    ]);
    expect(res.map((r) => r.status)).toEqual(['recusado', 'recusado', 'recusado']);
    expect(res.every((r) => !r.page)).toBe(true);
    expect(JSON.stringify(res)).not.toContain('outra pessoa');
    expect(JSON.stringify(data)).toBe(before);
  });
  it('o Notion mudou desde a última sincronização: conflito, nada sobrescrito', async () => {
    const { data, a } = fresh();
    const [r] = await applyPush(a, CFG, [{ entity: 'tarefas', page_id: I.t_responsavel, fields: { priority: 'baixa' }, base: { priority: 'alta' } }]); // Notion está "urgente"
    expect(r.status).toBe('conflito');
    expect(r.conflicts).toEqual(['priority']);
    expect(data.tarefas.find((p) => p.id === I.t_responsavel)!.properties[PROPS.tarefas.priority]).toEqual({ type: 'select', name: 'Importante e Urgente' });
  });
  it('KR: status só das opções da base; meta/atual numéricos', async () => {
    const { data, a } = fresh();
    const bad = await applyPush(a, CFG, [{ entity: 'krs', page_id: I.k_normal, fields: { status: 'Inventado' }, base: { status: 'A caminho' } }]);
    expect(bad[0].status).toBe('recusado');
    const ok = await applyPush(a, CFG, [{ entity: 'krs', page_id: I.k_normal, fields: { status: KR_STATUS.nao_atingiu[3], current: 55 }, base: { status: 'A caminho', current: 40 } }]);
    expect(ok[0].status).toBe('enviado');
    const kr = data.krs.find((p) => p.id === I.k_normal)!;
    expect(statusOf(kr, PROPS.krs.status)).toBe('Não Atingiu - Faltou Pessoas');
    expect(kr.properties[PROPS.krs.current]).toEqual({ type: 'number', value: 55 });
    expect(kr.properties[PROPS.krs.objective]).toEqual({ type: 'relation', ids: [I.o1] }); // objetivo nunca é alterado
    expect(krColumnOf(KR_STATUS.nao_atingiu[3])).toBe('nao_atingiu');
  });
  it('já igual no Notion: não escreve', async () => {
    const { a } = fresh();
    const [r] = await applyPush(a, CFG, [{ entity: 'tarefas', page_id: I.t_responsavel, fields: { priority: 'urgente' }, base: { priority: 'alta' } }]);
    expect(r.status).toBe('sem_mudanca');
  });
  it('pedido malformado é recusado inteiro (campo proibido, ID ruim, lote grande)', () => {
    expect(parseChanges([{ entity: 'tarefas', page_id: I.t_responsavel, fields: { responsible: 'x' }, base: {} }])).toMatch(/não permitido/);
    expect(parseChanges([{ entity: 'krs', page_id: I.k_normal, fields: { objective: 'x' }, base: {} }])).toMatch(/não permitido/);
    expect(parseChanges([{ entity: 'objetivos', page_id: I.o1, fields: { title: 'x' }, base: {} }])).toMatch(/Entidade/);
    expect(parseChanges([{ entity: 'tarefas', page_id: 'abc', fields: { title: 'x' }, base: {} }])).toMatch(/ID/);
    expect(parseChanges(Array.from({ length: MAX_PUSH + 1 }, () => ({ entity: 'tarefas', page_id: I.t_responsavel, fields: { title: 'x' }, base: {} })))).toMatch(/No máximo/);
    expect(parseChanges([])).toMatch(/Nenhuma/);
  });
});

describe('Envio ao Notion: API real (formato do PATCH)', () => {
  it('PATCH /pages/{id} só com as propriedades pedidas', async () => {
    const calls: { method: string; url: string; body: any }[] = [];
    const f = (async (url: string, init: RequestInit = {}) => {
      calls.push({ method: init.method ?? 'GET', url, body: init.body ? JSON.parse(String(init.body)) : null });
      if (url.includes('/data_sources/')) return new Response(JSON.stringify({ properties: {} }));
      return new Response(JSON.stringify({ object: 'page', id: toUuid(I.t_responsavel), last_edited_time: '2026-11-08T10:00:00.000Z', parent: {}, properties: {} }));
    }) as unknown as typeof fetch;
    const a = createNotionApiAdapter({ token: 't', dataSources: { tarefas: CFG.tasks_data_source_id, krs: CFG.krs_data_source_id, objetivos: CFG.objectives_data_source_id }, fetch: f });
    await a.update('tarefas', I.t_responsavel, { [PROPS.tarefas.status]: { type: 'status', name: 'Concluída' }, [PROPS.tarefas.due_date]: { type: 'date', start: '2026-11-12', end: null }, [PROPS.tarefas.title]: { type: 'title', text: 'Novo' } });
    const p = calls.find((c) => c.method === 'PATCH')!;
    expect(p.url).toBe(`https://api.notion.com/v1/pages/${toUuid(I.t_responsavel)}`);
    expect(p.body).toEqual({ properties: {
      STATUS: { status: { name: 'Concluída' } }, PRAZO: { date: { start: '2026-11-12', end: null } },
      TAREFA: { title: [{ type: 'text', text: { content: 'Novo' } }] },
    } });
    expect(calls.filter((c) => c.method !== 'GET' && c.method !== 'PATCH')).toEqual([]); // nada de POST/DELETE
  });
});

describe('Edge Function: modo push', () => {
  const REST = 'https://exemplo.supabase.co';
  const post = (body: unknown) => new Request('https://x/functions/v1/notion-sync', { method: 'POST', headers: { Authorization: 'Bearer eyJ.u.t', apikey: 'sb_publishable_teste' }, body: JSON.stringify(body) });
  const deps = (settings: Record<string, unknown>, access: string | null = CFG.person_id) => {
    const { data, a } = fresh(); let updates = 0;
    const adapter = { ...a, update: (...args: Parameters<typeof a.update>) => { updates++; return a.update(...args); } };
    const f = (async (url: string) => {
      const t = new URL(url).pathname.split('/').pop();
      const rows = t === 'settings' ? [{ id: 's', notion_config: CFG, ...settings }] : t === 'notion_access' ? (access ? [{ user_id: 'u', person_id: access }] : []) : [];
      return new Response(JSON.stringify(rows));
    }) as unknown as typeof fetch;
    return { data, get updates() { return updates; }, d: { env: (k: string) => ({ SUPABASE_URL: REST, NOTION_TOKEN: 'tok' } as Record<string, string>)[k], fetch: f, makeAdapter: () => adapter } };
  };
  const change = { entity: 'tarefas', page_id: I.t_responsavel, fields: { status: 'concluida' }, base: { status: 'a_fazer' } };
  it('sem a escrita autorizada nas Configurações: 403 e nada gravado', async () => {
    for (const s of [{ notion_enabled: true, notion_write_enabled: false }, { notion_enabled: false, notion_write_enabled: true }, {}]) {
      const x = deps(s);
      const r = await handleNotionSync(post({ mode: 'push', changes: [change] }), x.d);
      expect(r.status).toBe(403);
      expect(x.updates).toBe(0);
    }
  });
  it('sem vínculo: 403; pedido malformado: 400 — nada gravado', async () => {
    const x = deps({ notion_enabled: true, notion_write_enabled: true }, null);
    expect((await handleNotionSync(post({ mode: 'push', changes: [change] }), x.d)).status).toBe(403);
    const y = deps({ notion_enabled: true, notion_write_enabled: true });
    expect((await handleNotionSync(post({ mode: 'push', changes: [{ ...change, fields: { 'RESPONSÁVEL': 'x' } }] }), y.d)).status).toBe(400);
    expect(x.updates + y.updates).toBe(0);
  });
  it('autorizado: grava e devolve o resultado por página; responsável é sempre o do vínculo', async () => {
    const x = deps({ notion_enabled: true, notion_write_enabled: true, notion_config: { ...CFG, person_id: MOCK_PEOPLE.outra } });
    const r = await handleNotionSync(post({ mode: 'push', changes: [change, { ...change, page_id: I.t_so_outra, base: { status: 'a_fazer' } }] }), x.d);
    expect(r.status).toBe(200);
    const { mode, results } = await r.json();
    expect(mode).toBe('push');
    expect(results.map((y: any) => y.status)).toEqual(['enviado', 'recusado']); // a de outra pessoa é recusada mesmo com o ID trocado
    expect(x.updates).toBe(1);
  });
});

describe('Pendências de envio (Central → Notion)', () => {
  const st = (over: Partial<NotionSyncState>): NotionSyncState => ({
    id: 's1', user_id: 'u', created_at: '', updated_at: '', entity: 'tarefas', local_id: 't1', local_parent_id: null, notion_page_id: I.t_responsavel,
    notion_parent_id: null, pinned_parent_id: null, synced_hash: 'h', synced_snapshot: { title: 'A', status: 'a_fazer', priority: 'urgente', due_date: null },
    last_notion_edited_time: null, last_central_updated_at: null, last_synced_at: null, last_change_origin: 'notion', echo_edited_time: null,
    sync_status: 'ok', write_count_window: 0, write_window_started_at: null, is_demo: false, ...over,
  } as NotionSyncState);
  const task = (over: Partial<Task>) => ({ id: 't1', title: 'A', status: 'a_fazer', priority: 'urgente', due_date: null, ...over }) as Task;
  it('só os campos que mudaram na Central, com o valor de antes e o novo', () => {
    const [p] = pendingPushes([st({})], [task({ status: 'concluida', due_date: '2026-11-12' })], [], false);
    expect(p.fields).toEqual({ status: 'concluida', due_date: '2026-11-12' });
    expect(p.base).toEqual({ status: 'a_fazer', due_date: null });
    expect(p.changes.map((c) => `${c.label}: ${c.from} → ${c.to}`)).toEqual(['Status: A fazer → Concluída', 'Prazo: — → 12/11/2026']);
  });
  it('nada muda, item em conflito/revisão, demonstração no modo real: não entra', () => {
    expect(pendingPushes([st({})], [task({})], [], false)).toEqual([]);
    expect(pendingPushes([st({ sync_status: 'conflito' })], [task({ status: 'concluida' })], [], false)).toEqual([]);
    expect(pendingPushes([st({ is_demo: true })], [task({ status: 'concluida' })], [], false)).toEqual([]);
  });
  it('KR: meta/atual/status vêm do KR dentro do objetivo; status vazio não é enviado', () => {
    const o = { id: 'o1', title: 'O', key_results: [{ id: 'k1', title: 'KR', start: null, target: 10, current: 7, unit: '', status: null }] } as unknown as Objective;
    const [p] = pendingPushes([st({ entity: 'krs', local_id: 'k1', local_parent_id: 'o1', notion_page_id: I.k_normal, synced_snapshot: { title: 'KR', target: 10, current: 4, status: 'A caminho', period_start: null, period_end: null } })], [], [o], false);
    expect(p.fields).toEqual({ current: 7 });
  });
});

describe('ATRIBUIÇÃO (70% / 20% / 10% / OFF WORK)', () => {
  it('enviar: só opções existentes; grava como multi-select', async () => {
    const { data, a } = fresh();
    const bad = await applyPush(a, CFG, [{ entity: 'tarefas', page_id: I.t_responsavel, fields: { attribution: ['50%'] }, base: { attribution: ['70%'] } }]);
    expect(bad[0].status).toBe('recusado');
    const ok = await applyPush(a, CFG, [{ entity: 'tarefas', page_id: I.t_responsavel, fields: { attribution: ['20%'] }, base: { attribution: ['70%'] } }]);
    expect(ok[0].status).toBe('enviado');
    expect(data.tarefas.find((p) => p.id === I.t_responsavel)!.properties[PROPS.tarefas.attribution]).toEqual({ type: 'multi_select', names: ['20%'] });
  });
  it('tarefa sincronizada antes da atribuição existir: adota a do Notion, sem conflito e sem envio', async () => {
    const page = mockData().tarefas.find((p) => p.id === I.t_responsavel)!;
    const oldSnap = { title: '[Demonstração] Revisar funil de matrículas', status: 'a_fazer', priority: 'urgente', due_date: '2026-11-10' };
    const local = { id: 't1', title: oldSnap.title, status: 'a_fazer', priority: 'urgente', due_date: '2026-11-10', external_ref: `notion:${I.t_responsavel}`, history: [], completed_at: null } as unknown as Task;
    const st = { id: 's1', entity: 'tarefas', local_id: 't1', notion_page_id: I.t_responsavel, synced_hash: await stateHash(oldSnap), synced_snapshot: oldSnap, sync_status: 'ok', is_demo: true } as unknown as NotionSyncState;
    const plan = await planNotionSync({ config: CFG, notion: { tarefas: [page], krs: [], objetivos: [] }, local: { tasks: [local], objectives: [], states: [st], reviews: [] }, isDemo: true, now: '2026-11-08T10:00:00.000Z', newId: () => 'x' });
    expect(plan.reviews).toEqual([]);
    expect(plan.counts.tarefas.conflitos).toBe(0);
    expect(plan.taskUpdates).toEqual([{ id: 't1', patch: { attribution: ['70%'] } }]);
    expect(plan.states[0]).toMatchObject({ sync_status: 'ok', synced_snapshot: { ...oldSnap, attribution: ['70%'] } });
    // E uma base antiga (sem o campo) nunca gera envio de atribuição.
    expect(pendingPushes([st], [{ ...local, attribution: ['10%'] }], [], true)).toEqual([]);
  });
});
