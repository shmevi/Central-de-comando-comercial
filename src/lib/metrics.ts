/**
 * Feedback em números — cálculos PUROS (sem banco, sem React).
 *
 * Regras:
 * - Só leads, matrículas e valor são digitados; conversão (matrículas ÷ leads) e ticket (valor ÷ matrículas) são
 *   sempre calculados aqui e nunca gravados.
 * - Divisor 0 ou valor vazio → null (a tela mostra "—"). Mês sem lançamento → null (nunca zero nem estimativa).
 * - Somas antes de dividir: conversão de vários meses/instituições = Σ matrículas ÷ Σ leads (média ponderada).
 * - Matrículas > leads é aceito; `overflow` só sinaliza.
 */
import type { PersonMetric } from '@/domain/types';

export type MetricValues = Pick<PersonMetric, 'leads' | 'enrollments' | 'revenue'>;
/** Valores de um mês (somados entre lançamentos). revenue null = algum lançamento sem valor. */
export interface MonthTotals extends MetricValues { month: string; entries: number }

export const conversion = (m: Pick<MetricValues, 'leads' | 'enrollments'> | null | undefined): number | null =>
  m && m.leads > 0 ? m.enrollments / m.leads : null;

export const ticket = (m: Pick<MetricValues, 'enrollments' | 'revenue'> | null | undefined): number | null =>
  m && m.revenue != null && m.enrollments > 0 ? m.revenue / m.enrollments : null;

/** Matrículas acima dos leads: aceito, mas sinalizado na tela. */
export const overflow = (m: Pick<MetricValues, 'leads' | 'enrollments'> | null | undefined) => !!m && m.enrollments > m.leads;

