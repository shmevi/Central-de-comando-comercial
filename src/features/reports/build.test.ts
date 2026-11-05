import { describe, it, expect } from 'vitest';
import { buildReport, displayValue, toCSV } from './build';

const empty = { tasks: [], routine_blocks: [], interviews: [], feedbacks: [], meetings: [], notes: [] };
describe('relatórios', () => {
  it('diferencia não preenchido de zero', () => {
    const rows = buildReport(['2026-11-05'], empty, '2026-11-05', '15:00', () => true);
    expect(rows.find((r) => r.indicator === 'Blocos concluídos')!.value).toBeNull();
    expect(rows.find((r) => r.indicator === 'Tarefas concluídas')!.value).toBe(0);
    expect(displayValue(null)).toBe('Não preenchido');
  });
  it('CSV com BOM e separador ;', () => {
    const csv = toCSV([{ section: 'A', indicator: 'B', value: 1 }], 'Título');
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('"A";"B";"1";""');
  });
});
