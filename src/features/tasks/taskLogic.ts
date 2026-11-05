import type { Task } from '@/domain/types';
import { addDays, isWeekend } from '@/lib/time';
import { nowIso } from '@/lib/utils';

export const MAX_MISSION = 3;

export const isOpen = (t: Task) => t.status !== 'concluida' && t.status !== 'cancelada';
export const isOverdue = (t: Task, today: string) => isOpen(t) && !!t.due_date && t.due_date < today;

export function missionFor(tasks: Task[], date: string) {
  return tasks.filter((t) => t.is_mission && t.mission_date === date);
}

export function nextDueDate(t: Task): string | null {
  if (!t.due_date || t.recurrence === 'nenhuma') return null;
  if (t.recurrence === 'diaria') { let d = addDays(t.due_date, 1); while (isWeekend(d)) d = addDays(d, 1); return d; }
  if (t.recurrence === 'semanal') return addDays(t.due_date, 7);
  const [y, m, dd] = t.due_date.split('-').map(Number);
  const nm = m === 12 ? 1 : m + 1, ny = m === 12 ? y + 1 : y;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, '0')}-${String(Math.min(dd, last)).padStart(2, '0')}`;
}

export const withHistory = (t: Pick<Task, 'history'>, action: string, detail?: string) => [...(t.history ?? []), { at: nowIso(), action, detail }];

export function emptyTask(): Omit<Task, 'id' | 'created_at' | 'updated_at'> {
  return { title: '', description: '', institution_id: null, priority: 'media', status: 'a_fazer', due_date: null, category: 'Geral', checklist: [], recurrence: 'nenhuma', is_mission: false, mission_date: null, completed_at: null, history: [] };
}
