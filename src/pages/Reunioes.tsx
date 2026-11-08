import * as React from 'react';
import { AlertTriangle, ClipboardPlus, ListPlus, Pencil, Plus, Trash2 } from 'lucide-react';
import { actions, useCollection } from '@/data/store';
import { useScope } from '@/app/scope';
import { PageHeader, Loading, ErrorState, EmptyState, Card, DemoBadge } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { useDraft } from '@/components/ui/use-draft';
import { Dialog, useConfirm } from '@/components/ui/dialog';
import { Checkbox, SelectField, TextArea, TextField } from '@/components/ui/form';
import { InstitutionBadge, InstitutionSelect } from '@/components/domain/Institution';
import { useToast } from '@/components/ui/toast';
import { SearchInput } from '@/components/ui/search';
import type { Meeting } from '@/domain/types';
import { fmtDate, todayISO, toMin } from '@/lib/time';
import { findConflicts } from '@/lib/conflicts';
import { nowIso, uid } from '@/lib/utils';

export const MEETING_TEMPLATES: Record<string, { title: string; agenda: string; duration: number }> = {
  livre: { title: '', agenda: '', duration: 60 },
  resultados: { title: 'Reunião semanal de resultados', agenda: '1. Indicadores da semana\n2. Metas x realizado por instituição\n3. Gargalos do funil\n4. Encaminhamentos', duration: 60 },
  um_a_um: { title: 'Feedback 1:1', agenda: '1. Como foi a semana\n2. Pontos positivos\n3. Pontos a desenvolver\n4. Plano de ação e prazo', duration: 30 },
  alinhamento: { title: 'Alinhamento de equipe', agenda: '1. Avisos\n2. Prioridades da semana\n3. Dúvidas e bloqueios', duration: 30 },
  planejamento: { title: 'Planejamento mensal', agenda: '1. Revisão do mês anterior\n2. OKRs do ciclo\n3. Campanhas e ações\n4. Responsáveis e prazos', duration: 90 },
};
const TPL_LABEL: Record<string, string> = { livre: 'Em branco', resultados: 'Resultados semanais', um_a_um: 'Feedback 1:1', alinhamento: 'Alinhamento de equipe', planejamento: 'Planejamento mensal' };
const addMin = (hhmm: string, m: number) => { const t = toMin(hhmm) + m; return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };

