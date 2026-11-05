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
