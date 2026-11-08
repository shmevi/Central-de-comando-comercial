import { describe, it, expect } from 'vitest';
import type { NotionSyncState, Objective, ReviewQueueItem, Task } from '@/domain/types';
import { queryAll, type NotionPage } from './adapter';
import { ACTIVE_STATUS_GROUPS, EMPTY_NOTION_CONFIG, PROPS, checkNotionConfig, normalizePageId, notionRef, resolveNotionConfig } from './config';
import { canonicalJson, stateHash } from './hash';
import { cycleFromPeriods, isOwnedBy, isPersonalNotion, mapKr, mapTask } from './mapping';
import { createMockNotionAdapter, mockData, MOCK_IDS as I, MOCK_NOTION_CONFIG, MOCK_PEOPLE } from './mockAdapter';
import { planNotionSync, threeWay, type PlanInput, type SyncPlan } from './plan';
import { scopeMatches, scopeMatchesItem } from '@/app/scope';

const cfg = MOCK_NOTION_CONFIG; // IDs fictícios: nenhum ID real de workspace nos testes
const NOW = '2026-11-07T15:00:00.000Z';
let seq = 0;
const newId = () => `local-${++seq}`;

/** Simula o orquestrador: consulta com filtro (ou sem, se `leaky`), busca os Objetivos e planeja. */
async function run(opts: { leaky?: boolean; data?: ReturnType<typeof mockData>; local?: Partial<PlanInput['local']> } = {}): Promise<SyncPlan> {
  const a = createMockNotionAdapter({ leaky: opts.leaky, data: opts.data, pageSize: 2 });
  const q = { personId: cfg.person_id, statusGroups: ACTIVE_STATUS_GROUPS };
  const tarefas = await queryAll(a, 'tarefas', { ...q, dataSourceId: cfg.tasks_data_source_id, personProperty: PROPS.tarefas.responsible, statusProperty: PROPS.tarefas.status });
  const krs = await queryAll(a, 'krs', { ...q, dataSourceId: cfg.krs_data_source_id, personProperty: PROPS.krs.responsible, statusProperty: PROPS.krs.status });
  const objetivos = await a.retrieve('objetivos', [I.o1, I.o2]);
  return planNotionSync({
    config: cfg, isDemo: true, now: NOW, newId,
    notion: { tarefas, krs, objetivos },
    local: { tasks: [], objectives: [], states: [], reviews: [], ...opts.local },
  });
}
const ids = (xs: { external_ref?: string | null }[]) => xs.map((x) => x.external_ref);
const ts = (x: Partial<Task> & Pick<Task, 'id'>): Task => ({ created_at: '', updated_at: '', title: '', description: '', institution_id: null, priority: 'media', status: 'a_fazer', due_date: null, category: 'Geral', checklist: [], recurrence: 'nenhuma', is_mission: false, mission_date: null, completed_at: null, history: [], ...x });
const st = (x: Partial<NotionSyncState> & Pick<NotionSyncState, 'notion_page_id' | 'entity'>): NotionSyncState => ({ id: `st-${x.notion_page_id}`, created_at: '', updated_at: '', local_id: null, local_parent_id: null, notion_parent_id: null, pinned_parent_id: null, synced_hash: null, synced_snapshot: null, last_notion_edited_time: null, last_central_updated_at: null, last_synced_at: null, last_change_origin: null, echo_edited_time: null, sync_status: 'ok', write_count_window: 0, write_window_started_at: null, ...x });

