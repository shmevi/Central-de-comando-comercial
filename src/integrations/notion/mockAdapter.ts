import type { NotionConfig } from '@/domain/types';
import type { NotionAdapter, NotionPage, NotionPropertyValue, NotionQuery, NotionSource } from './adapter';
import { PROPS, normalizePageId, normalizeUserId } from './config';

/**
 * ADAPTADOR DE DEMONSTRAÇÃO. Não conecta a nenhum workspace real.
 * Os nomes das propriedades são os reais (para exercitar o mesmo mapeamento), mas TODOS os registros
 * são fictícios e identificados como demonstração. Cobre os casos que o sincronizador precisa tratar.
 */
export const MOCK_PEOPLE = {
  responsavel: 'de3aa000000000000000000000000001', // responsável fictício
  outra: 'de3ff000000000000000000000000001',       // outra pessoa fictícia
} as const;

/** Configuração FICTÍCIA para o modo demonstração (nenhum destes IDs existe num workspace real). */
export const MOCK_NOTION_CONFIG: NotionConfig = {
  person_id: MOCK_PEOPLE.responsavel,
  person_name: 'Responsável (demonstração)',
  tasks_data_source_id: 'de3db000000000000000000000000001',
  krs_data_source_id: 'de3db000000000000000000000000002',
  objectives_data_source_id: 'de3db000000000000000000000000003',
  cursors: {},
  last_sync_at: null,
};

const id = (n: number) => `de30000000000000000000000000${String(n).padStart(4, '0')}`;
export const MOCK_IDS = {
  t_responsavel: id(1), t_responsavel_e_outra: id(2), t_so_outra: id(3), t_sem_responsavel: id(4),
  t_status_desconhecido: id(5), t_prioridade_desconhecida: id(6), t_pausada: id(7), t_concluida: id(8),
  o1: id(101), o2: id(102),
  k_normal: id(201), k_responsavel_e_outra: id(202), k_so_outra: id(203), k_sem_objetivo: id(204), k_dois_objetivos: id(205), k_sem_periodo: id(206),
} as const;

const T = PROPS.tarefas, K = PROPS.krs;
const title = (text: string): NotionPropertyValue => ({ type: 'title', text });
const people = (...ids: string[]): NotionPropertyValue => ({ type: 'people', ids });
const status = (name: string, group: 'to_do' | 'in_progress' | 'complete'): NotionPropertyValue => ({ type: 'status', name, group });
const select = (name: string | null): NotionPropertyValue => ({ type: 'select', name });
const date = (start: string | null, end: string | null = null): NotionPropertyValue => ({ type: 'date', start, end });
const num = (value: number | null): NotionPropertyValue => ({ type: 'number', value });
const rel = (...ids: string[]): NotionPropertyValue => ({ type: 'relation', ids });
const EDIT = '2026-11-07T12:00:00.000Z';

function task(pid: string, name: string, who: string[], st: [string, 'to_do' | 'in_progress' | 'complete'], prio: string | null, due: string | null): NotionPage {
  return { id: pid, last_edited_time: EDIT, parent_data_source_id: MOCK_NOTION_CONFIG.tasks_data_source_id, properties: {
    [T.title]: title(`[Demonstração] ${name}`), [T.responsible]: people(...who), [T.status]: status(...st),
    [T.priority]: select(prio), [T.due_date]: date(due), [T.last_edited]: { type: 'last_edited_time', value: EDIT },
  } };
}
function kr(pid: string, name: string, who: string[], objectives: string[], st: [string, 'to_do' | 'in_progress' | 'complete'], target: number | null, current: number | null, period: [string, string] | null, progress: number | null): NotionPage {
  return { id: pid, last_edited_time: EDIT, parent_data_source_id: MOCK_NOTION_CONFIG.krs_data_source_id, properties: {
    [K.title]: title(`[Demonstração] ${name}`), [K.responsible]: people(...who), [K.objective]: rel(...objectives),
    [K.status]: status(...st), [K.target]: num(target), [K.current]: num(current),
    [K.period]: period ? date(period[0], period[1]) : date(null), [K.progress]: { type: 'formula', value: progress },
  } };
}

