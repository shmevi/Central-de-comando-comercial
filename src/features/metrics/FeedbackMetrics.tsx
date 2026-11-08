import { BarChart3 } from 'lucide-react';
import type { Feedback, MetricsSnapshot, PersonMetric } from '@/domain/types';
import { conversion, fmtBRL, fmtMonth, fmtPct, monthKey, periodMonths, ticket, totals } from '@/lib/metrics';
import { fmtDate } from '@/lib/time';
import { MetricsTable } from './MetricsTable';

/** Lançamentos da pessoa × instituição no período do feedback (6 meses fechados + mês do feedback). Só valores digitados. */
export function snapshotFor(all: PersonMetric[], personId: string, institutionId: string | null, date: string, takenAt: string): MetricsSnapshot {
  const months = new Set(periodMonths(date));
  return {
    taken_at: takenAt, institution_id: institutionId,
    months: all.filter((m) => m.person_id === personId && m.institution_id === institutionId && months.has(m.month))
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((m) => ({ month: m.month, institution_id: m.institution_id, leads: m.leads, enrollments: m.enrollments, revenue: m.revenue })),
  };
}

export const hasSnapshot = (f: Pick<Feedback, 'metrics_snapshot'>): f is { metrics_snapshot: MetricsSnapshot } =>
  !!f.metrics_snapshot && Array.isArray((f.metrics_snapshot as MetricsSnapshot).months);

/**
 * Painel "Números" dentro do feedback. `frozen` = foto gravada no feedback (não muda depois);
 * sem foto = números atuais (prévia do que será congelado ao salvar).
 */
export function FeedbackMetricsPanel({ snapshot, date, frozen }: { snapshot: MetricsSnapshot; date: string; frozen: boolean }) {
  const months = periodMonths(date);
  const last = [...months].reverse().map((m) => totals(snapshot.months, m)).find(Boolean) ?? null;
  return (
    <section className="rounded-lg border border-border p-3" aria-label="Números da pessoa">
      <h3 className="mb-1 flex flex-wrap items-center gap-2 text-sm font-semibold"><BarChart3 size={14} aria-hidden />Números
        <span className="text-xs font-normal text-muted">{frozen ? `congelados em ${fmtDate(snapshot.taken_at.slice(0, 10))}` : 'prévia — serão congelados ao salvar'}</span></h3>
      {!snapshot.months.length ? <p className="text-xs text-muted">Sem lançamentos desta pessoa nesta instituição entre {fmtMonth(months[0])} e {fmtMonth(monthKey(date))}.</p> : <>
        {last && <p className="mb-2 text-xs text-muted">Último mês com lançamento ({fmtMonth(last.month)}): conversão <strong className="text-fg">{fmtPct(conversion(last))}</strong> · ticket médio <strong className="text-fg">{fmtBRL(ticket(last))}</strong></p>}
        <MetricsTable entries={snapshot.months} months={months} caption="Números da pessoa no período do feedback" />
      </>}
    </section>
  );
}

/** Resumo de uma linha para o cartão do feedback na lista. */
export function FeedbackMetricsSummary({ f }: { f: Feedback }) {
  if (!hasSnapshot(f) || !f.metrics_snapshot.months.length) return null;
  const months = periodMonths(f.date);
  const last = [...months].reverse().map((m) => totals(f.metrics_snapshot.months, m)).find(Boolean);
  if (!last) return null;
  return <p className="mt-2 text-xs text-muted"><BarChart3 size={12} className="mr-1 inline align-[-2px]" aria-hidden />Números no feedback ({fmtMonth(last.month)}): conversão {fmtPct(conversion(last))} · ticket médio {fmtBRL(ticket(last))}</p>;
}
