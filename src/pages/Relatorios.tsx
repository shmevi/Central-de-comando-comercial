import * as React from 'react';
import { ChevronLeft, ChevronRight, FileDown, FileSpreadsheet } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useCollection } from '@/data/store';
import { useNow } from '@/app/hooks';
import { useScope } from '@/app/scope';
import { useInstitutions } from '@/app/hooks';
import { PageHeader, Segmented, Loading, Card } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { addDays, fmtDate, fmtLongDate, weekDates } from '@/lib/time';
import { buildReport, displayValue, download, toCSV, toPDF, weeklySeries } from '@/features/reports/build';
import { cn } from '@/lib/utils';

export default function Relatorios() {
  const now = useNow();
  const { matches, scope } = useScope();
  const { byId } = useInstitutions();
  const toast = useToast();
  const [kind, setKind] = React.useState<'diario' | 'semanal'>('diario');
  const [date, setDate] = React.useState(now.date);
  const tasks = useCollection('tasks'); const routine = useCollection('routine_blocks'); const interviews = useCollection('interviews');
  const feedbacks = useCollection('feedbacks'); const meetings = useCollection('meetings'); const notes = useCollection('notes');
  const loading = [tasks, routine, interviews, feedbacks, meetings, notes].some((c) => !c.loaded);
  const dates = kind === 'diario' ? [date] : weekDates(date, 5);
  const rows = loading ? [] : buildReport(dates, { tasks: tasks.items, routine_blocks: routine.items, interviews: interviews.items, feedbacks: feedbacks.items, meetings: meetings.items, notes: notes.items }, now.date, now.time, (id) => matches(id));
  const series = weeklySeries(date, routine.items);
  const scopeLabel = scope === 'all' ? 'Todas as instituições' : scope === 'none' ? 'Sem instituição' : byId[scope]?.name ?? '';
  const period = kind === 'diario' ? fmtDate(date) : `${fmtDate(dates[0])} a ${fmtDate(dates[4])}`;
  const title = `Relatório ${kind === 'diario' ? 'diário' : 'semanal'} — Central de Comando Comercial`;
  const fileBase = `relatorio-${kind}-${dates[0]}`;
  const sections = [...new Set(rows.map((r) => r.section))];

  return (
    <div>
      <PageHeader title="Relatórios" subtitle={`${period} · ${scopeLabel}`}
        actions={<>
          <Segmented label="Tipo" value={kind} onChange={setKind} options={[{ value: 'diario', label: 'Diário' }, { value: 'semanal', label: 'Semanal' }]} />
          <Button variant="secondary" disabled={loading} onClick={() => { download(`${fileBase}.csv`, toCSV(rows, `${title} · ${period} · ${scopeLabel}`), 'text/csv;charset=utf-8'); toast('CSV exportado.'); }}><FileSpreadsheet size={16} />CSV</Button>
          <Button disabled={loading} onClick={() => toPDF(rows, title, `${period} · ${scopeLabel} · gerado em ${fmtDate(now.date)} ${now.time}`, `${fileBase}.pdf`).then(() => toast('PDF exportado.')).catch((e) => toast(e.message, 'erro'))}><FileDown size={16} />PDF</Button>
        </>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="icon" aria-label="Período anterior" onClick={() => setDate(addDays(date, kind === 'diario' ? -1 : -7))}><ChevronLeft size={18} /></Button>
        <Button variant="secondary" size="sm" onClick={() => setDate(now.date)}>Hoje</Button>
        <Button variant="ghost" size="icon" aria-label="Próximo período" onClick={() => setDate(addDays(date, kind === 'diario' ? 1 : 7))}><ChevronRight size={18} /></Button>
        <label><span className="sr-only">Data de referência</span><input type="date" className="field h-9 w-auto" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} /></label>
        <span className="text-xs text-muted">{kind === 'diario' && fmtLongDate(date)}</span>
      </div>
      <p className="mb-4 rounded-lg border border-orange/40 bg-orange/5 p-3 text-xs"><strong className="text-orange">Não preenchido</strong> indica ausência de registro e não é o mesmo que zero.</p>
      {loading ? <Loading /> : (
        <div className="grid gap-5 lg:grid-cols-[1fr_380px] [&>*]:min-w-0">
          <div className="space-y-4">
            {sections.map((s) => (
              <Card key={s} className="overflow-hidden">
                <table className="w-full text-sm">
                  <caption className="px-4 pt-3 text-left font-display text-lg font-bold uppercase text-gold">{s}</caption>
                  <thead className="sr-only"><tr><th>Indicador</th><th>Valor</th></tr></thead>
                  <tbody>
                    {rows.filter((r) => r.section === s).map((r) => (
                      <tr key={r.indicator} className="border-t border-border first:border-t-0">
                        <th scope="row" className="px-4 py-2 text-left font-normal">{r.indicator}{r.note && <div className="text-xs text-muted">{r.note}</div>}</th>
                        <td className={cn('px-4 py-2 text-right font-semibold tabular-nums', r.value == null && 'text-orange font-normal italic')}>{displayValue(r.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            ))}
          </div>
          <Card className="h-fit p-4">
            <h2 className="text-lg text-gold">Horas de rotina concluídas</h2>
            <p className="mb-3 text-xs text-muted">Semana de {fmtDate(weekDates(date)[0])} · dias sem rotina gerada aparecem como “não preenchido”</p>
            <div className="h-56" role="img" aria-label={`Horas concluídas por dia: ${series.map((s) => `${s.label} ${s.hours ?? 'não preenchido'}`).join(', ')}`}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={series} margin={{ top: 8, right: 4, left: -20, bottom: 0 }} barCategoryGap="30%">
                  <CartesianGrid vertical={false} stroke="rgb(var(--border))" strokeDasharray="0" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: 'rgb(var(--muted))', fontSize: 12 }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fill: 'rgb(var(--muted))', fontSize: 12 }} allowDecimals={false} domain={[0, 9]} />
                  <Tooltip cursor={{ fill: 'rgb(var(--surface-2))' }} contentStyle={{ background: 'rgb(var(--surface-2))', border: '1px solid rgb(var(--border))', borderRadius: 10, color: 'rgb(var(--fg))', fontSize: 12 }}
                    formatter={(v: any) => [v == null ? 'Não preenchido' : `${String(v).replace('.', ',')} h`, 'Concluído']} labelFormatter={(l) => `Dia ${l}`} />
                  <Bar dataKey="hours" fill="rgb(var(--chart-1))" radius={[4, 4, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <table className="mt-3 w-full text-xs">
              <caption className="sr-only">Tabela de horas concluídas</caption>
              <thead><tr className="text-muted"><th className="text-left font-normal">Dia</th><th className="text-right font-normal">Horas</th></tr></thead>
              <tbody>{series.map((s) => <tr key={s.date}><td>{s.label}</td><td className={cn('text-right tabular-nums', s.hours == null && 'italic text-orange')}>{s.hours == null ? 'Não preenchido' : `${String(s.hours).replace('.', ',')} h`}</td></tr>)}</tbody>
            </table>
          </Card>
        </div>
      )}
    </div>
  );
}