describe('Notion: configuração e IDs', () => {
  it('normaliza IDs de página e de pessoa (com hífens, URL com título e query, user://)', () => {
    // IDs fictícios no mesmo formato do Notion
    expect(normalizePageId('0123abcd-4567-89ef-0123-456789abcdef')).toBe('0123abcd456789ef0123456789abcdef');
    expect(normalizePageId('https://app.notion.com/p/exemplo/PAGINA-DE-TESTE-fedcba9876543210fedcba9876543210?pvs=204')).toBe('fedcba9876543210fedcba9876543210');
    expect(normalizePageId('https://app.notion.com/p/ATIVIDADE-0123abcd456789ef0123456789abcdef')).toBe('0123abcd456789ef0123456789abcdef'); // título termina em letra hex
    expect(normalizePageId('user://de3aa000-0000-0000-0000-000000000001')).toBe('de3aa000000000000000000000000001');
    expect(notionRef('0123abcd-4567-89ef-0123-456789abcdef')).toBe('notion:0123abcd456789ef0123456789abcdef');
    for (const v of Object.values(I)) expect(v).toMatch(/^[0-9a-f]{32}$/);
  });
  it('sem configuração salva NÃO existe valor padrão de workspace (fail-closed)', () => {
    const empty = resolveNotionConfig({});
    for (const k of ['person_id', 'tasks_data_source_id', 'krs_data_source_id', 'objectives_data_source_id'] as const) expect(empty[k]).toBe('');
    expect(empty).toEqual(EMPTY_NOTION_CONFIG);
    expect(resolveNotionConfig({ notion_config: { last_sync_at: NOW } }).last_sync_at).toBe(NOW);
  });
  it('configuração incompleta ou mal formada bloqueia a sincronização', () => {
    expect(checkNotionConfig(cfg).ok).toBe(true);
    const sem = checkNotionConfig({ ...cfg, krs_data_source_id: '' });
    expect(sem.ok).toBe(false);
    expect(!sem.ok && sem.missing).toEqual(['Data source de KRs']);
    const ruim = checkNotionConfig({ ...cfg, person_id: 'Fulano de Tal' }); // nome no lugar do ID
    expect(!ruim.ok && ruim.invalid).toEqual(['ID do usuário responsável no Notion']);
    expect(checkNotionConfig(EMPTY_NOTION_CONFIG).ok).toBe(false);
  });
});

describe('Notion: filtro do responsável (pelo ID estável)', () => {
  const page = (who: string[]): NotionPage => ({ id: 'x', last_edited_time: NOW, properties: { [PROPS.tarefas.responsible]: { type: 'people', ids: who } } });
  it('casos da regra de escopo', () => {
    expect(isOwnedBy(page([MOCK_PEOPLE.responsavel]), PROPS.tarefas.responsible, cfg.person_id)).toBe(true);
    expect(isOwnedBy(page([MOCK_PEOPLE.outra, MOCK_PEOPLE.responsavel]), PROPS.tarefas.responsible, cfg.person_id)).toBe(true);
    expect(isOwnedBy(page([MOCK_PEOPLE.outra]), PROPS.tarefas.responsible, cfg.person_id)).toBe(false);
    expect(isOwnedBy(page([]), PROPS.tarefas.responsible, cfg.person_id)).toBe(false);
    expect(isOwnedBy(page(['de3aa000-0000-0000-0000-000000000001']), PROPS.tarefas.responsible, cfg.person_id)).toBe(true); // com hífens
    expect(isOwnedBy(page([MOCK_PEOPLE.responsavel]), PROPS.tarefas.responsible, '')).toBe(false); // sem ID configurado: ninguém
  });
  it('o nome nunca é usado: propriedade de texto com o nome do responsável não conta', () => {
    const p: NotionPage = { id: 'x', last_edited_time: NOW, properties: { [PROPS.tarefas.responsible]: { type: 'rich_text', text: cfg.person_name } } };
    expect(isOwnedBy(p, PROPS.tarefas.responsible, cfg.person_id)).toBe(false);
  });
  it('barreira 1: a consulta já chega filtrada (e recusa consulta sem responsável ou sem base)', async () => {
    const a = createMockNotionAdapter();
    const got = await queryAll(a, 'tarefas', { dataSourceId: cfg.tasks_data_source_id, personId: cfg.person_id, personProperty: PROPS.tarefas.responsible, statusProperty: PROPS.tarefas.status, statusGroups: ACTIVE_STATUS_GROUPS });
    expect(got.map((p) => p.id)).not.toContain(I.t_so_outra);
    expect(got.map((p) => p.id)).not.toContain(I.t_sem_responsavel);
    expect(got.map((p) => p.id)).not.toContain(I.t_concluida); // fora do escopo inicial (só ativos)
    await expect(queryAll(a, 'tarefas', { dataSourceId: cfg.tasks_data_source_id, personId: '', personProperty: PROPS.tarefas.responsible })).rejects.toThrow(/responsável/);
    await expect(queryAll(a, 'tarefas', { dataSourceId: '', personId: cfg.person_id, personProperty: PROPS.tarefas.responsible })).rejects.toThrow(/data source/);
    await expect(queryAll(a, 'tarefas', { dataSourceId: cfg.krs_data_source_id, personId: cfg.person_id, personProperty: PROPS.tarefas.responsible })).rejects.toThrow(/não encontrado/);
  });
  it('barreira 2: mesmo se a origem não filtrar, nada de outra pessoa entra, vai para revisão ou aparece no log', async () => {
    const plan = await run({ leaky: true });
    const allRefs = [...ids(plan.taskCreates), ...ids(plan.objectiveCreates.flatMap((o) => o.key_results))];
    for (const outsider of [I.t_so_outra, I.t_sem_responsavel, I.k_so_outra]) {
      expect(allRefs).not.toContain(notionRef(outsider));
      expect(plan.reviews.map((r) => r.external_id)).not.toContain(outsider);
      expect(plan.logs.map((l) => l.external_id)).not.toContain(outsider);
      expect(plan.states.map((s) => s.notion_page_id)).not.toContain(outsider);
      expect(JSON.stringify(plan)).not.toContain(outsider);
    }
    expect(plan.counts.fora_do_escopo).toBe(3);
  });
});

