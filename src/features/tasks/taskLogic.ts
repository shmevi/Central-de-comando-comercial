import type { Recurrence, Task, TaskStatus } from '@/domain/types';
import { isFromNotion } from '@/integrations/notion/mapping';
import { TASK_STATUS as TASK_STATUS_LABEL } from '@/domain/labels';
import { addDays, isWeekend } from '@/lib/time';
import { nowIso } from '@/lib/utils';

export const MAX_MISSION = 3;

export const isOpen = (t: Task) => t.status !== 'concluida' && t.status !== 'cancelada';
export const isOverdue = (t: Task, today: string) => isOpen(t) && !!t.due_date && t.due_date < today;

export function missionFor(tasks: Task[], date: string) {
  return tasks.filter((t) => t.is_mission && t.mission_date === date);
}

function step(due: string, r: Recurrence, anchorDay: number): string {
  if (r === 'diaria') { let d = addDays(due, 1); while (isWeekend(d)) d = addDays(d, 1); return d; }
  if (r === 'semanal') return addDays(due, 7);
  const [y, m] = due.split('-').map(Number);
  const nm = m === 12 ? 1 : m + 1, ny = m === 12 ? y + 1 : y;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, '0')}-${String(Math.min(anchorDay, last)).padStart(2, '0')}`;
}

/**
 * Próximo prazo de uma tarefa recorrente. Com `today`, avança até cair depois de hoje
 * (concluir com atraso não gera uma ocorrência já vencida).
 */
export function nextDueDate(t: Pick<Task, 'due_date' | 'recurrence'>, today?: string): string | null {
  if (!t.due_date || t.recurrence === 'nenhuma') return null;
  const anchor = Number(t.due_date.slice(8, 10));
  let d = step(t.due_date, t.recurrence, anchor);
  while (today && d <= today) d = step(d, t.recurrence, anchor);
  return d;
}

/** Campos que acompanham uma mudança de status (data de conclusão e histórico). */
export function statusPatch(t: Task, status: TaskStatus): Partial<Task> {
  if (t.status === status) return {};
  return {
    status,
    completed_at: status === 'concluida' ? nowIso() : null,
    history: withHistory(t, status === 'concluida' ? 'Concluída' : t.status === 'concluida' ? 'Reaberta' : 'Status alterado', `${TASK_STATUS_LABEL[t.status]} → ${TASK_STATUS_LABEL[status]}`),
  };
}

export const withHistory = (t: Pick<Task, 'history'>, action: string, detail?: string) => [...(t.history ?? []), { at: nowIso(), action, detail }];

export function emptyTask(): Omit<Task, 'id' | 'created_at' | 'updated_at'> {
  return { title: '', description: '', institution_id: null, priority: 'media', status: 'a_fazer', due_date: null, category: 'Geral', checklist: [], recurrence: 'nenhuma', is_mission: false, mission_date: null, completed_at: null, history: [] };
}

/** Origem da tarefa: sincronizada do Notion (external_ref "notion:…") ou criada na Central/rotina. */
export type TaskOrigin = 'central' | 'notion';
export const taskOrigin = (t: Pick<Task, 'external_ref'>): TaskOrigin => (isFromNotion(t) ? 'notion' : 'central');
/** Filtro de origem; 'todas' não filtra. Não altera nem duplica dados — só decide o que aparece. */
export const matchesOrigin = (t: Pick<Task, 'external_ref'>, origin: 'todas' | TaskOrigin) => origin === 'todas' || taskOrigin(t) === origin;
