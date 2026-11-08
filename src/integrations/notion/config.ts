import type { NotionConfig, Priority, Settings, TaskStatus } from '@/domain/types';

/**
 * Configuração da integração. Os identificadores do workspace (responsável e bases) NÃO ficam no código:
 * vêm só de settings.notion_config, preenchidos na tela Integrações. Sem eles a sincronização não roda
 * (fail-closed) — nunca há valor padrão de workspace compilado no JavaScript.
 */
export const EMPTY_NOTION_CONFIG: NotionConfig = {
  person_id: '',
  person_name: '',
  tasks_data_source_id: '',
  krs_data_source_id: '',
  objectives_data_source_id: '',
  cursors: {},
  last_sync_at: null,
};

/** Campos obrigatórios e o nome que aparece para o usuário. */
export const REQUIRED_NOTION_FIELDS = [
  ['person_id', 'ID do usuário responsável no Notion'],
  ['tasks_data_source_id', 'Data source de Tarefas'],
  ['krs_data_source_id', 'Data source de KRs'],
  ['objectives_data_source_id', 'Data source de Objetivos'],
] as const satisfies readonly (readonly [keyof NotionConfig, string])[];

/** Completa o que estiver salvo com campos vazios — nunca com IDs de algum workspace. */
export function resolveNotionConfig(settings: Pick<Settings, 'notion_config'> | null | undefined): NotionConfig {
  const c = settings?.notion_config ?? {};
  return { ...EMPTY_NOTION_CONFIG, ...c, cursors: { ...(c.cursors ?? {}) } };
}

/** ID do Notion válido = 32 hex depois de normalizado (aceita com hífens, "user://…" ou URL). */
export const isNotionId = (v: string | null | undefined) => !!v && /^[0-9a-f]{32}$/.test(normalizePageId(v));

export type NotionConfigCheck = { ok: true } | { ok: false; missing: string[]; invalid: string[] };
/** Fail-closed: qualquer ID obrigatório ausente ou mal formado impede a sincronização. */
export function checkNotionConfig(cfg: NotionConfig): NotionConfigCheck {
  const missing: string[] = [], invalid: string[] = [];
  for (const [key, label] of REQUIRED_NOTION_FIELDS) {
    const v = String(cfg[key] ?? '').trim();
    if (!v) missing.push(label);
    else if (!isNotionId(v)) invalid.push(label);
  }
  return missing.length || invalid.length ? { ok: false, missing, invalid } : { ok: true };
}
export function describeConfigProblem(c: Exclude<NotionConfigCheck, { ok: true }>): string {
  return [c.missing.length ? `falta: ${c.missing.join(', ')}` : '', c.invalid.length ? `formato inválido: ${c.invalid.join(', ')}` : '']
    .filter(Boolean).join('; ');
}

/** Nomes das propriedades nas bases (verificados no schema). Fixos de propósito: um nome errado não pode ser digitado. */
export const PROPS = {
  tarefas: {
    title: 'TAREFA',
    status: 'STATUS',
    priority: 'PRIORIDADE',
    due_date: 'PRAZO',
    responsible: 'RESPONSÁVEL',
    last_edited: 'ÚLTIMA EDIÇÃO',
    attribution: 'ATRIBUIÇÃO',
  },
  krs: {
    title: 'Resultado Chave (KR)',
    responsible: 'Dono',
    objective: 'Objetivo (O)',
    status: 'Status',
    target: 'Meta',
    current: 'Atual',
    period: 'Período',
    progress: 'Progresso', // fórmula: somente leitura
  },
  objetivos: {
    title: 'Visão',
  },
} as const;

/**
 * Escopo inicial: só itens ativos. O filtro usa o GRUPO do status do Notion (a fazer / em andamento),
 * para que uma opção nova criada nesses grupos chegue e caia em "valor desconhecido" em vez de sumir.
 */
