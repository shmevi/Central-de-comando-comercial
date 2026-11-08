import * as React from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, MessageSquarePlus, Plus } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useCollection } from '@/data/store';
import { useInstitutions } from '@/app/hooks';
import { useScope } from '@/app/scope';
import { Button } from '@/components/ui/button';
import { Card, DemoBadge, EmptyState, ErrorState, Loading, PageHeader } from '@/components/ui/misc';
import { SelectField } from '@/components/ui/form';
import type { PersonMetric } from '@/domain/types';
import { addMonths, average3, conversion, fmtBRL, fmtDeltaPct, fmtInt, fmtMonth, fmtPct, fmtPp, monthKey, overflow, periodMonths, series, teamAverage, ticket, totals, variation } from '@/lib/metrics';
import { todayISO } from '@/lib/time';
import { MetricDialog } from '@/features/metrics/MetricDialog';
import { MetricsTable, OverflowMark } from '@/features/metrics/MetricsTable';

const ALL = 'todas';
const tooltipStyle = { background: 'rgb(var(--surface-2))', border: '1px solid rgb(var(--border))', borderRadius: 10, color: 'rgb(var(--fg))', fontSize: 12 };

/** Página da pessoa em Equipes: números do mês, variação, médias, gráficos e tabela mês a mês. Sem metas e sem cor de bom/ruim. */
export default function EquipePessoa() {
  const { personId } = useParams();
  const people = useCollection('people');
  const metrics = useCollection('person_metrics');
  const { byId } = useInstitutions();
  const { scope, matches } = useScope();
  const person = people.items.find((p) => p.id === personId);
  const months = periodMonths(todayISO());
  const [month, setMonth] = React.useState(months[months.length - 1]);
  const [instSel, setInstSel] = React.useState('');
  const [launch, setLaunch] = React.useState<Partial<PersonMetric> | null>(null);

  if (people.error || metrics.error) return <ErrorState message={(people.error || metrics.error)!} onRetry={() => { people.reload(); metrics.reload(); }} />;
  if (people.loading || metrics.loading) return <Loading />;
  if (!person) return <EmptyState title="Pessoa não encontrada" description="Ela pode ter sido excluída." action={<Button asChild variant="secondary"><Link to="/equipes">Voltar para Equipes</Link></Button>} />;

  // Instituições da pessoa dentro do filtro global (+ as que já têm lançamento)
  const instIds = [...new Set([...person.institution_ids, ...metrics.items.filter((m) => m.person_id === person.id).map((m) => m.institution_id)])].filter((id) => matches(id) && byId[id]);
  const options = [...(instIds.length > 1 ? [{ value: ALL, label: 'Todas (soma)' }] : []), ...instIds.map((id) => ({ value: id, label: byId[id].name }))];
  const inst = options.some((o) => o.value === instSel) ? instSel : instIds.includes(scope) ? scope : (instIds.length === 1 ? instIds[0] : ALL);
  const mine = metrics.items.filter((m) => m.person_id === person.id && (inst === ALL ? instIds.includes(m.institution_id) : m.institution_id === inst));
  const cur = totals(mine, month);
  const prevMonth = addMonths(month, -1);
  const v = variation(cur, totals(mine, prevMonth));
  const avg = average3(mine, month);
  const team = inst !== ALL ? teamAverage(metrics.items, person.id, inst, month) : null;
  const chart = series(mine, months).map((t, i) => ({ mes: fmtMonth(months[i]), conversao: conversion(t) != null ? Math.round(conversion(t)! * 1000) / 10 : null, ticket: ticket(t) != null ? Math.round(ticket(t)! * 100) / 100 : null }));
  const instLabel = inst === ALL ? 'todas as instituições' : byId[inst]?.name ?? '';

  return (
    <div className="space-y-4">
      <Link to="/equipes?aba=numeros" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg"><ArrowLeft size={14} aria-hidden />Equipes</Link>
      <PageHeader title={person.name} eyebrow="Números da pessoa" subtitle={`${person.role || 'Função não informada'} · ${instLabel}`}
        actions={<>
          <Button variant="secondary" onClick={() => setLaunch({ person_id: person.id, institution_id: inst === ALL ? instIds[0] : inst, month })} disabled={!instIds.length}><Plus size={16} />Lançar mês</Button>
          <Button asChild><Link to={`/equipes?aba=feedbacks&feedback=${person.id}`}><MessageSquarePlus size={16} />Dar feedback</Link></Button>
        </>} />
      {person.is_demo && <DemoBadge />}
      {!instIds.length ? <EmptyState title="Sem instituição no filtro" description="Esta pessoa não está vinculada à instituição escolhida no filtro do topo." /> : <>
        <Card className="grid gap-3 p-3 sm:grid-cols-2">
          <SelectField label="Instituição" value={inst} onChange={(e) => setInstSel(e.target.value)} options={options} />
          <SelectField label="Mês" value={month} onChange={(e) => setMonth(e.target.value)} options={[...months].reverse().map((m) => ({ value: m, label: m === monthKey(todayISO()) ? `${fmtMonth(m)} (atual)` : fmtMonth(m) }))} />
        </Card>

        <section aria-label={`Números de ${fmtMonth(month)}`} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Leads" value={cur ? fmtInt(cur.leads) : '—'} empty={!cur} />
          <StatCard label="Matrículas" value={cur ? fmtInt(cur.enrollments) : '—'} empty={!cur} extra={overflow(cur) ? <OverflowMark /> : null} />
          <StatCard label="Conversão" value={fmtPct(conversion(cur))} empty={!cur}
            lines={[`vs ${fmtMonth(prevMonth)}: ${fmtPp(v.conversionPp)}`, `Média 3 meses: ${fmtPct(avg.conversion)}${avg.months && avg.months < 3 ? ` (${avg.months} de 3 meses)` : ''}`, ...(team ? [`Média da equipe: ${fmtPct(team.conversion)} (${team.people} pessoas)`] : [])]} />
          <StatCard label="Ticket médio" value={fmtBRL(ticket(cur))} empty={!cur}
            lines={[`vs ${fmtMonth(prevMonth)}: ${fmtDeltaPct(v.ticketPct)}`, `Média 3 meses: ${fmtBRL(avg.ticket)}${avg.months && avg.months < 3 ? ` (${avg.months} de 3 meses)` : ''}`, ...(team ? [`Média da equipe: ${fmtBRL(team.ticket)} (${team.people} pessoas)`] : [])]} />
        </section>
        {!cur && <p className="text-sm text-muted">Sem lançamento em {fmtMonth(month)} — os números ficam vazios (nada é estimado).</p>}

        <div className="grid gap-3 lg:grid-cols-2">
          <ChartCard title="Conversão por mês" summary={`Conversão de ${months.length} meses: ${chart.map((c) => `${c.mes} ${c.conversao == null ? 'sem dado' : `${String(c.conversao).replace('.', ',')}%`}`).join('; ')}`}>
            <BarChart data={chart} margin={{ top: 8, right: 4, left: -18, bottom: 0 }} barCategoryGap="30%">
              <CartesianGrid stroke="rgb(var(--border))" vertical={false} />
              <XAxis dataKey="mes" tick={{ fill: 'rgb(var(--muted))', fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: 'rgb(var(--muted))', fontSize: 10 }} tickLine={false} axisLine={false} unit="%" width={44} />
              <Tooltip cursor={{ fill: 'rgb(var(--surface-2))' }} contentStyle={tooltipStyle} formatter={(val) => [fmtPct(Number(val) / 100), 'Conversão']} />
              <Bar dataKey="conversao" fill="rgb(var(--chart-1))" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
            </BarChart>
          </ChartCard>
          <ChartCard title="Ticket médio por mês" summary={`Ticket médio de ${months.length} meses: ${chart.map((c) => `${c.mes} ${c.ticket == null ? 'sem dado' : fmtBRL(c.ticket)}`).join('; ')}`}>
            <BarChart data={chart} margin={{ top: 8, right: 4, left: 4, bottom: 0 }} barCategoryGap="30%">
              <CartesianGrid stroke="rgb(var(--border))" vertical={false} />
              <XAxis dataKey="mes" tick={{ fill: 'rgb(var(--muted))', fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: 'rgb(var(--muted))', fontSize: 10 }} tickLine={false} axisLine={false} width={56} tickFormatter={(n) => `R$${Math.round(Number(n)).toLocaleString('pt-BR')}`} />
              <Tooltip cursor={{ fill: 'rgb(var(--surface-2))' }} contentStyle={tooltipStyle} formatter={(val) => [fmtBRL(Number(val)), 'Ticket médio']} />
              <Bar dataKey="ticket" fill="rgb(var(--chart-1))" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
            </BarChart>
          </ChartCard>
        </div>

        <Card className="p-4">
          <h2 className="mb-2 font-sans text-base font-semibold tracking-normal">Mês a mês</h2>
          <MetricsTable entries={mine} months={months} caption={`Números de ${person.name} mês a mês (${instLabel})`} />
        </Card>
      </>}
      <MetricDialog open={!!launch} entry={null} defaults={launch ?? undefined} onOpenChange={(o) => { if (!o) setLaunch(null); }} />
    </div>
  );
}

function StatCard({ label, value, lines = [], empty, extra }: { label: string; value: string; lines?: string[]; empty?: boolean; extra?: React.ReactNode }) {
  return (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-wider text-muted">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${empty ? 'text-muted' : ''}`}>{value}{extra}</div>
      {lines.length > 0 && <ul className="mt-2 space-y-0.5 text-xs text-muted">{lines.map((l) => <li key={l} className="[overflow-wrap:anywhere]">{l}</li>)}</ul>}
    </Card>
  );
}

function ChartCard({ title, summary, children }: { title: string; summary: string; children: React.ReactElement }) {
  return (
    <Card className="p-4">
      <h2 className="mb-2 font-sans text-base font-semibold tracking-normal">{title}</h2>
      <figure role="img" aria-label={summary} className="h-52 w-full">
        <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
      </figure>
      <p className="mt-1 text-xs text-muted">Meses sem lançamento ficam sem barra (não viram zero).</p>
    </Card>
  );
}
