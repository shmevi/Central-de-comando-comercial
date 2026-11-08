/**
 * Conversões Notion → Central. Funções puras (sem banco, sem React) para poderem ser testadas isoladamente.
 * Regra geral: valor fora dos mapeamentos aprovados NUNCA recebe padrão — volta como problema para revisão.
 */
import type { KeyResult, Priority, Task, TaskStatus } from '@/domain/types';
import { isValidISODate } from '@/lib/time';
import type { NotionPage, NotionPropertyValue } from './adapter';
import { NOTION_REF_PREFIX, PROPS, TASK_PRIORITY_MAP, TASK_STATUS_MAP, normalizePageId, normalizeUserId, sortAttribution } from './config';

// ---------------------------------------------------------------- leitura tipada de propriedades
const prop = (p: NotionPage, name: string): NotionPropertyValue | undefined => p.properties[name];
export function textOf(v: NotionPropertyValue | undefined): string | null {
  if (!v) return null;
  if (v.type === 'title' || v.type === 'rich_text') return v.text?.trim() || null;
  return null;
}
export function nameOf(v: NotionPropertyValue | undefined): string | null {
  if (!v) return null;
  if (v.type === 'status' || v.type === 'select') return v.name?.trim() || null;
  return null;
}
export function peopleOf(v: NotionPropertyValue | undefined): string[] {
  return v && v.type === 'people' ? v.ids.map(normalizeUserId) : [];
}
export function relationOf(v: NotionPropertyValue | undefined): string[] {
  return v && v.type === 'relation' ? [...new Set(v.ids.map(normalizePageId))].sort() : [];
}
export function numberOf(v: NotionPropertyValue | undefined): number | null {
  if (!v) return null;
  if (v.type === 'number') return v.value != null && Number.isFinite(v.value) ? v.value : null;
  if (v.type === 'formula' && typeof v.value === 'number' && Number.isFinite(v.value)) return v.value;
  return null;
}
export function dateOf(v: NotionPropertyValue | undefined): { start: string | null; end: string | null } {
  if (!v || v.type !== 'date') return { start: null, end: null };
  return { start: isoDay(v.start), end: isoDay(v.end) };
}
/** Só datas reais (yyyy-mm-dd, com ou sem hora). Qualquer outra coisa vira null — nunca uma data inventada. */
export function isoDay(v: string | null | undefined): string | null {
  const d = v?.trim().slice(0, 10) ?? '';
  return /^\d{4}-\d{2}-\d{2}$/.test(d) && isValidISODate(d) ? d : null;
}

// ---------------------------------------------------------------- barreira 2: responsável
/** A página pertence ao responsável? Compara pelo ID estável, nunca pelo nome. Vários responsáveis: basta conter. */
export function isOwnedBy(page: NotionPage, personProperty: string, personId: string): boolean {
  if (!personId) return false;
  const want = normalizeUserId(personId);
  return peopleOf(prop(page, personProperty)).includes(want);
}

// ---------------------------------------------------------------- Tarefas
export type TaskSyncFields = Pick<Task, 'title' | 'status' | 'priority' | 'due_date'> & { attribution: string[] };
/** Nomes de um multi-select (ex.: ATRIBUIÇÃO). */
export function namesOf(v: NotionPropertyValue | undefined): string[] {
  return v && v.type === 'multi_select' ? v.names : [];
}
export interface MapProblem { field: string; value: string | null; message: string }
export type MapResult<T> = { ok: true; fields: T } | { ok: false; problems: MapProblem[]; partial: Partial<T> };