/**
 * Status dos KRs na base do Notion (verificados no schema). Na Central o status do KR é o texto exato do Notion;
 * estes nomes montam as colunas do Kanban. O servidor confere de novo contra o schema vivo antes de escrever.
 */
export const KR_STATUS = {
  a_caminho: 'A caminho',
  em_analise: '??',
  atingiu: 'Concluído (Atingiu)',
  nao_atingiu: [
    'Não Atingiu - Executou e Não chegou',
    'Não Atingiu - Não Foi Executado',
    'Não Atingiu - Prioridade Mudou',
    'Não Atingiu - Faltou Pessoas',
    'Não Atingiu - Meta Mal Calibrada',
  ],
} as const;
export const KR_STATUS_OPTIONS: readonly string[] = [KR_STATUS.a_caminho, KR_STATUS.em_analise, KR_STATUS.atingiu, ...KR_STATUS.nao_atingiu];
export type KrColumn = 'a_caminho' | 'em_analise' | 'atingiu' | 'nao_atingiu';
/** Coluna do Kanban de um status de KR (sem status = "A caminho", o padrão da base). */
export function krColumnOf(status: string | null | undefined): KrColumn {
  const s = (status ?? '').trim();
  if (!s || s === KR_STATUS.a_caminho) return 'a_caminho';
  if (s === KR_STATUS.em_analise) return 'em_analise';
  if (/^conclu/i.test(s)) return 'atingiu';
  if (/^n[ãa]o atingiu/i.test(s)) return 'nao_atingiu';
  return 'a_caminho';
}

/** Opções de ATRIBUIÇÃO das Tarefas no Notion (verificadas no schema), na ordem dos grupos do Notion. */
export const TASK_ATTRIBUTION_OPTIONS = ['70%', '20%', '10%', 'OFF WORK (INDIVIDUAL)'] as const;
/** Ordena como no Notion (opções conhecidas primeiro, na ordem acima) e remove repetidos. */
export function sortAttribution(names: readonly string[] | null | undefined): string[] {
  const rank = (n: string) => { const i = (TASK_ATTRIBUTION_OPTIONS as readonly string[]).indexOf(n); return i < 0 ? 99 : i; };
  return [...new Set((names ?? []).map((n) => n.trim()).filter(Boolean))].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

export const ACTIVE_STATUS_GROUPS = ['to_do', 'in_progress'] as const;

/** Mapeamentos aprovados. Valor fora destas tabelas NUNCA recebe padrão: vai para revisão. */
export const TASK_STATUS_MAP: Record<string, TaskStatus> = {
  'Não iniciada': 'a_fazer',
  'Em andamento': 'em_andamento',
  'Pausada': 'aguardando',
  'Concluída': 'concluida',
  'Cancelada': 'cancelada',
};
export const TASK_PRIORITY_MAP: Record<string, Priority> = {
  'Importante e Urgente': 'urgente',
  'Importante e Não Urgente': 'alta',
  'Não importante e Urgente': 'media',
  'Não importante e Não Urgente': 'baixa',
};

export const NOTION_REF_PREFIX = 'notion:';
export const notionRef = (pageId: string) => `${NOTION_REF_PREFIX}${normalizePageId(pageId)}`;

/** IDs do Notion aparecem com e sem hífens e dentro de URLs; a identidade usa sempre 32 hex minúsculos. */
export function normalizePageId(idOrUrl: string): string {
  // O ID é sempre o final do caminho (URLs com título usam "Titulo-<id>"): descarta ?query/#hash, tira hífens
  // e pega os últimos 32 hex.
  const tail = idOrUrl.trim().toLowerCase().replace(/[?#].*$/, '').replace(/-/g, '');
  const m = tail.match(/[0-9a-f]{32}$/);
  return m ? m[0] : idOrUrl.trim().toLowerCase();
}
/** Mesmo formato para IDs de pessoa ("user://…", com ou sem hífens). */
export const normalizeUserId = normalizePageId;