describe('Notion: página de outra base', () => {
  it('é recusada mesmo sendo do responsável', async () => {
    const data = mockData();
    data.tarefas.find((p) => p.id === I.t_responsavel)!.parent_data_source_id = 'de3db0000000000000000000000000ff';
    const plan = await run({ data });
    expect(ids(plan.taskCreates)).not.toContain(notionRef(I.t_responsavel));
    expect(JSON.stringify(plan)).not.toContain(I.t_responsavel);
  });
});

describe('Notion: mapeamento de tarefas', () => {
  const data = mockData();
  const pg = (id: string) => data.tarefas.find((p) => p.id === id)!;
  it('status e prioridade aprovados', () => {
    const r = mapTask(pg(I.t_responsavel));
    expect(r.ok && r.fields).toEqual({ title: '[Demonstração] Revisar funil de matrículas', status: 'a_fazer', priority: 'urgente', due_date: '2026-11-10', attribution: ['70%'] });
    const p = mapTask(pg(I.t_pausada));
    expect(p.ok && [p.fields.status, p.fields.priority, p.fields.attribution]).toEqual(['aguardando', 'baixa', ['70%', '10%']]);
    const e = mapTask(pg(I.t_responsavel_e_outra));
    expect(e.ok && [e.fields.status, e.fields.priority]).toEqual(['em_andamento', 'alta']);
  });
  it('valor desconhecido nunca recebe padrão', () => {
    const s = mapTask(pg(I.t_status_desconhecido));
    expect(s.ok).toBe(false);
    expect(!s.ok && s.problems.map((x) => x.field)).toEqual(['status']);
    expect(!s.ok && s.partial.status).toBeUndefined();
    const p = mapTask(pg(I.t_prioridade_desconhecida));
    expect(!p.ok && p.problems[0].message).toMatch(/P1/);
    expect(!p.ok && p.partial.priority).toBeUndefined();
  });
});

