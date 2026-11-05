import { describe, it, expect } from 'vitest';
import { emptyTask, isOverdue, missionFor, nextDueDate } from './taskLogic';
import type { Task } from '@/domain/types';
const t = (p: Partial<Task>): Task => ({ ...emptyTask(), id: 'x', created_at: '', updated_at: '', title: 'T', ...p });

describe('tarefas', () => {
  it('recorrência diária pula fim de semana', () => {
    expect(nextDueDate(t({ due_date: '2026-11-06', recurrence: 'diaria' }))).toBe('2026-11-09');
    expect(nextDueDate(t({ due_date: '2026-11-05', recurrence: 'semanal' }))).toBe('2026-11-12');
    expect(nextDueDate(t({ due_date: '2026-01-31', recurrence: 'mensal' }))).toBe('2026-02-28');
    expect(nextDueDate(t({ due_date: '2026-11-04', recurrence: 'nenhuma' }))).toBeNull();
  });
  it('atraso só para tarefas abertas', () => {
    expect(isOverdue(t({ due_date: '2026-11-04' }), '2026-11-05')).toBe(true);
    expect(isOverdue(t({ due_date: '2026-11-04', status: 'concluida' }), '2026-11-05')).toBe(false);
  });
  it('missão do dia filtra pela data', () => {
    const list = [t({ id: 'a', is_mission: true, mission_date: '2026-11-05' }), t({ id: 'b', is_mission: true, mission_date: '2026-11-04' })];
    expect(missionFor(list, '2026-11-05').map((x) => x.id)).toEqual(['a']);
  });
});