const M = MOCK_PEOPLE.responsavel, O = MOCK_PEOPLE.outra, I = MOCK_IDS;
export function mockData(): Record<NotionSource, NotionPage[]> {
  return {
    tarefas: [
      task(I.t_responsavel, 'Revisar funil de matrículas', [M], ['Não iniciada', 'to_do'], 'Importante e Urgente', '2026-11-10'),
      task(I.t_responsavel_e_outra, 'Atualizar playbook com a equipe', [O, M], ['Em andamento', 'in_progress'], 'Importante e Não Urgente', null),
      task(I.t_so_outra, 'Tarefa de outra pessoa', [O], ['Não iniciada', 'to_do'], 'Importante e Urgente', null),
      task(I.t_sem_responsavel, 'Tarefa sem responsável', [], ['Não iniciada', 'to_do'], 'Importante e Urgente', null),
      task(I.t_status_desconhecido, 'Status novo no Notion', [M], ['Backlog', 'to_do'], 'Importante e Urgente', null),
      task(I.t_prioridade_desconhecida, 'Prioridade fora da matriz', [M], ['Não iniciada', 'to_do'], 'P1', null),
      task(I.t_pausada, 'Tarefa pausada', [M], ['Pausada', 'in_progress'], 'Não importante e Não Urgente', '2026-11-20'),
      task(I.t_concluida, 'Tarefa concluída (fora do escopo inicial)', [M], ['Concluída', 'complete'], 'Não importante e Urgente', null),
    ],
    krs: [
      kr(I.k_normal, 'KR normal', [M], [I.o1], ['A caminho', 'to_do'], 100, 40, ['2026-10-01', '2026-12-31'], 40),
      kr(I.k_responsavel_e_outra, 'KR do responsável e de outra pessoa', [O, M], [I.o1], ['A caminho', 'to_do'], 10, 3, ['2026-10-01', '2026-12-31'], 30),
      kr(I.k_so_outra, 'KR de outra pessoa', [O], [I.o1], ['A caminho', 'to_do'], 5, 1, null, 20),
      kr(I.k_sem_objetivo, 'KR sem objetivo', [M], [], ['A caminho', 'to_do'], 8, 2, null, 25),
      kr(I.k_dois_objetivos, 'KR ligado a dois objetivos', [M], [I.o1, I.o2], ['A caminho', 'to_do'], 4, 1, null, 25),
      kr(I.k_sem_periodo, 'KR sem período', [M], [I.o2], ['??', 'in_progress'], null, null, null, null),
    ],
    objetivos: [
      { id: I.o1, last_edited_time: EDIT, parent_data_source_id: MOCK_NOTION_CONFIG.objectives_data_source_id, properties: { [PROPS.objetivos.title]: title('[Demonstração] Objetivo compartilhado') } },
      { id: I.o2, last_edited_time: EDIT, parent_data_source_id: MOCK_NOTION_CONFIG.objectives_data_source_id, properties: { [PROPS.objetivos.title]: title('[Demonstração] Segundo objetivo') } },
    ],
  };
}

function matchesQuery(p: NotionPage, q: NotionQuery): boolean {
  const who = p.properties[q.personProperty];
  if (!who || who.type !== 'people' || !who.ids.includes(normalizeUserId(q.personId))) return false;
  if (q.statusProperty && q.statusGroups) {
    const st = p.properties[q.statusProperty];
    if (!st || st.type !== 'status' || !st.group || !q.statusGroups.includes(st.group)) return false;
  }
  if (q.editedAfter && p.last_edited_time <= q.editedAfter) return false;
  return true;
}

const clone = (p: NotionPage): NotionPage => JSON.parse(JSON.stringify(p));

/**
 * `leaky: true` simula uma origem que NÃO aplicou o filtro (bug ou mudança na API),
 * para provar que a barreira 2 do sincronizador segura sozinha.
 */
export function createMockNotionAdapter(opts: { leaky?: boolean; data?: Record<NotionSource, NotionPage[]>; delayMs?: number; pageSize?: number } = {}): NotionAdapter {
  const data = opts.data ?? mockData();
  const wait = () => (opts.delayMs ? new Promise((r) => setTimeout(r, opts.delayMs)) : Promise.resolve());
  return {
    kind: 'mock',
    isDemo: true,
    async query(source, q) {
      await wait();
      // Simula o Notion: base que não existe responde com erro (configuração errada fica visível).
      const expected = source === 'tarefas' ? MOCK_NOTION_CONFIG.tasks_data_source_id : MOCK_NOTION_CONFIG.krs_data_source_id;
      if (normalizePageId(q.dataSourceId) !== expected) throw new Error(`Data source de ${source === 'tarefas' ? 'Tarefas' : 'KRs'} não encontrado no Notion (demonstração).`);
      const all = data[source].filter((p) => opts.leaky || matchesQuery(p, q));
      const size = q.pageSize ?? opts.pageSize ?? 100;
      const start = q.cursor ? Number(q.cursor) : 0;
      const slice = all.slice(start, start + size);
      const next = start + size < all.length ? String(start + size) : null;
      return { pages: slice.map(clone), next_cursor: next, has_more: next !== null };
    },
    async retrieve(source, ids) {
      await wait();
      const want = new Set(ids);
      return data[source].filter((p) => want.has(p.id)).map(clone);
    },
  };
}

export const mockNotionAdapter: NotionAdapter = createMockNotionAdapter({ delayMs: 300, pageSize: 3 });
