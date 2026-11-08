import * as React from 'react';
import { AlertTriangle } from 'lucide-react';
import type { PersonMetric } from '@/domain/types';
import { conversion, fmtBRL, fmtInt, fmtMonth, fmtPct, overflow, series, ticket } from '@/lib/metrics';
import { cn } from '@/lib/utils';

type Entry = Pick<PersonMetric, 'month' | 'leads' | 'enrollments' | 'revenue'>;

/**
 * Tabela mês a mês. Mês sem lançamento aparece como "sem lançamento" (nunca zero).
 * Celular: cada mês vira um bloco (sem rolagem horizontal); a partir de 640px, tabela.
 */
export function MetricsTable({ entries, months, caption, className }: { entries: Entry[]; months: string[]; caption: string; className?: string }) {
  const rows = series(entries, months).map((t, i) => ({ month: months[i], t })).reverse(); // mais recente primeiro
  return (
    <div className={className}>
      <table className="hidden w-full text-sm sm:table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-muted">
            <th scope="col" className="py-2 pr-2">Mês</th><th scope="col" className="py-2 pr-2 text-right">Leads</th><th scope="col" className="py-2 pr-2 text-right">Matrículas</th>
            <th scope="col" className="py-2 pr-2 text-right">Conversão</th><th scope="col" className="py-2 pr-2 text-right">Valor</th><th scope="col" className="py-2 text-right">Ticket médio</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ month, t }) => (
            <tr key={month} className="border-t border-border">
              <th scope="row" className="py-2 pr-2 text-left font-medium">{fmtMonth(month)}</th>
              {t ? <>
                <td className="py-2 pr-2 text-right tabular-nums">{fmtInt(t.leads)}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{fmtInt(t.enrollments)}{overflow(t) && <OverflowMark />}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{fmtPct(conversion(t))}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{fmtBRL(t.revenue)}</td>
                <td className="py-2 text-right tabular-nums">{fmtBRL(ticket(t))}</td>
              </> : <td colSpan={5} className="py-2 text-right text-xs text-muted">sem lançamento</td>}
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="space-y-2 sm:hidden" aria-label={caption}>
        {rows.map(({ month, t }) => (
          <li key={month} className={cn('rounded-lg border border-border p-2 text-xs', !t && 'text-muted')}>
            <div className="mb-1 font-semibold text-fg">{fmtMonth(month)}{!t && <span className="ml-2 font-normal text-muted">sem lançamento</span>}</div>
            {t && (
              <dl className="grid grid-cols-3 gap-x-2 gap-y-1">
                <Stat label="Leads" value={fmtInt(t.leads)} /><Stat label="Matrículas" value={fmtInt(t.enrollments)} extra={overflow(t) ? <OverflowMark /> : null} /><Stat label="Conversão" value={fmtPct(conversion(t))} />
                <Stat label="Valor" value={fmtBRL(t.revenue)} span /><Stat label="Ticket" value={fmtBRL(ticket(t))} />
              </dl>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({ label, value, extra, span }: { label: string; value: string; extra?: React.ReactNode; span?: boolean }) {
  return <div className={cn('min-w-0', span && 'col-span-2')}><dt className="text-muted">{label}</dt><dd className="tabular-nums text-fg">{value}{extra}</dd></div>;
}

/** Sinal neutro (sem cor de bom/ruim) para matrículas acima dos leads. */
export function OverflowMark() {
  return <span title="Matrículas acima dos leads — confira o lançamento" aria-label="Matrículas acima dos leads"><AlertTriangle size={12} className="ml-1 inline align-[-2px] text-muted" aria-hidden /></span>;
}