describe('Notion: plano de importação (primeira leitura)', () => {
  it('tarefas: external_ref notion:<id>, instituição null, nada inventado', async () => {
    const plan = await run();
    expect(ids(plan.taskCreates).sort()).toEqual([I.t_responsavel, I.t_responsavel_e_outra, I.t_pausada].map(notionRef).sort());
    for (const t of plan.taskCreates) {
      expect(t.institution_id).toBeNull();
      expect(t.is_demo).toBe(true);
      expect(t.description).toBe('');
    }
    const kinds = plan.reviews.map((r) => [r.external_id, r.kind]);
    expect(kinds).toContainEqual([I.t_status_desconhecido, 'valor_desconhecido']);
    expect(kinds).toContainEqual([I.t_prioridade_desconhecida, 'valor_desconhecido']);
    expect(plan.reviews.some((r) => r.kind === 'instituicao')).toBe(false); // instituição não é mais motivo de revisão
  });
  it('KRs agrupados pelo Objetivo; cada KR mantém o próprio external_ref; só KRs do responsável', async () => {
    const plan = await run({ leaky: true });
    const o1 = plan.objectiveCreates.find((o) => o.external_ref === notionRef(I.o1))!;
    expect(o1.institution_id).toBeNull();
    expect(o1.title).toBe('[Demonstração] Objetivo compartilhado');
    expect(ids(o1.key_results).sort()).toEqual([I.k_normal, I.k_responsavel_e_outra].map(notionRef).sort()); // sem o KR da outra pessoa
    const k = o1.key_results.find((x) => x.external_ref === notionRef(I.k_normal))!;
    expect(k).toMatchObject({ start: null, target: 100, current: 40, status: 'A caminho', period_start: '2026-10-01', period_end: '2026-12-31', notion_progress: 40 });
    expect(o1.cycle).toBe('2026-T4');
    const o2 = plan.objectiveCreates.find((o) => o.external_ref === notionRef(I.o2))!;
    expect(ids(o2.key_results)).toEqual([notionRef(I.k_sem_periodo)]);
    expect(o2.cycle).toBe(''); // KR sem período: ciclo não inventado
    const states = new Map(plan.states.map((s) => [s.notion_page_id, s]));
    expect(states.get(I.k_normal)).toMatchObject({ entity: 'krs', local_parent_id: o1.id, notion_parent_id: I.o1, local_id: k.id });
  });
  it('KR sem Objetivo e KR com dois Objetivos vão para a fila (nenhum Objetivo artificial, nenhuma escolha silenciosa)', async () => {
    const plan = await run();
    const all = plan.objectiveCreates.flatMap((o) => ids(o.key_results));
    expect(all).not.toContain(notionRef(I.k_sem_objetivo));
    expect(all).not.toContain(notionRef(I.k_dois_objetivos));
    expect(plan.objectiveCreates).toHaveLength(2);
    expect(plan.reviews.find((r) => r.external_id === I.k_sem_objetivo)?.kind).toBe('kr_sem_objetivo');
    const multi = plan.reviews.find((r) => r.external_id === I.k_dois_objetivos)!;
    expect(multi.kind).toBe('kr_multiplos_objetivos');
    expect((multi.payload.objectives as { id: string }[]).map((o) => o.id).sort()).toEqual([I.o1, I.o2].sort());
  });
  it('KR com dois Objetivos entra no Objetivo escolhido na revisão', async () => {
    const plan = await run({ local: { states: [st({ entity: 'krs', notion_page_id: I.k_dois_objetivos, pinned_parent_id: I.o2 })] } });
    const o2 = plan.objectiveCreates.find((o) => o.external_ref === notionRef(I.o2))!;
    expect(ids(o2.key_results)).toContain(notionRef(I.k_dois_objetivos));
    expect(plan.reviews.some((r) => r.external_id === I.k_dois_objetivos)).toBe(false);
  });
});