export function mapTask(page: NotionPage): MapResult<TaskSyncFields> {
  const P = PROPS.tarefas;
  const problems: MapProblem[] = [];
  const title = textOf(prop(page, P.title));
  if (!title) problems.push({ field: 'title', value: null, message: 'Tarefa sem título no Notion' });
  const rawStatus = nameOf(prop(page, P.status));
  const status: TaskStatus | undefined = rawStatus ? TASK_STATUS_MAP[rawStatus] : undefined;
  if (!status) problems.push({ field: 'status', value: rawStatus, message: rawStatus ? `Status desconhecido: "${rawStatus}"` : 'Status vazio' });
  const rawPrio = nameOf(prop(page, P.priority));
  const priority: Priority | undefined = rawPrio ? TASK_PRIORITY_MAP[rawPrio] : undefined;
  if (!priority) problems.push({ field: 'priority', value: rawPrio, message: rawPrio ? `Prioridade desconhecida: "${rawPrio}"` : 'Prioridade vazia' });
  // Prazo com intervalo: a Central tem uma data só; usa o início (a mesma coluna date:PRAZO:start da descoberta).
  const due_date = dateOf(prop(page, P.due_date)).start;
  const attribution = sortAttribution(namesOf(prop(page, P.attribution)));
  const partial: Partial<TaskSyncFields> = { ...(title ? { title } : {}), ...(status ? { status } : {}), ...(priority ? { priority } : {}), due_date, attribution };
  if (problems.length) return { ok: false, problems, partial };
  return { ok: true, fields: { title: title!, status: status!, priority: priority!, due_date, attribution } };
}
export const taskSyncFields = (t: Pick<Task, 'title' | 'status' | 'priority' | 'due_date' | 'attribution'>): TaskSyncFields =>
  ({ title: t.title, status: t.status, priority: t.priority, due_date: t.due_date ?? null, attribution: sortAttribution(t.attribution) });

// ---------------------------------------------------------------- KRs
export type KrSyncFields = Required<Pick<KeyResult, 'title' | 'target' | 'current' | 'status' | 'period_start' | 'period_end'>>;
export interface MappedKr { fields: KrSyncFields; objectiveIds: string[]; notion_progress: number | null; notes: { description: string | null; reason: string | null } }

export function mapKr(page: NotionPage): MapResult<MappedKr> {
  const P = PROPS.krs;
  const title = textOf(prop(page, P.title));
  const period = dateOf(prop(page, P.period));
  const fields: Omit<KrSyncFields, 'title'> = {
    // Status do KR fica com o texto exato do Notion (a Central não tem status próprio de KR para mapear).
    status: nameOf(prop(page, P.status)),
    target: numberOf(prop(page, P.target)),
    current: numberOf(prop(page, P.current)),
    period_start: period.start,
    period_end: period.end,
  };
  const mapped = { objectiveIds: relationOf(prop(page, P.objective)), notion_progress: progressOf(prop(page, P.progress)),
    notes: { description: textOf(prop(page, P.description)), reason: textOf(prop(page, P.reason)) } };
  if (!title) return { ok: false, problems: [{ field: 'title', value: null, message: 'KR sem título no Notion' }], partial: { ...mapped, fields: { ...fields, title: '' } } };
  return { ok: true, fields: { ...mapped, fields: { ...fields, title } } };
}
export const krSyncFields = (k: KeyResult): KrSyncFields => ({
  title: k.title, target: k.target ?? null, current: k.current ?? null, status: k.status ?? null,
  period_start: k.period_start ?? null, period_end: k.period_end ?? null,
});

/** Progresso calculado pelo Notion, em 0–100. O adaptador entrega a fórmula já nessa escala; fora dela, descarta. */
export function progressOf(v: NotionPropertyValue | undefined): number | null {
  const n = numberOf(v);
  return n != null && n >= 0 && n <= 100 ? Math.round(n) : null;
}

/** Ciclo do objetivo só quando TODOS os KRs têm período e caem no mesmo trimestre; senão fica vazio (não inventado). */
export function cycleFromPeriods(starts: (string | null | undefined)[]): string {
  if (!starts.length || starts.some((s) => !s)) return '';
  const qs = new Set(starts.map((s) => { const [y, m] = s!.split('-').map(Number); return `${y}-T${Math.ceil(m / 3)}`; }));
  return qs.size === 1 ? [...qs][0] : '';
}

// ---------------------------------------------------------------- identificação na Central
type Refd = { external_ref?: string | null; institution_id?: string | null };
/** Item pessoal vindo do Notion: origem Notion e sem instituição. Só esses ignoram o filtro global. */
export const isPersonalNotion = (x: Refd) => !!x.external_ref?.startsWith(NOTION_REF_PREFIX) && !x.institution_id;
export const isFromNotion = (x: Refd) => !!x.external_ref?.startsWith(NOTION_REF_PREFIX);
