import { actions, getItems } from '@/data/store';
import type { Task, TaskStatus } from '@/domain/types';
import { nowIso } from '@/lib/utils';
import { todayISO } from '@/lib/time';
import { MAX_MISSION, missionFor, nextDueDate, statusPatch, withHistory } from './taskLogic';

/** Cria a próxima ocorrência de uma tarefa recorrente, sem duplicar se ela já existir. */
async function spawnNext(t: Task) {
  const next = nextDueDate(t, todayISO());
  if (!next) return;
  const exists = getItems('tasks').some((x) => x.id !== t.id && x.title === t.title && x.recurrence === t.recurrence
    && x.institution_id === t.institution_id && x.due_date === next);
  if (exists) return;
  const { id: _i, created_at: _c, updated_at: _u, user_id: _us, external_ref: _e, ...rest } = t;
  await actions.create('tasks', { ...rest, status: 'a_fazer', due_date: next, completed_at: null, is_mission: false, mission_date: null,
    checklist: t.checklist.map((c) => ({ ...c, done: false })), history: [{ at: nowIso(), action: 'Criada por recorrência', detail: `Origem: ${t.title}` }] });
}

/** Único caminho para mudar o status de uma tarefa (lista, Kanban, formulário). */
export async function setTaskStatus(t: Task, status: TaskStatus, extra: Partial<Task> = {}) {
  const patch = { ...extra, ...statusPatch(t, status) };
  if (patch.history && extra.history) patch.history = [...extra.history, patch.history[patch.history.length - 1]];
  const saved = Object.keys(patch).length ? await actions.update('tasks', t.id, patch) : t;
  if (status === 'concluida' && t.status !== 'concluida') await spawnNext(saved);
  return saved;
}

export const toggleComplete = (t: Task) => setTaskStatus(t, t.status === 'concluida' ? 'a_fazer' : 'concluida');

/** Retorna mensagem de erro se não for possível (limite de 3). */
export async function toggleMission(t: Task, all: Task[], date: string): Promise<string | null> {
  if (t.is_mission && t.mission_date === date) {
    await actions.update('tasks', t.id, { is_mission: false, mission_date: null, history: withHistory(t, 'Removida da missão do dia') });
    return null;
  }
  if (missionFor(all, date).length >= MAX_MISSION) return `A missão do dia aceita no máximo ${MAX_MISSION} tarefas.`;
  await actions.update('tasks', t.id, { is_mission: true, mission_date: date, history: withHistory(t, 'Adicionada à missão do dia') });
  return null;
}
