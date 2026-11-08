import { describe, it, expect } from 'vitest';
import { addMonths, average3, conversion, fmtBRL, fmtDeltaPct, fmtMonth, fmtPct, fmtPp, monthKey, overflow, parseBRL, periodMonths, series, teamAverage, ticket, totals, variation } from './metrics';

const e = (month: string, leads: number, enrollments: number, revenue: number | null = null, person_id = 'p1', institution_id = 'i1') => ({ month, leads, enrollments, revenue, person_id, institution_id });

describe('Feedback em números — cálculos', () => {
  it('conversão e ticket; divisor zero e valor vazio → null ("—")', () => {
    expect(conversion({ leads: 40, enrollments: 10 })).toBe(0.25);
    expect(conversion({ leads: 0, enrollments: 0 })).toBeNull();
    expect(conversion({ leads: 0, enrollments: 3 })).toBeNull();
    expect(ticket({ enrollments: 10, revenue: 12000.5 })).toBeCloseTo(1200.05);
    expect(ticket({ enrollments: 0, revenue: 500 })).toBeNull();
    expect(ticket({ enrollments: 4, revenue: null })).toBeNull();
    expect(conversion(null)).toBeNull();
    expect(fmtPct(null)).toBe('—');
    expect(fmtBRL(null)).toBe('—');
  });
  it('matrículas > leads: calcula e só sinaliza', () => {
    expect(conversion({ leads: 3, enrollments: 5 })).toBeCloseTo(5 / 3);
    expect(overflow({ leads: 3, enrollments: 5 })).toBe(true);
    expect(overflow({ leads: 5, enrollments: 5 })).toBe(false);
  });
  it('mês vazio fica vazio (nunca zero)', () => {
    const list = [e('2026-10-01', 10, 2, 1000)];
    expect(totals(list, '2026-09-01')).toBeNull();
    expect(series(list, ['2026-09-01', '2026-10-01']).map((x) => x && x.leads)).toEqual([null, 10]);
  });
  it('soma de vários lançamentos no mês; um valor vazio deixa o valor total vazio', () => {
    const list = [e('2026-10-01', 10, 2, 1000, 'p1', 'i1'), e('2026-10-01', 30, 3, 2000, 'p1', 'i2')];
    expect(totals(list, '2026-10-01')).toEqual({ month: '2026-10-01', entries: 2, leads: 40, enrollments: 5, revenue: 3000 });
    expect(conversion(totals(list, '2026-10-01'))).toBe(0.125); // ponderada, não média de taxas
    expect(totals([...list, e('2026-10-01', 1, 1, null, 'p1', 'i3')], '2026-10-01')!.revenue).toBeNull();
  });
  it('arredondamento e formato pt-BR', () => {
    expect(fmtPct(1 / 3)).toBe('33,3%');
    expect(fmtPct(2 / 3)).toBe('66,7%');
    expect(fmtPct(0.25)).toBe('25,0%');
    expect(fmtPct(0.0005)).toBe('0,1%');
    expect(fmtBRL(1234.5)).toBe('R$ 1.234,50');
    expect(fmtBRL(1000 / 3)).toBe('R$ 333,33');
    expect(fmtMonth('2026-03-01')).toBe('03/2026');
    expect(fmtPp(5.04)).toBe('+5,0 p.p.');
    expect(fmtPp(-2.25)).toBe('−2,3 p.p.');
    expect(fmtPp(0)).toBe('0,0 p.p.');
    expect(fmtDeltaPct(10)).toBe('+10,0%');
  });
  it('meses: chave, soma e período (6 fechados + atual)', () => {
    expect(monthKey('2026-11-08')).toBe('2026-11-01');
    expect(addMonths('2026-01-01', -1)).toBe('2025-12-01');
    expect(addMonths('2026-11-01', 2)).toBe('2027-01-01');
    expect(periodMonths('2026-11-08')).toEqual(['2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01', '2026-11-01']);
  });
  it('variação mês a mês: p.p. na conversão, % no ticket; sem base → null', () => {
    const v = variation(totals([e('2026-10-01', 40, 12, 12000)], '2026-10-01'), totals([e('2026-09-01', 40, 10, 10000)], '2026-09-01'));
    expect(v.conversionPp).toBeCloseTo(5);
    expect(v.ticketPct).toBeCloseTo(0);
    expect(variation(totals([e('2026-10-01', 40, 12)], '2026-10-01'), null)).toEqual({ conversionPp: null, ticketPct: null });
    expect(variation(totals([e('2026-10-01', 0, 0)], '2026-10-01'), totals([e('2026-09-01', 10, 1)], '2026-09-01')).conversionPp).toBeNull();
  });
  it('média de 3 meses: só meses com lançamento, ponderada', () => {
    const list = [e('2026-08-01', 10, 1, 100), e('2026-10-01', 30, 9, 900), e('2026-11-01', 100, 100, 1)];
    const a = average3(list, '2026-11-01'); // usa 08, 09 (vazio) e 10 — não usa o mês atual
    expect(a.months).toBe(2);
    expect(a.conversion).toBeCloseTo(10 / 40);
    expect(a.ticket).toBeCloseTo(1000 / 10);
    expect(average3(list, '2026-06-01')).toEqual({ months: 0, conversion: null, ticket: null });
  });
  it('média da equipe: mesma instituição e mês, só com outras pessoas', () => {
    const all = [e('2026-10-01', 40, 10, 10000, 'p1', 'i1'), e('2026-10-01', 60, 20, 30000, 'p2', 'i1'), e('2026-10-01', 99, 99, 99, 'p3', 'i2')];
    const t = teamAverage(all, 'p1', 'i1', '2026-10-01')!;
    expect(t.people).toBe(2);
    expect(t.conversion).toBeCloseTo(30 / 100);
    expect(t.ticket).toBeCloseTo(40000 / 30);
    expect(teamAverage(all, 'p3', 'i2', '2026-10-01')).toBeNull(); // sozinha na instituição
    expect(teamAverage(all, 'p1', 'i1', '2026-09-01')).toBeNull();
  });
  it('valor digitado em R$', () => {
    expect(parseBRL('')).toBeNull();
    expect(parseBRL('1.234,56')).toBe(1234.56);
    expect(parseBRL('R$ 1.234')).toBe(1234);
    expect(parseBRL('1234.5')).toBe(1234.5);
    expect(parseBRL('12,5')).toBe(12.5);
    expect(Number.isNaN(parseBRL('-5') as number)).toBe(true);
    expect(Number.isNaN(parseBRL('abc') as number)).toBe(true);
  });
});