// ------------------------------------------------------------------ meses
/** 'yyyy-mm-dd' (ou Date) → 'yyyy-mm-01'. */
export function monthKey(d: string | Date): string {
  const s = typeof d === 'string' ? d : d.toISOString().slice(0, 10);
  return `${s.slice(0, 7)}-01`;
}
/** Soma `n` meses a 'yyyy-mm-01'. */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}-01`;
}
/** Período padrão: os 6 meses fechados + o mês atual, do mais antigo ao mais recente. */
export function periodMonths(today: string, closed = 6): string[] {
  const cur = monthKey(today);
  return Array.from({ length: closed + 1 }, (_, i) => addMonths(cur, i - closed));
}

// ------------------------------------------------------------------ agregação
/** Soma os lançamentos de um mês. Sem lançamento → null. Qualquer valor vazio → revenue null. */
export function totals(entries: Pick<PersonMetric, 'month' | 'leads' | 'enrollments' | 'revenue'>[], month: string): MonthTotals | null {
  const list = entries.filter((e) => e.month === month);
  if (!list.length) return null;
  return {
    month, entries: list.length,
    leads: list.reduce((s, e) => s + e.leads, 0),
    enrollments: list.reduce((s, e) => s + e.enrollments, 0),
    revenue: list.some((e) => e.revenue == null) ? null : round2(list.reduce((s, e) => s + (e.revenue ?? 0), 0)),
  };
}

/** Série mês a mês (null onde não há lançamento). */
export const series = (entries: Pick<PersonMetric, 'month' | 'leads' | 'enrollments' | 'revenue'>[], months: string[]) => months.map((m) => totals(entries, m));

/**
 * Variação em relação ao mês anterior:
 * - conversão: diferença em pontos percentuais (ex.: 0,25 → 0,30 = +5,0 p.p.);
 * - ticket: variação percentual (ex.: R$ 1.000 → R$ 1.100 = +10,0%).
 * Qualquer lado sem valor → null.
 */
export function variation(cur: MonthTotals | null, prev: MonthTotals | null) {
  const c1 = conversion(cur), c0 = conversion(prev);
  const t1 = ticket(cur), t0 = ticket(prev);
  return {
    conversionPp: c1 != null && c0 != null ? (c1 - c0) * 100 : null,
    ticketPct: t1 != null && t0 != null && t0 !== 0 ? (t1 / t0 - 1) * 100 : null,
  };
}

/**
 * Média dos 3 meses anteriores a `month` (fechados), ponderada pelas somas.
 * Usa só os meses COM lançamento; informa quantos foram usados (0 → tudo null).
 */
export function average3(entries: Pick<PersonMetric, 'month' | 'leads' | 'enrollments' | 'revenue'>[], month: string) {
  const months = [addMonths(month, -3), addMonths(month, -2), addMonths(month, -1)];
  const got = months.map((m) => totals(entries, m)).filter((x): x is MonthTotals => !!x);
  if (!got.length) return { months: 0, conversion: null, ticket: null };
  const sum = {
    leads: got.reduce((s, x) => s + x.leads, 0),
    enrollments: got.reduce((s, x) => s + x.enrollments, 0),
    revenue: got.some((x) => x.revenue == null) ? null : got.reduce((s, x) => s + (x.revenue ?? 0), 0),
  };
  return { months: got.length, conversion: conversion(sum), ticket: ticket(sum) };
}

/**
 * Média da equipe: mesma instituição e mesmo mês, ponderada (Σ/Σ) entre todas as pessoas com lançamento.
 * Só existe se houver OUTRA pessoa com lançamento nesse mês e instituição (senão seria a própria pessoa).
 */
export function teamAverage(all: Pick<PersonMetric, 'person_id' | 'institution_id' | 'month' | 'leads' | 'enrollments' | 'revenue'>[], personId: string, institutionId: string, month: string) {
  const list = all.filter((e) => e.institution_id === institutionId && e.month === month);
  const people = new Set(list.map((e) => e.person_id));
  if (!list.length || ![...people].some((p) => p !== personId)) return null;
  const t = totals(list, month)!;
  return { people: people.size, conversion: conversion(t), ticket: ticket(t) };
}

// ------------------------------------------------------------------ formato (pt-BR)
const round2 = (n: number) => Math.round(n * 100) / 100;
const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const PCT = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const DASH = '—';

/** 0,25 → "25,0%"; null → "—". */
export const fmtPct = (ratio: number | null | undefined) => (ratio == null || !Number.isFinite(ratio) ? DASH : `${PCT.format(ratio * 100)}%`);
/** 1234.5 → "R$ 1.234,50"; null → "—". */
export const fmtBRL = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? DASH : BRL.format(v).replace(/ /g, ' '));
/** 'yyyy-mm-01' → "mm/aaaa". */
export const fmtMonth = (month: string) => `${month.slice(5, 7)}/${month.slice(0, 4)}`;
/** +5.04 → "+5,0 p.p."; null → "—". */
export const fmtPp = (pp: number | null | undefined) => (pp == null || !Number.isFinite(pp) ? DASH : `${pp > 0 ? '+' : pp < 0 ? '−' : ''}${PCT.format(Math.abs(pp))} p.p.`);
/** +10 → "+10,0%"; null → "—". */
export const fmtDeltaPct = (pct: number | null | undefined) => (pct == null || !Number.isFinite(pct) ? DASH : `${pct > 0 ? '+' : pct < 0 ? '−' : ''}${PCT.format(Math.abs(pct))}%`);
/** Inteiro com separador pt-BR; null → "—". */
export const fmtInt = (n: number | null | undefined) => (n == null ? DASH : new Intl.NumberFormat('pt-BR').format(n));

/** Texto digitado em R$ ("1.234,56", "1234.56", "R$ 1.234") → número; vazio → null; inválido → NaN. */
export function parseBRL(s: string): number | null {
  const t = s.replace(/R\$\s?/i, '').replace(/\s/g, '').trim();
  if (!t) return null;
  const normalized = t.includes(',') ? t.replace(/\./g, '').replace(',', '.')
    : /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, '') // "1.234" = mil duzentos e trinta e quatro
    : t;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return NaN;
  return Number(normalized);
}
