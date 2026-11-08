import * as React from 'react';
import { Lock, MessageSquarePlus, Pencil, Plus, Trash2, UserPlus } from 'lucide-react';
import { actions, useCollection } from '@/data/store';
import { useScope } from '@/app/scope';
import { useSettings } from '@/app/hooks';
import { PageHeader, Segmented, Loading, ErrorState, EmptyState, Card, DemoBadge, Progress } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { useDraft } from '@/components/ui/use-draft';
import { Dialog, useConfirm } from '@/components/ui/dialog';
import { Checkbox, SelectField, TextArea, TextField } from '@/components/ui/form';
import { InstitutionBadge, InstitutionMulti, InstitutionSelect } from '@/components/domain/Institution';
import { useToast } from '@/components/ui/toast';
import { SearchInput } from '@/components/ui/search';
import type { Feedback, Person } from '@/domain/types';
import { fmtDate, todayISO } from '@/lib/time';
import { nowIso } from '@/lib/utils';
import { checkPin } from '@/lib/pin';

function PersonDialog({ open, onOpenChange, person }: { open: boolean; onOpenChange: (o: boolean) => void; person: Person | null }) {
  const toast = useToast();
  const empty = (): Omit<Person, 'id' | 'created_at' | 'updated_at'> => ({ name: '', role: '', email: '', phone: '', institution_ids: [], active: true, notes: '' });
  const { d, set, err, setErr } = useDraft(open, () => person ? { ...person } : empty(), [person]);
  async function save() {
    const e: Record<string, string> = {};
    if (!d.name.trim()) e.name = 'Informe o nome.';
    if (!d.institution_ids.length) e.inst = 'Vincule a pelo menos uma instituição.';
    if (d.email && !/^\S+@\S+\.\S+$/.test(d.email)) e.email = 'E-mail inválido.';
    setErr(e); if (Object.keys(e).length) return;
    try { person ? await actions.update('people', person.id, d) : await actions.create('people', d); toast('Pessoa salva.'); onOpenChange(false); }
    catch (er) { toast((er as Error).message, 'erro'); }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={person ? 'Editar pessoa' : 'Nova pessoa'}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={save}>Salvar</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Nome" required value={d.name} onChange={(e) => set('name', e.target.value)} error={err.name} />
        <TextField label="Função" value={d.role} onChange={(e) => set('role', e.target.value)} />
        <TextField label="E-mail" type="email" value={d.email} onChange={(e) => set('email', e.target.value)} error={err.email} />
        <TextField label="Telefone" value={d.phone} onChange={(e) => set('phone', e.target.value)} />
        <div className="sm:col-span-2"><InstitutionMulti value={d.institution_ids} onChange={(v) => set('institution_ids', v)} />{err.inst && <p role="alert" className="text-xs text-danger">{err.inst}</p>}</div>
        <Checkbox label="Ativo(a)" checked={d.active} onChange={(v) => set('active', v)} />
        <TextArea className="sm:col-span-2" label="Observações" value={d.notes} onChange={(e) => set('notes', e.target.value)} />
      </div>
    </Dialog>
  );
}