function MeetingDialog({ open, onOpenChange, meeting }: { open: boolean; onOpenChange: (o: boolean) => void; meeting: Meeting | null }) {
  const meetings = useCollection('meetings');
  const toast = useToast();
  const empty = (): Omit<Meeting, 'id' | 'created_at' | 'updated_at'> => ({ title: '', institution_id: null, date: todayISO(), start: '17:00', end: '18:00', template: 'livre', agenda: '', decisions: '', minutes: '', actions: [], participants: '' });
  const { d, setD, set, err, setErr } = useDraft(open, () => meeting ? { ...meeting } : empty(), [meeting]);
  const [act, setAct] = React.useState({ text: '', owner: '', deadline: '' });
  const applyTpl = (k: string) => { const t = MEETING_TEMPLATES[k]; setD((p) => ({ ...p, template: k, title: p.title || t.title, agenda: p.agenda || t.agenda, end: addMin(p.start, t.duration) })); };
  const conflicts = d.date && d.start && d.end && toMin(d.end) > toMin(d.start) ? findConflicts({ id: meeting?.id ?? '_', date: d.date, start: d.start, end: d.end }, meetings.items) : [];
  async function save() {
    const e: Record<string, string> = {};
    if (!d.title.trim()) e.title = 'Informe o título.';
    if (!d.date) e.date = 'Informe a data.';
    if (!d.start || !d.end || toMin(d.end) <= toMin(d.start)) e.time = 'Horário inválido.';
    if (d.actions.some((a) => !a.owner.trim())) e.actions = 'Todo encaminhamento precisa de responsável.';
    setErr(e); if (Object.keys(e).length) return;
    try { meeting ? await actions.update('meetings', meeting.id, d) : await actions.create('meetings', d); toast('Reunião salva.'); onOpenChange(false); }
    catch (er) { toast((er as Error).message, 'erro'); }
  }
  function addAction() {
    if (!act.text.trim()) return;
    if (!act.owner.trim()) return setErr({ ...err, actions: 'Informe o responsável do encaminhamento.' });
    set('actions', [...d.actions, { id: uid(), text: act.text.trim(), owner: act.owner.trim(), deadline: act.deadline || null, done: false }]);
    setAct({ text: '', owner: '', deadline: '' }); setErr({ ...err, actions: '' });
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={meeting ? 'Editar reunião' : 'Nova reunião'} wide
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={save}>Salvar</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        {!meeting && <SelectField className="sm:col-span-2" label="Modelo" value={d.template} onChange={(e) => applyTpl(e.target.value)} options={Object.entries(TPL_LABEL).map(([value, label]) => ({ value, label }))} />}
        <TextField className="sm:col-span-2" label="Título" required value={d.title} onChange={(e) => set('title', e.target.value)} error={err.title} />
        <InstitutionSelect value={d.institution_id} onChange={(v) => set('institution_id', v)} />
        <TextField label="Data" type="date" required value={d.date} onChange={(e) => set('date', e.target.value)} error={err.date} />
        <TextField label="Início" type="time" value={d.start} onChange={(e) => set('start', e.target.value)} error={err.time} />
        <TextField label="Fim" type="time" value={d.end} onChange={(e) => set('end', e.target.value)} />
        {conflicts.length > 0 && <p role="alert" className="sm:col-span-2 flex items-center gap-2 text-sm text-danger"><AlertTriangle size={14} />Conflita com: {conflicts.map((c) => `${c.title} (${c.start})`).join(', ')}</p>}
        <TextField className="sm:col-span-2" label="Participantes" value={d.participants} onChange={(e) => set('participants', e.target.value)} />
        <TextArea className="sm:col-span-2" label="Pauta" rows={4} value={d.agenda} onChange={(e) => set('agenda', e.target.value)} />
        <TextArea label="Decisões" value={d.decisions} onChange={(e) => set('decisions', e.target.value)} />
        <TextArea label="Ata" value={d.minutes} onChange={(e) => set('minutes', e.target.value)} />
        <fieldset className="sm:col-span-2 rounded-lg border border-border p-3">
          <legend className="label px-1">Encaminhamentos</legend>
          <ul className="mb-2 space-y-1">
            {d.actions.map((a) => (
              <li key={a.id} className="flex items-center gap-2 text-sm">
                <Checkbox label={<span className={a.done ? 'line-through text-muted' : ''}>{a.text} — <em>{a.owner}</em>{a.deadline && ` · ${fmtDate(a.deadline)}`}</span>} checked={a.done} onChange={(v) => set('actions', d.actions.map((x) => x.id === a.id ? { ...x, done: v } : x))} className="flex-1" />
                <Button variant="ghost" size="icon" aria-label="Remover encaminhamento" onClick={() => set('actions', d.actions.filter((x) => x.id !== a.id))}><Trash2 size={14} /></Button>
              </li>
            ))}
          </ul>
          <div className="grid gap-2 sm:grid-cols-[1fr_160px_150px_auto]">
            <TextField label="O quê" value={act.text} onChange={(e) => setAct({ ...act, text: e.target.value })} />
            <TextField label="Responsável" value={act.owner} onChange={(e) => setAct({ ...act, owner: e.target.value })} />
            <TextField label="Prazo" type="date" value={act.deadline} onChange={(e) => setAct({ ...act, deadline: e.target.value })} />
            <Button variant="secondary" className="self-end" onClick={addAction}><ListPlus size={16} /><span className="sr-only">Adicionar encaminhamento</span></Button>
          </div>
          {err.actions && <p role="alert" className="mt-1 text-xs text-danger">{err.actions}</p>}
        </fieldset>
      </div>
    </Dialog>
  );
}

