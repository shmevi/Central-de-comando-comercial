import * as React from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, Pencil, Plus, Trash2 } from 'lucide-react';
import { actions, useCollection } from '@/data/store';
import { useInstitutions } from '@/app/hooks';
import { useScope } from '@/app/scope';
import { Button } from '@/components/ui/button';
import { Card, DemoBadge, EmptyState, ErrorState, Loading } from '@/components/ui/misc';
import { SelectField, TextField } from '@/components/ui/form';
import { useConfirm } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import type { PersonMetric } from '@/domain/types';
import { conversion, fmtBRL, fmtInt, fmtMonth, fmtPct, monthKey, overflow, ticket } from '@/lib/metrics';
import { todayISO } from '@/lib/time';
import { MetricDialog } from './MetricDialog';
import { OverflowMark } from './MetricsTable';

/** Aba "Números" de Equipes: lançamento do mês por pessoa × instituição (respeita o filtro de instituição). */
export function MetricsTab({ q }: { q: string }) {
  const people = useCollection('people');
  const metrics = useCollection('person_metrics');
  const { active } = useInstitutions();
  const { scope, matches } = useScope();
  const { confirm, confirmNode } = useConfirm();
  const toast = useToast();
  const cur = monthKey(todayISO()).slice(0, 7);
  const [month, setMonth] = React.useState(cur);
  const instOptions = active.filter((i) => matches(i.id));
  const [inst, setInst] = React.useState('');
  const institution = instOptions.some((i) => i.id === inst) ? inst : (instOptions.find((i) => i.id === scope)?.id ?? instOptions[0]?.id ?? '');
  const [editing, setEditing] = React.useState<PersonMetric | null>(null);
  const [creating, setCreating] = React.useState<Partial<PersonMetric> | null>(null);
  const m01 = `${month}-01`;

  const list = people.items
    .filter((p) => p.institution_ids.includes(institution) || metrics.items.some((x) => x.person_id === p.id && x.institution_id === institution && x.month === m01))
    .filter((p) => !q || `${p.name} ${p.role}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => Number(!a.active) - Number(!b.active) || a.name.localeCompare(b.name, 'pt-BR'));

  async function del(m: PersonMetric, name: string) {
    if (!(await confirm({ title: 'Excluir lançamento', message: `Excluir o lançamento de ${name} em ${fmtMonth(m.month)}? Os números desse mês voltam a ficar vazios.`, danger: true, confirmLabel: 'Excluir' }))) return;
    try { await actions.remove('person_metrics', m.id); toast('Lançamento excluído.'); } catch (e) { toast((e as Error).message, 'erro'); }
  }

  if (metrics.error) return <ErrorState message={metrics.error} onRetry={metrics.reload} />;
  if (metrics.loading || people.loading) return <Loading />;
  return (
    <div className="space-y-3">
      <Card className="grid gap-3 p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <TextField label="Mês" type="month" max={cur} value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
        <SelectField label="Instituição" value={institution} onChange={(e) => setInst(e.target.value)} options={instOptions.map((i) => ({ value: i.id, label: i.name }))} placeholder={instOptions.length ? undefined : 'Nenhuma instituição ativa'} />
        <Button onClick={() => setCreating({ institution_id: institution, month: m01 })} disabled={!institution}><Plus size={16} />Lançar</Button>
      </Card>
      {!institution ? <EmptyState title="Sem instituição" description="Ative uma instituição em Configurações para lançar números." />
        : list.length === 0 ? <EmptyState title="Nenhuma pessoa nesta instituição" description="Vincule pessoas à instituição na aba Pessoas." />
        : (
          <ul className="grid gap-3 lg:grid-cols-2" aria-label={`Lançamentos de ${fmtMonth(m01)}`}>
            {list.map((p) => {
              const m = metrics.items.find((x) => x.person_id === p.id && x.institution_id === institution && x.month === m01);
              return (
                <li key={p.id}><Card className="space-y-2 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold [overflow-wrap:anywhere]">{p.name} {(p.is_demo || m?.is_demo) && <DemoBadge />}</div>
                      <div className="text-xs text-muted">{p.role || 'Função não informada'}{!p.active && ' · inativo'}</div>
                    </div>
                    <div className="flex items-center">
                      <Button variant="ghost" size="sm" asChild><Link to={`/equipes/${p.id}`} aria-label={`Ver números de ${p.name}`}><BarChart3 size={14} />Ver números</Link></Button>
                      {m && <>
                        <Button variant="ghost" size="icon" aria-label={`Editar lançamento de ${p.name}`} onClick={() => setEditing(m)}><Pencil size={15} /></Button>
                        <Button variant="ghost" size="icon" aria-label={`Excluir lançamento de ${p.name}`} onClick={() => del(m, p.name)}><Trash2 size={15} /></Button>
                      </>}
                    </div>
                  </div>
                  {m ? (
                    <dl className="grid grid-cols-3 gap-2 text-sm sm:grid-cols-5">
                      <Cell label="Leads" value={fmtInt(m.leads)} />
                      <Cell label="Matrículas" value={fmtInt(m.enrollments)} extra={overflow(m) ? <OverflowMark /> : null} />
                      <Cell label="Conversão" value={fmtPct(conversion(m))} />
                      <Cell label="Valor" value={fmtBRL(m.revenue)} />
                      <Cell label="Ticket médio" value={fmtBRL(ticket(m))} />
                    </dl>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
                      <span>Sem lançamento em {fmtMonth(m01)}.</span>
                      <Button variant="secondary" size="sm" onClick={() => setCreating({ person_id: p.id, institution_id: institution, month: m01 })} aria-label={`Lançar ${fmtMonth(m01)} de ${p.name}`}><Plus size={14} />Lançar</Button>
                    </div>
                  )}
                </Card></li>
              );
            })}
          </ul>
        )}
      <MetricDialog open={!!creating || !!editing} entry={editing} defaults={creating ?? undefined} onOpenChange={(o) => { if (!o) { setCreating(null); setEditing(null); } }} />
      {confirmNode}
    </div>
  );
}

function Cell({ label, value, extra }: { label: string; value: string; extra?: React.ReactNode }) {
  return <div className="min-w-0"><dt className="text-xs text-muted">{label}</dt><dd className="font-semibold tabular-nums [overflow-wrap:anywhere]">{value}{extra}</dd></div>;
}