function FeedbackDialog({ open, onOpenChange, feedback, personId }: { open: boolean; onOpenChange: (o: boolean) => void; feedback: Feedback | null; personId?: string }) {
  const people = useCollection('people');
  const toast = useToast();
  const empty = (): Omit<Feedback, 'id' | 'created_at' | 'updated_at'> => ({ person_id: personId ?? '', institution_id: null, date: todayISO(), positives: '', to_develop: '', action_plan: '', deadline: null, status: 'aberto', reviews: [], confidential: true });
  const { d, set, err, setErr } = useDraft(open, () => (feedback ? { ...feedback } : empty()), [feedback, personId]);
  const [review, setReview] = React.useState({ text: '', progress: 0 });
  React.useEffect(() => { if (open) setReview({ text: '', progress: 0 }); }, [open]);
  const person = people.items.find((p) => p.id === d.person_id);
  async function save() {
    const e: Record<string, string> = {};
    if (!d.person_id) e.person = 'Escolha a pessoa.';
    if (!d.date) e.date = 'Informe a data do feedback.';
    if (!d.institution_id) e.inst = 'Escolha a instituição do feedback.';
    else if (person && !person.institution_ids.includes(d.institution_id)) e.inst = 'A pessoa não está vinculada a esta instituição.';
    if (!d.positives.trim() && !d.to_develop.trim()) e.positives = 'Preencha pontos positivos ou a desenvolver.';
    if (d.deadline && d.deadline < d.date) e.deadline = 'O prazo deve ser após a data do feedback.';
    setErr(e); if (Object.keys(e).length) return;
    try { feedback ? await actions.update('feedbacks', feedback.id, d) : await actions.create('feedbacks', d); toast('Feedback salvo.'); onOpenChange(false); }
    catch (er) { toast((er as Error).message, 'erro'); }
  }
  const lastProgress = d.reviews.at(-1)?.progress ?? 0;
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={feedback ? 'Editar feedback' : 'Novo feedback'} wide
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={save}>Salvar</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Pessoa" required value={d.person_id} onChange={(e) => set('person_id', e.target.value)} error={err.person} options={people.items.map((p) => ({ value: p.id, label: p.name }))} placeholder="Selecione…" />
        <InstitutionSelect required value={d.institution_id} onChange={(v) => set('institution_id', v)} error={err.inst} />
        <TextField label="Data" type="date" required value={d.date} onChange={(e) => set('date', e.target.value)} error={err.date} />
        <TextField label="Prazo do plano" type="date" value={d.deadline ?? ''} onChange={(e) => set('deadline', e.target.value || null)} error={err.deadline} />
        <TextArea label="Pontos positivos" value={d.positives} onChange={(e) => set('positives', e.target.value)} error={err.positives} />
        <TextArea label="A desenvolver" value={d.to_develop} onChange={(e) => set('to_develop', e.target.value)} />
        <TextArea className="sm:col-span-2" label="Plano de ação" value={d.action_plan} onChange={(e) => set('action_plan', e.target.value)} />
        <SelectField label="Status" value={d.status} onChange={(e) => set('status', e.target.value)} options={[{ value: 'aberto', label: 'Aberto' }, { value: 'em_acompanhamento', label: 'Em acompanhamento' }, { value: 'concluido', label: 'Concluído' }]} />
        <Checkbox className="self-end" label="Confidencial" checked={d.confidential} onChange={(v) => set('confidential', v)} />
        <fieldset className="sm:col-span-2 rounded-lg border border-border p-3">
          <legend className="label px-1">Revisões ({d.reviews.length})</legend>
          {d.reviews.length > 0 && <Progress className="mb-2" value={lastProgress} label="Evolução do plano" />}
          <ul className="mb-3 space-y-1 text-sm">{d.reviews.map((r, i) => <li key={i} className="rounded bg-surface-2/60 px-2 py-1"><span className="text-xs text-muted">{fmtDate(r.at.slice(0, 10))} · {r.progress}%</span> — {r.text}</li>)}</ul>
          <div className="grid gap-2 sm:grid-cols-[1fr_110px_auto]">
            <TextField label="Nova revisão" value={review.text} onChange={(e) => setReview({ ...review, text: e.target.value })} />
            <TextField label="Evolução %" type="number" min={0} max={100} value={review.progress} onChange={(e) => setReview({ ...review, progress: Math.max(0, Math.min(100, Number(e.target.value))) })} />
            <Button variant="secondary" className="self-end" onClick={() => { if (review.text.trim()) { set('reviews', [...d.reviews, { at: nowIso(), ...review }]); setReview({ text: '', progress: review.progress }); } }}>Adicionar</Button>
          </div>
        </fieldset>
      </div>
    </Dialog>
  );
}