export default function Reunioes() {
  const meetings = useCollection('meetings');
  const { matches } = useScope();
  const { confirmDelete, confirmNode } = useConfirm();
  const toast = useToast();
  const [q, setQ] = React.useState('');
  const [editing, setEditing] = React.useState<Meeting | null>(null); const [creating, setCreating] = React.useState(false);
  const list = meetings.items.filter((m) => matches(m.institution_id)).filter((m) => !q || `${m.title} ${m.agenda} ${m.decisions}`.toLowerCase().includes(q.toLowerCase())).sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start));
  const pending = list.flatMap((m) => m.actions.filter((a) => !a.done).map((a) => ({ ...a, meeting: m })));

  async function toTask(m: Meeting, a: Meeting['actions'][number]) {
    await actions.create('tasks', { title: a.text, description: `Encaminhamento da reunião “${m.title}” (${fmtDate(m.date)}). Responsável: ${a.owner}.`, institution_id: m.institution_id, priority: 'media', status: 'a_fazer', due_date: a.deadline, category: 'Reuniões', checklist: [], recurrence: 'nenhuma', is_mission: false, mission_date: null, completed_at: null, history: [{ at: nowIso(), action: 'Criada a partir de reunião' }] });
    toast('Tarefa criada a partir do encaminhamento.');
  }

  return (
    <div>
      <PageHeader title="Reuniões" subtitle={`${list.length} reunião(ões) · ${pending.length} encaminhamento(s) pendente(s)`} actions={<Button onClick={() => setCreating(true)}><ClipboardPlus size={16} />Nova reunião</Button>} />
      <SearchInput id="busca-r" className="mb-3 max-w-md" placeholder="Buscar em título, pauta e decisões…" value={q} onChange={setQ} />
      {meetings.error ? <ErrorState message={meetings.error} onRetry={meetings.reload} /> : meetings.loading ? <Loading /> : list.length === 0 ? <EmptyState title="Nenhuma reunião" description="Use os modelos para criar pauta, registrar decisões e encaminhamentos." action={<Button onClick={() => setCreating(true)}><Plus size={16} />Nova reunião</Button>} /> : (
        <div className="grid gap-5 lg:grid-cols-[1fr_340px] [&>*]:min-w-0">
          <ul className="space-y-2">
            {list.map((m) => (
              <li key={m.id}><Card className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div><div className="font-semibold">{m.title} {m.is_demo && <DemoBadge />}</div>
                    <div className="flex flex-wrap gap-1 text-xs text-muted">{fmtDate(m.date)} · {m.start}–{m.end} <InstitutionBadge id={m.institution_id} />{m.decisions ? <span className="chip border-success/50 text-success">Com decisões</span> : <span className="chip border-border">Sem ata</span>}</div></div>
                  <div className="flex"><Button variant="ghost" size="icon" aria-label={`Editar ${m.title}`} onClick={() => setEditing(m)}><Pencil size={15} /></Button>
                    <Button variant="ghost" size="icon" aria-label={`Excluir ${m.title}`} onClick={() => confirmDelete('Excluir reunião', `“${m.title}”`, () => actions.remove('meetings', m.id))}><Trash2 size={15} /></Button></div>
                </div>
                {m.agenda && <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm text-muted">{m.agenda}</p>}
              </Card></li>
            ))}
          </ul>
          <Card className="h-fit p-5">
            <h2 className="mb-3 font-sans text-base font-semibold tracking-normal">Encaminhamentos pendentes</h2>
            {pending.length === 0 ? <p className="text-sm text-muted">Nenhum pendente.</p> : (
              <ul className="space-y-2 text-sm">{pending.map((a) => (
                <li key={a.id} className="rounded-lg bg-surface-2/60 p-2">
                  <div>{a.text}</div>
                  <div className="text-xs text-muted">{a.owner}{a.deadline && ` · ${fmtDate(a.deadline)}`} · {a.meeting.title}</div>
                  <Button variant="ghost" size="sm" className="mt-1" onClick={() => toTask(a.meeting, a)}>Criar tarefa</Button>
                </li>))}
              </ul>
            )}
          </Card>
        </div>
      )}
      <MeetingDialog open={creating || !!editing} meeting={editing} onOpenChange={(o) => { if (!o) { setCreating(false); setEditing(null); } }} />
      {confirmNode}
    </div>
  );
}
