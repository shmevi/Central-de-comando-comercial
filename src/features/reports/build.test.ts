import { describe, it, expect } from 'vitest';
import { buildDaily, buildWeekly, csvSafe, dailyRows, displayValue, toCSV, weeklyRows } from './build';
import type { Objective, ReportEntry, Task } from '@/domain/types';

const empty = { tasks: [] as Task[], routine_blocks: [], notes: [], report_entries: [] as ReportEntry[], objectives: [] as Objective[] };
const task = (p: Partial<Task>): Task => ({
  id: Math.random().toString(36).slice(2), created_at: '2026-11-05T15:00:00.000Z', updated_at: '', title: 'T', description: '', institution_id: null,
  priority: 'media', status: 'a_fazer', due_date: null, category: 'Geral', checklist: [], recurrence: 'nenhuma', is_mission: false,
  mission_date: null, completed_at: null, history: [], ...p,
});
const entry = (p: Partial<ReportEntry>): ReportEntry => ({ id: Math.random().toString(36).slice(2), created_at: '2026-11-05T20:00:00Z', updated_at: '', date: '2026-11-05', kind: 'conquista', text: 'x', institution_id: null, ...p });
// 2026-11-05 15:00 em Recife = 18:00Z
const DONE_AT = '2026-11-05T18:00:00.000Z';

describe('relatório diário', () => {
  it('diferencia não preenchido de zero', () => {
    const r = buildDaily('2026-11-05', empty, '2026-11-05', '15:00', () => true);
    expect(r.summary.rotinaConcluidaMin).toBeNull();
    expect(r.summary.concluidas).toBe(0);
    const rows = dailyRows(r);
    expect(displayValue(rows.find((x) => x.item === 'Rotina concluída')!.value)).toBe('Não preenchido');
    expect(displayValue(rows.find((x) => x.item === 'Anotação')!.value)).toBe('Não preenchido');
    expect(displayValue(0)).toBe('0');
  });
  it('separa concluídas da Central e do Notion', () => {
    const tasks = [task({ title: 'Central', status: 'concluida', completed_at: DONE_AT }), task({ title: 'Do Notion', status: 'concluida', completed_at: DONE_AT, external_ref: 'notion:abc' }),
      task({ title: 'Ontem', status: 'concluida', completed_at: '2026-11-04T18:00:00Z' })];
    const r = buildDaily('2026-11-05', { ...empty, tasks }, '2026-11-05', '15:00', () => true);
    expect(r.doneCentral.map((t) => t.title)).toEqual(['Central']);
    expect(r.doneNotion.map((t) => t.title)).toEqual(['Do Notion']);
    expect(r.summary).toMatchObject({ concluidas: 2, central: 1, notion: 1 });
  });
  it('rotina não some ao filtrar por instituição', () => {
    const b = { id: 'b', created_at: '', updated_at: '', date: '2026-11-05', start: '12:12', end: '13:00', title: 'X', category: '', status: 'concluido' as const, notes: '', is_break: false, break_exception: false, break_exception_reason: '', institution_id: null };
    const r = buildDaily('2026-11-05', { ...empty, routine_blocks: [b] }, '2026-11-05', '15:00', (id) => id === 'inst-x');
    expect(r.summary.rotinaConcluidaMin).toBe(48);
  });
  it('tarefa pessoal do Notion entra em qualquer escopo; outras respeitam a instituição', () => {
    const tasks = [task({ title: 'Notion', status: 'concluida', completed_at: DONE_AT, external_ref: 'notion:a' }), task({ title: 'Outra inst', status: 'concluida', completed_at: DONE_AT, institution_id: 'inst-y' })];
    const r = buildDaily('2026-11-05', { ...empty, tasks }, '2026-11-05', '15:00', (id) => id === 'inst-x');
    expect([...r.doneCentral, ...r.doneNotion].map((t) => t.title)).toEqual(['Notion']);
  });
  it('conquistas, destaques, pendências e anotação final', () => {
    const tasks = [
      task({ title: 'Urgente feita', priority: 'urgente', status: 'concluida', completed_at: DONE_AT }),
      task({ title: 'Vence amanhã', due_date: '2026-11-06' }), task({ title: 'Vence semana que vem', due_date: '2026-11-12' }),
    ];
    const report_entries = [entry({ kind: 'conquista', text: 'Bati a meta' }), entry({ kind: 'anotacao', text: 'Fim do dia' }), entry({ kind: 'conquista', text: 'De ontem', date: '2026-11-04' })];
    const r = buildDaily('2026-11-05', { ...empty, tasks, report_entries }, '2026-11-05', '15:00', () => true);
    expect(r.conquistas.map((e) => e.text)).toEqual(['Bati a meta']);
    expect(r.destaquesAuto.map((t) => t.title)).toEqual(['Urgente feita']);
    expect(r.pendenciasAuto.map((t) => t.title)).toEqual(['Vence amanhã']);
    expect(r.anotacao?.text).toBe('Fim do dia');
  });
});

describe('relatório semanal', () => {
  it('principais concluídas, conquistas, OKRs, pendências e prioridades da próxima semana', () => {
    const tasks = [
      task({ title: 'Feita seg', status: 'concluida', completed_at: '2026-11-02T18:00:00Z', priority: 'baixa' }),
      task({ title: 'Feita qui', status: 'concluida', completed_at: DONE_AT, priority: 'alta' }),
      task({ title: 'Atrasada', due_date: '2026-11-03' }),
      task({ title: 'Próxima semana', due_date: '2026-11-10' }),
    ];
    const objectives: Objective[] = [{ id: 'o', created_at: '', updated_at: '', title: 'Objetivo', institution_id: null, cycle: '2026-T4', owner: '', external_ref: 'notion:o',
      key_results: [{ id: 'k', title: 'KR', start: 0, target: 10, current: 5, unit: '' }] }];
    const report_entries = [entry({ kind: 'conquista', text: 'Semana boa', date: '2026-11-03' }), entry({ kind: 'prioridade', text: 'Campanha', date: '2026-11-09' })];
    const r = buildWeekly('2026-11-05', { ...empty, tasks, objectives, report_entries }, '2026-11-05', () => true);
    expect(r.start).toBe('2026-11-02'); expect(r.nextMonday).toBe('2026-11-09');
    expect(r.principais.map((t) => t.title)).toEqual(['Feita qui', 'Feita seg']);
    expect(r.conquistas.map((e) => e.text)).toEqual(['Semana boa']);
    expect(r.okrs[0].progress).toBe(50);
    expect(r.pendencias.map((t) => t.title)).toEqual(['Atrasada']);
    expect(r.proximaSemana.map((t) => t.title)).toEqual(['Próxima semana']);
    expect(r.prioridades.map((e) => e.text)).toEqual(['Campanha']);
    expect(weeklyRows(r).some((x) => x.section === 'Evolução de OKRs' && x.value === '50%')).toBe(true);
  });
});

describe('exportação', () => {
  it('CSV neutraliza fórmulas', () => {
    expect(csvSafe('=HYPERLINK("x")')).toBe(`'=HYPERLINK("x")`);
    expect(csvSafe('-1')).toBe(`'-1`);
    expect(csvSafe('Texto')).toBe('Texto');
  });
  it('CSV com BOM e separador ;', () => {
    const csv = toCSV([{ section: 'A', item: 'B', value: 1 }], 'Título');
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('"A";"B";"1";""');
  });
});
