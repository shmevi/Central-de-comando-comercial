import { describe, it, expect } from 'vitest';
import { buildReport, csvSafe, displayValue, toCSV } from './build';

const empty = { tasks: [], routine_blocks: [], interviews: [], feedbacks: [], meetings: [], notes: [] };
describe('relatórios', () => {
  it('diferencia não preenchido de zero', () => {
    const rows = buildReport(['2026-11-05'], empty, '2026-11-05', '15:00', () => true);
    expect(rows.find((r) => r.indicator === 'Blocos concluídos')!.value).toBeNull();
    expect(rows.find((r) => r.indicator === 'Tarefas concluídas')!.value).toBe(0);
    expect(displayValue(null)).toBe('Não preenchido');
  });
  it('rotina não some ao filtrar por instituição', () => {
    const b = { id: 'b', created_at: '', updated_at: '', date: '2026-11-05', start: '12:12', end: '13:00', title: 'X', category: '', status: 'concluido' as const, notes: '', is_break: false, break_exception: false, break_exception_reason: '', institution_id: null };
    const rows = buildReport(['2026-11-05'], { ...empty, routine_blocks: [b] }, '2026-11-05', '15:00', (id) => id === 'inst-x');
    expect(rows.find((r) => r.indicator === 'Blocos concluídos')!.value).toBe(1);
  });
  it('tarefa pessoal do Notion não é pendência de classificação e entra em qualquer escopo', () => {
    const base = { created_at: '2026-11-05T15:00:00.000Z', updated_at: '', description: '', priority: 'alta' as const, status: 'a_fazer' as const, due_date: null, category: 'Geral', checklist: [], recurrence: 'nenhuma' as const, is_mission: false, mission_date: null, completed_at: null, history: [] };
    const notion = { ...base, id: 'n', title: 'Do Notion', institution_id: null, external_ref: 'notion:abc' };
    const solta = { ...base, id: 's', title: 'Sem instituição', institution_id: null, external_ref: null };
    const all = buildReport(['2026-11-05'], { ...empty, tasks: [notion, solta] }, '2026-11-05', '15:00', () => true);
    expect(all.find((r) => r.indicator === 'Tarefas sem instituição')!.value).toBe(1);
    const scoped = buildReport(['2026-11-05'], { ...empty, tasks: [notion, solta] }, '2026-11-05', '15:00', (id) => id === 'inst-x');
    expect(scoped.find((r) => r.indicator === 'Tarefas criadas')!.value).toBe(1); // só a do Notion
  });
  it('CSV neutraliza fórmulas', () => {
    expect(csvSafe('=HYPERLINK("x")')).toBe(`'=HYPERLINK("x")`);
    expect(csvSafe('-1')).toBe(`'-1`);
    expect(csvSafe('Texto')).toBe('Texto');
  });
  it('CSV com BOM e separador ;', () => {
    const csv = toCSV([{ section: 'A', indicator: 'B', value: 1 }], 'Título');
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('"A";"B";"1";""');
  });
});