describe('Notion: deduplicação, atualização e conflitos (três vias)', () => {
  it('threeWay', () => {
    expect(threeWay('b', 'x', 'x')).toBe('igual');
    expect(threeWay('b', 'n', 'b')).toBe('notion');
    expect(threeWay('b', 'b', 'c')).toBe('central');
    expect(threeWay('b', 'n', 'c')).toBe('conflito');
    expect(threeWay(null, 'n', 'c')).toBe('conflito');
  });

  async function firstImport() {
    const plan = await run();
    const tasks = plan.taskCreates.map((t) => ts({ ...t }));
    const objectives = plan.objectiveCreates.map((o): Objective => ({ ...o, created_at: '', updated_at: '' }));
    const states = plan.states.map((s) => st({ ...s }));
    const reviews = plan.reviews.map((r, i): ReviewQueueItem => ({ ...r, id: `r${i}`, created_at: '', updated_at: '' }));
    return { tasks, objectives, states, reviews };
  }

  it('segunda leitura sem mudanças: nada criado, nada duplicado, nenhuma revisão repetida', async () => {
    const local = await firstImport();
    const plan = await run({ local });
    expect(plan.taskCreates).toHaveLength(0);
    expect(plan.objectiveCreates).toHaveLength(0);
    expect(plan.taskUpdates).toHaveLength(0);
    expect(plan.objectiveUpdates).toHaveLength(0);
    expect(plan.reviews).toHaveLength(0); // pendências abertas não são duplicadas
    expect(plan.counts.tarefas.sem_mudanca).toBe(3);
  });
  it('título nunca é identidade: mesma página com título novo atualiza, não cria outra', async () => {
    const local = await firstImport();
    const data = mockData();
    const p = data.tarefas.find((x) => x.id === I.t_responsavel)!;
    p.properties[PROPS.tarefas.title] = { type: 'title', text: 'Título novo' };
    p.properties[PROPS.tarefas.status] = { type: 'status', name: 'Em andamento', group: 'in_progress' };
    const plan = await run({ data, local });
    expect(plan.taskCreates).toHaveLength(0);
    const u = plan.taskUpdates.find((x) => x.id === local.tasks.find((t) => t.external_ref === notionRef(I.t_responsavel))!.id)!;
    expect(u.patch).toMatchObject({ title: 'Título novo', status: 'em_andamento' });
    expect(u.patch.priority).toBeUndefined(); // só campos alterados
  });
  it('só a Central mudou: não sobrescreve, marca pendente de envio', async () => {
    const local = await firstImport();
    const t = local.tasks.find((x) => x.external_ref === notionRef(I.t_responsavel))!;
    t.priority = 'baixa';
    const plan = await run({ local });
    expect(plan.taskUpdates).toHaveLength(0);
    expect(plan.states.find((s) => s.notion_page_id === I.t_responsavel)?.sync_status).toBe('pendente_push');
  });
  it('os dois lados mudaram o mesmo campo: conflito na fila, nada sobrescrito', async () => {
    const local = await firstImport();
    local.tasks.find((x) => x.external_ref === notionRef(I.t_responsavel))!.title = 'Editado na Central';
    const data = mockData();
    data.tarefas.find((x) => x.id === I.t_responsavel)!.properties[PROPS.tarefas.title] = { type: 'title', text: 'Editado no Notion' };
    const plan = await run({ data, local });
    expect(plan.taskUpdates).toHaveLength(0);
    const c = plan.reviews.find((r) => r.kind === 'conflito')!;
    expect(c.external_id).toBe(I.t_responsavel);
    expect(c.payload).toMatchObject({ fields: ['title'], notion: { title: 'Editado no Notion' }, central: { title: 'Editado na Central' } });
  });
  it('tarefa apagada na Central não é recriada', async () => {
    const local = await firstImport();
    const plan = await run({ local: { ...local, tasks: local.tasks.filter((t) => t.external_ref !== notionRef(I.t_responsavel)) } });
    expect(ids(plan.taskCreates)).not.toContain(notionRef(I.t_responsavel));
    expect(plan.states.find((s) => s.notion_page_id === I.t_responsavel)?.sync_status).toBe('removido_na_central');
  });
  it('página que sumiu do Notion ou mudou de responsável: só marca o estado, não apaga na Central', async () => {
    const local = await firstImport();
    const data = mockData();
    data.tarefas.find((x) => x.id === I.t_responsavel)!.properties[PROPS.tarefas.responsible] = { type: 'people', ids: [MOCK_PEOPLE.outra] };
    const a = createMockNotionAdapter({ data, leaky: true });
    const tarefas = (await queryAll(a, 'tarefas', { dataSourceId: cfg.tasks_data_source_id, personId: cfg.person_id, personProperty: PROPS.tarefas.responsible })).filter((p) => p.id !== I.t_pausada);
    const plan = await planNotionSync({ config: cfg, isDemo: true, now: NOW, newId, notion: { tarefas, krs: [], objetivos: [] }, missing: [I.t_pausada], local });
    expect(plan.states.find((s) => s.notion_page_id === I.t_responsavel)?.sync_status).toBe('fora_do_escopo');
    expect(plan.states.find((s) => s.notion_page_id === I.t_pausada)?.sync_status).toBe('removido_no_notion');
    expect(plan.taskUpdates).toHaveLength(0);
  });
  it('KR que mudou de Objetivo no Notion é movido (mesmo ID local), sem duplicar', async () => {
    const local = await firstImport();
    const data = mockData();
    data.krs.find((x) => x.id === I.k_normal)!.properties[PROPS.krs.objective] = { type: 'relation', ids: [I.o2] };
    const plan = await run({ data, local });
    const o1 = local.objectives.find((o) => o.external_ref === notionRef(I.o1))!;
    const o2 = local.objectives.find((o) => o.external_ref === notionRef(I.o2))!;
    const krId = o1.key_results.find((k) => k.external_ref === notionRef(I.k_normal))!.id;
    const p1 = plan.objectiveUpdates.find((u) => u.id === o1.id)!.patch.key_results!;
    const p2 = plan.objectiveUpdates.find((u) => u.id === o2.id)!.patch.key_results!;
    expect(ids(p1)).not.toContain(notionRef(I.k_normal));
    expect(p2.find((k) => k.external_ref === notionRef(I.k_normal))?.id).toBe(krId);
  });
  it('disjuntor: escritas demais no mesmo item suspendem o item', async () => {
    const local = await firstImport();
    const s = local.states.find((x) => x.notion_page_id === I.t_responsavel)!;
    s.write_count_window = 3; s.write_window_started_at = '2026-11-07T14:55:00.000Z';
    const data = mockData();
    data.tarefas.find((x) => x.id === I.t_responsavel)!.properties[PROPS.tarefas.title] = { type: 'title', text: 'De novo' };
    const plan = await run({ data, local });
    expect(plan.taskUpdates).toHaveLength(0);
    expect(plan.states.find((x) => x.notion_page_id === I.t_responsavel)?.sync_status).toBe('suspenso');
    // passada a janela, o item volta a sincronizar sozinho
    s.sync_status = 'suspenso'; s.write_window_started_at = '2026-11-07T14:40:00.000Z';
    const later = await run({ data, local });
    expect(later.taskUpdates).toHaveLength(1);
    expect(later.states.find((x) => x.notion_page_id === I.t_responsavel)).toMatchObject({ sync_status: 'ok', write_count_window: 1 });
  });
});

