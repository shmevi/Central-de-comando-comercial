import { actions } from '@/data/store';
import type { Task } from '@/domain/types';
import { nowIso } from '@/lib/utils';
import { MAX_MISSION, missionFor, nextDueDate, withHistory } from './taskLogic';

export async function toggleComplete(t: Task) {
  if (t.status === 'concluida') {
    return actions.update('tasks', t.id, { status: 'a_fazer', completed_at: null, history: withHistory(t, 'Reaberta') });
  }
  const done = await actions.update('tasks', t.id, { status: 'concluida', completed_at: nowIso(), history: withHistory(t, 'Concluída') });
  const next = nextDueDate(t);
  if (next) {
    const { id: _i, created_at: _c, updated_at: _u, user_id: _us, ...rest } = t;
    await actions.create('tasks', { ...rest, status: 'a_fazer', due_date: next, completed_at: null, is_mission: false, mission_date: null,
      checklist: t.checklist.map((c) => ({ ...c, done: false })), history: [{ at: nowIso(), action: 'Criada por recorrência', detail: `Origem: ${t.title}` }] });
  }
  return done;
}

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