function PinGate({ onUnlock }: { onUnlock: () => void }) {
  const { settings } = useSettings();
  const [pin, setPin] = React.useState(''); const [err, setErr] = React.useState('');
  if (!settings.permissions.feedback_pin) return (
    <EmptyState icon={<Lock />} title="Acesso restrito" description="Os feedbacks são restritos. Defina um PIN em Configurações › Permissões para liberar o acesso nesta sessão, ou desative a restrição."
      action={<Button variant="secondary" onClick={onUnlock}>Entrar mesmo assim (sem PIN definido)</Button>} />
  );
  return (
    <Card className="mx-auto max-w-sm p-6">
      <form onSubmit={async (e) => { e.preventDefault(); if (await checkPin(pin, settings.permissions.feedback_pin)) onUnlock(); else setErr('PIN incorreto.'); }} className="space-y-3">
        <p className="flex items-center gap-2 font-display text-lg uppercase"><Lock size={18} className="text-gold" />Feedbacks restritos</p>
        <TextField label="PIN de acesso" type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} error={err} autoFocus />
        <Button type="submit" className="w-full">Desbloquear</Button>
      </form>
    </Card>
  );
}

let unlockedThisSession = false;

export default function Equipes() {
  const people = useCollection('people');
  const feedbacks = useCollection('feedbacks');
  const { settings } = useSettings();
  const { matches } = useScope();
  const { confirm, confirmNode } = useConfirm();
  const toast = useToast();
  const [tab, setTab] = React.useState<'pessoas' | 'feedbacks'>('pessoas');
  const [q, setQ] = React.useState('');
  const [unlocked, setUnlocked] = React.useState(unlockedThisSession);
  const [editP, setEditP] = React.useState<Person | null>(null); const [newP, setNewP] = React.useState(false);
  const [editF, setEditF] = React.useState<Feedback | null>(null); const [newF, setNewF] = React.useState<string | null>(null);
  const restricted = settings.permissions.feedbacks_restricted && !unlocked;
  const pById = Object.fromEntries(people.items.map((p) => [p.id, p]));
  const ps = people.items.filter((p) => matches(p.institution_ids)).filter((p) => !q || `${p.name} ${p.role}`.toLowerCase().includes(q.toLowerCase()));
  const fs = feedbacks.items.filter((f) => matches(f.institution_id)).filter((f) => !q || (pById[f.person_id]?.name ?? '').toLowerCase().includes(q.toLowerCase())).sort((a, b) => b.date.localeCompare(a.date));

  async function delP(p: Person) {
    const n = feedbacks.items.filter((f) => f.person_id === p.id);
    if (!(await confirm({ title: 'Excluir pessoa', message: `Excluir “${p.name}”${n.length ? ` e ${n.length} feedback(s)` : ''}?`, danger: true, confirmLabel: 'Excluir' }))) return;
    for (const f of n) await actions.remove('feedbacks', f.id);
    await actions.remove('people', p.id); toast('Pessoa excluída.');
  }
  async function delF(f: Feedback) { if (await confirm({ title: 'Excluir feedback', message: 'Excluir este feedback?', danger: true, confirmLabel: 'Excluir' })) await actions.remove('feedbacks', f.id); }

  return (
    <div>
      <PageHeader title="Equipes e Feedbacks" subtitle={`${ps.length} pessoa(s)`}
        actions={<><Segmented label="Seção" value={tab} onChange={setTab} options={[{ value: 'pessoas', label: 'Pessoas' }, { value: 'feedbacks', label: 'Feedbacks' }]} />
          {tab === 'pessoas' ? <Button onClick={() => setNewP(true)}><UserPlus size={16} />Pessoa</Button> : !restricted && <Button onClick={() => setNewF('')}><MessageSquarePlus size={16} />Feedback</Button>}</>} />
      <SearchInput id="busca-eq" className="mb-3 max-w-md" placeholder="Buscar por nome…" value={q} onChange={setQ} />
      {people.error ? <ErrorState message={people.error} onRetry={people.reload} /> : people.loading ? <Loading /> : tab === 'pessoas' ? (
        ps.length === 0 ? <EmptyState title="Nenhuma pessoa" description="Cadastre a equipe comercial e vincule cada pessoa às instituições em que atua." action={<Button onClick={() => setNewP(true)}><Plus size={16} />Pessoa</Button>} /> : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ps.map((p) => (
              <li key={p.id}><Card className="flex h-full flex-col gap-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div><div className="font-semibold">{p.name} {p.is_demo && <DemoBadge />}</div><div className="text-xs text-muted">{p.role || 'Função não informada'}{!p.active && ' · inativo'}</div></div>
                  <div className="flex"><Button variant="ghost" size="icon" aria-label={`Editar ${p.name}`} onClick={() => setEditP(p)}><Pencil size={15} /></Button><Button variant="ghost" size="icon" aria-label={`Excluir ${p.name}`} onClick={() => delP(p)}><Trash2 size={15} /></Button></div>
                </div>
                <div className="flex flex-wrap gap-1">{p.institution_ids.map((i) => <InstitutionBadge key={i} id={i} />)}</div>
                {!restricted && <div className="mt-auto text-xs text-muted">{feedbacks.items.filter((f) => f.person_id === p.id).length} feedback(s)</div>}
                <Button variant="secondary" size="sm" className="mt-auto" onClick={() => { setTab('feedbacks'); if (!restricted) setNewF(p.id); }}><MessageSquarePlus size={14} />Dar feedback</Button>
              </Card></li>
            ))}
          </ul>
        )
      ) : restricted ? <PinGate onUnlock={() => { unlockedThisSession = true; setUnlocked(true); }} /> : feedbacks.loading ? <Loading /> : fs.length === 0 ? <EmptyState title="Nenhum feedback" action={<Button onClick={() => setNewF('')}><Plus size={16} />Feedback</Button>} /> : (
        <ul className="space-y-2">
          {fs.map((f) => (
            <li key={f.id}><Card className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">{pById[f.person_id]?.name ?? 'Pessoa removida'} {f.is_demo && <DemoBadge />}</div>
                  <div className="flex flex-wrap gap-1 text-xs text-muted">{fmtDate(f.date)} <InstitutionBadge id={f.institution_id} /><span className="chip border-border">{f.status === 'aberto' ? 'Aberto' : f.status === 'concluido' ? 'Concluído' : 'Em acompanhamento'}</span>
                    {f.deadline && <span className={`chip border-border ${f.deadline < todayISO() && f.status !== 'concluido' ? 'text-danger' : ''}`}>Prazo {fmtDate(f.deadline)}</span>}{f.confidential && <span className="chip border-border"><Lock size={10} />Confidencial</span>}</div>
                </div>
                <div className="flex"><Button variant="ghost" size="icon" aria-label="Editar feedback" onClick={() => setEditF(f)}><Pencil size={15} /></Button><Button variant="ghost" size="icon" aria-label="Excluir feedback" onClick={() => delF(f)}><Trash2 size={15} /></Button></div>
              </div>
              <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
                <div><dt className="label">Positivos</dt><dd>{f.positives || '—'}</dd></div>
                <div><dt className="label">A desenvolver</dt><dd>{f.to_develop || '—'}</dd></div>
                <div><dt className="label">Plano de ação</dt><dd>{f.action_plan || '—'}</dd></div>
              </dl>
            </Card></li>
          ))}
        </ul>
      )}
      <PersonDialog open={newP || !!editP} person={editP} onOpenChange={(o) => { if (!o) { setNewP(false); setEditP(null); } }} />
      <FeedbackDialog open={newF !== null || !!editF} feedback={editF} personId={newF ?? undefined} onOpenChange={(o) => { if (!o) { setNewF(null); setEditF(null); } }} />
      {confirmNode}
    </div>
  );
}