describe('Notion: hash determinístico', () => {
  it('mesmo estado semântico → mesmo hash; mudança real → hash diferente', async () => {
    const a = await stateHash({ title: 'Café', status: 'a_fazer', due_date: null, priority: 'alta' });
    const b = await stateHash({ priority: 'alta', due_date: undefined, status: 'a_fazer', title: '  Café ' }); // ordem, espaços, NFD, undefined
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await stateHash({ title: 'Café', status: 'concluida', due_date: null, priority: 'alta' })).not.toBe(a);
    expect(canonicalJson({ b: [1, -0], a: '' })).toBe('{"a":null,"b":[1,0]}');
  });
});

describe('Notion: OKR e ciclo', () => {
  it('ciclo só quando todos os KRs caem no mesmo trimestre', () => {
    expect(cycleFromPeriods(['2026-10-01', '2026-12-15'])).toBe('2026-T4');
    expect(cycleFromPeriods(['2026-08-01', '2026-10-01'])).toBe('');
    expect(cycleFromPeriods(['2026-10-01', null])).toBe('');
    expect(cycleFromPeriods([])).toBe('');
  });
  it('KR sem valor inicial fica com start null (o Notion não tem inicial)', () => {
    const r = mapKr(mockData().krs.find((p) => p.id === I.k_normal)!);
    expect(r.ok).toBe(true);
    expect(r.ok && 'start' in r.fields.fields).toBe(false);
  });
});

describe('Filtro global de instituição', () => {
  const notion = { institution_id: null, external_ref: 'notion:abc' };
  const normalSem = { institution_id: null, external_ref: null };
  const normalCom = { institution_id: 'cppem', external_ref: null };
  const notionComInst = { institution_id: 'cppem', external_ref: 'notion:def' };
  it('item pessoal do Notion aparece em qualquer filtro', () => {
    for (const s of ['all', 'none', 'cppem', 'unicive']) expect(scopeMatchesItem(s, notion)).toBe(true);
    expect(isPersonalNotion(notion)).toBe(true);
  });
  it('registros normais seguem a regra antiga', () => {
    expect(scopeMatchesItem('cppem', normalSem)).toBe(false);
    expect(scopeMatchesItem('none', normalSem)).toBe(true);
    expect(scopeMatchesItem('cppem', normalCom)).toBe(true);
    expect(scopeMatchesItem('unicive', normalCom)).toBe(false);
    expect(scopeMatches('unicive', 'cppem')).toBe(false);
  });
  it('item do Notion que o usuário classificou numa instituição volta a obedecer ao filtro', () => {
    expect(scopeMatchesItem('unicive', notionComInst)).toBe(false);
    expect(scopeMatchesItem('cppem', notionComInst)).toBe(true);
  });
});
