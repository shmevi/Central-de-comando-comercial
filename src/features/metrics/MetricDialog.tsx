import { AlertTriangle } from 'lucide-react';
import { actions, useCollection } from '@/data/store';
import { useInstitutions } from '@/app/hooks';
import { useScope } from '@/app/scope';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useDraft } from '@/components/ui/use-draft';
import { SelectField, TextArea, TextField } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import type { PersonMetric } from '@/domain/types';
import { conversion, fmtBRL, fmtPct, monthKey, overflow, parseBRL, ticket } from '@/lib/metrics';
import { todayISO } from '@/lib/time';

type Draft = { person_id: string; institution_id: string; month: string; leads: string; enrollments: string; revenue: string; notes: string };
const toDraft = (m: Partial<PersonMetric>): Draft => ({
  person_id: m.person_id ?? '', institution_id: m.institution_id ?? '', month: (m.month ?? monthKey(todayISO())).slice(0, 7),
  leads: m.leads != null ? String(m.leads) : '', enrollments: m.enrollments != null ? String(m.enrollments) : '',
  revenue: m.revenue != null ? String(m.revenue).replace('.', ',') : '', notes: m.notes ?? '',
});
const intOf = (s: string) => (/^\d{1,9}$/.test(s.trim()) ? Number(s.trim()) : NaN);

/**
 * Lançamento do mês (pessoa × instituição): só leads, matrículas e valor são digitados.
 * Conversão e ticket aparecem calculados (prévia) e nunca são gravados.
 */
export function MetricDialog({ open, onOpenChange, entry, defaults }: {
  open: boolean; onOpenChange: (o: boolean) => void; entry: PersonMetric | null; defaults?: Partial<PersonMetric>;
}) {
  const people = useCollection('people');
  const metrics = useCollection('person_metrics');
  const { byId, active } = useInstitutions();
  const { matches } = useScope();
  const toast = useToast();
  const { d, set, err, setErr } = useDraft<Draft>(open, () => toDraft(entry ?? defaults ?? {}), [entry, defaults]);
  const person = people.items.find((p) => p.id === d.person_id);
  const instOptions = active.filter((i) => matches(i.id) && (!person || person.institution_ids.includes(i.id) || i.id === entry?.institution_id))
    .map((i) => ({ value: i.id, label: i.name }));
  const peopleOptions = people.items.filter((p) => (p.active || p.id === entry?.person_id) && matches(p.institution_ids))
    .map((p) => ({ value: p.id, label: p.name }));

  const leads = intOf(d.leads), enr = intOf(d.enrollments), rev = parseBRL(d.revenue);
  const preview = Number.isFinite(leads) && Number.isFinite(enr) ? { leads, enrollments: enr, revenue: rev != null && Number.isFinite(rev) ? rev : null } : null;
  const curMonth = monthKey(todayISO()).slice(0, 7);

  async function save() {
    const e: Record<string, string> = {};
    if (!d.person_id) e.person = 'Escolha a pessoa.';
    if (!d.institution_id) e.inst = 'Escolha a instituição.';
    if (!/^\d{4}-\d{2}$/.test(d.month)) e.month = 'Informe o mês (mm/aaaa).';
    else if (d.month > curMonth) e.month = 'Não é possível lançar um mês futuro.';
    if (!Number.isFinite(leads)) e.leads = 'Use um número inteiro igual ou maior que zero.';
    if (!Number.isFinite(enr)) e.enrollments = 'Use um número inteiro igual ou maior que zero.';
    if (rev != null && !Number.isFinite(rev)) e.revenue = 'Valor inválido. Ex.: 12.500,00 (ou deixe vazio).';
    const month = `${d.month}-01`;
    const dup = metrics.items.find((m) => m.person_id === d.person_id && m.institution_id === d.institution_id && m.month === month && m.id !== entry?.id);
    if (!e.month && dup) e.month = 'Já existe lançamento desta pessoa nesta instituição e mês. Edite o existente.';
    setErr(e); if (Object.keys(e).length) return;
    const payload = { person_id: d.person_id, institution_id: d.institution_id, month, leads, enrollments: enr, revenue: rev, notes: d.notes.trim() };
    try {
      if (entry) await actions.update('person_metrics', entry.id, payload); else await actions.create('person_metrics', payload);
      toast('Lançamento salvo.'); onOpenChange(false);
    } catch (er) { toast((er as Error).message, 'erro'); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={entry ? 'Editar lançamento' : 'Lançar mês'}
      description="Digite só leads, matrículas e valor. Conversão e ticket médio são calculados."
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={save}>Salvar</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Pessoa" required value={d.person_id} onChange={(e) => set('person_id', e.target.value)} error={err.person} options={peopleOptions} placeholder="Selecione…" />
        <SelectField label="Instituição" required value={d.institution_id} onChange={(e) => set('institution_id', e.target.value)} error={err.inst}
          options={d.institution_id && !instOptions.some((o) => o.value === d.institution_id) && byId[d.institution_id] ? [...instOptions, { value: d.institution_id, label: byId[d.institution_id].name }] : instOptions} placeholder="Selecione…" />
        <TextField label="Mês" type="month" required max={curMonth} value={d.month} onChange={(e) => set('month', e.target.value)} error={err.month} />
        <span className="hidden sm:block" />
        <TextField label="Leads" required type="number" inputMode="numeric" min={0} step={1} value={d.leads} onChange={(e) => set('leads', e.target.value)} error={err.leads} />
        <TextField label="Matrículas" required type="number" inputMode="numeric" min={0} step={1} value={d.enrollments} onChange={(e) => set('enrollments', e.target.value)} error={err.enrollments} />
        <TextField className="sm:col-span-2" label="Valor (R$)" inputMode="decimal" placeholder="Opcional — ex.: 12.500,00" value={d.revenue} onChange={(e) => set('revenue', e.target.value)} error={err.revenue}
          hint="Total vendido no mês. Sem valor, o ticket médio fica “—”." />
        <TextArea className="sm:col-span-2" label="Observações" rows={2} value={d.notes} onChange={(e) => set('notes', e.target.value)} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg border border-border p-3 text-sm" aria-live="polite">
        <div><div className="label">Conversão (calculada)</div><div className="text-lg font-semibold tabular-nums">{fmtPct(conversion(preview))}</div></div>
        <div><div className="label">Ticket médio (calculado)</div><div className="text-lg font-semibold tabular-nums">{fmtBRL(ticket(preview))}</div></div>
        {overflow(preview) && (
          <p role="status" className="col-span-2 flex items-start gap-2 text-xs text-muted"><AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
            Matrículas acima dos leads. Confira os números — o lançamento pode ser salvo assim mesmo.</p>
        )}
      </div>
    </Dialog>
  );
}
