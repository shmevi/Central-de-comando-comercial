import * as React from 'react';
import { GraduationCap, Pencil, Plus, Trash2 } from 'lucide-react';
import { actions, useCollection } from '@/data/store';
import { useScope } from '@/app/scope';
import { PageHeader, Loading, ErrorState, EmptyState, Card, DemoBadge, Progress } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { useDraft } from '@/components/ui/use-draft';
import { Dialog, useConfirm } from '@/components/ui/dialog';
import { Checkbox, SelectField, TextArea, TextField } from '@/components/ui/form';
import { InstitutionBadge, InstitutionSelect } from '@/components/domain/Institution';
import { useToast } from '@/components/ui/toast';
import { TRACKS } from '@/domain/labels';
import type { Training } from '@/domain/types';
import { fmtDate } from '@/lib/time';
import { cn } from '@/lib/utils';

function TrainingDialog({ open, onOpenChange, training }: { open: boolean; onOpenChange: (o: boolean) => void; training: Training | null }) {
  const people = useCollection('people');
  const toast = useToast();
  const empty = (): Omit<Training, 'id' | 'created_at' | 'updated_at'> => ({ title: '', track: 'atendimento', institution_id: null, date: null, duration_min: 60, description: '', attendees: [] });
  const { d, set, err, setErr } = useDraft(open, () => training ? { ...training } : empty(), [training]);
  const eligible = people.items.filter((p) => p.active && (!d.institution_id || p.institution_ids.includes(d.institution_id)));
  const att = (id: string) => d.attendees.find((a) => a.person_id === id);
  async function save() {
    const e: Record<string, string> = {};
    if (!d.title.trim()) e.title = 'Informe o título.';
    if (!(d.duration_min > 0)) e.dur = 'Duração deve ser maior que zero.';
    if (d.attendees.some((a) => a.score != null && (a.score < 0 || a.score > 10))) e.att = 'Notas de 0 a 10.';
    setErr(e); if (Object.keys(e).length) return;
    try { training ? await actions.update('trainings', training.id, d) : await actions.create('trainings', d); toast('Treinamento salvo.'); onOpenChange(false); }
    catch (er) { toast((er as Error).message, 'erro'); }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={training ? 'Editar treinamento' : 'Novo treinamento'} wide
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={save}>Salvar</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField className="sm:col-span-2" label="Título" required value={d.title} onChange={(e) => set('title', e.target.value)} error={err.title} />
        <SelectField label="Trilha" value={d.track} onChange={(e) => set('track', e.target.value)} options={TRACKS} />
        <InstitutionSelect value={d.institution_id} onChange={(v) => set('institution_id', v)} />
        <TextField label="Data" type="date" value={d.date ?? ''} onChange={(e) => set('date', e.target.value || null)} />
        <TextField label="Duração (min)" type="number" min={1} value={d.duration_min} onChange={(e) => set('duration_min', Number(e.target.value))} error={err.dur} />
        <TextArea className="sm:col-span-2" label="Conteúdo" value={d.description} onChange={(e) => set('description', e.target.value)} />
        <fieldset className="sm:col-span-2 rounded-lg border border-border p-3">
          <legend className="label px-1">Participantes, presença e avaliação</legend>
          {eligible.length === 0 ? <p className="text-sm text-muted">Nenhuma pessoa ativa {d.institution_id ? 'nesta instituição' : ''}. Cadastre em Equipes.</p> : (
            <ul className="space-y-2">{eligible.map((p) => {
              const a = att(p.id);
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-3 text-sm">
                  <Checkbox className="min-w-[180px] flex-1" label={p.name} checked={!!a} onChange={(v) => set('attendees', v ? [...d.attendees, { person_id: p.id, present: false, score: null }] : d.attendees.filter((x) => x.person_id !== p.id))} />
                  {a && <>
                    <Checkbox label="Presente" checked={a.present} onChange={(v) => set('attendees', d.attendees.map((x) => x.person_id === p.id ? { ...x, present: v } : x))} />
                    <label className="flex items-center gap-1 text-xs">Nota<input type="number" min={0} max={10} step={0.5} className="field h-8 w-20" value={a.score ?? ''} onChange={(e) => set('attendees', d.attendees.map((x) => x.person_id === p.id ? { ...x, score: e.target.value === '' ? null : Number(e.target.value) } : x))} /></label>
                  </>}
                </li>
              );
            })}</ul>
          )}
          {err.att && <p role="alert" className="text-xs text-danger">{err.att}</p>}
        </fieldset>
      </div>
    </Dialog>
  );
}

export default function Treinamentos() {
  const trainings = useCollection('trainings');
  const { matches } = useScope();
  const { confirmDelete, confirmNode } = useConfirm();
  const [track, setTrack] = React.useState('');
  const [editing, setEditing] = React.useState<Training | null>(null); const [creating, setCreating] = React.useState(false);
  const list = trainings.items.filter((t) => matches(t.institution_id)).filter((t) => !track || t.track === track).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  const byTrack = TRACKS.map((tr) => { const ts = trainings.items.filter((t) => t.track === tr.value && matches(t.institution_id)); return { ...tr, count: ts.length, done: ts.filter((t) => t.attendees.some((a) => a.present)).length }; });
  return (
    <div>
      <PageHeader title="Treinamentos" subtitle="Catálogo, presença, avaliação e trilhas" actions={<Button onClick={() => setCreating(true)}><Plus size={16} />Treinamento</Button>} />
      <section aria-label="Trilhas" className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {byTrack.map((t) => (
          <button key={t.value} type="button" aria-pressed={track === t.value} onClick={() => setTrack(track === t.value ? '' : t.value)} className={cn('card p-3 text-left', track === t.value && 'border-gold-300')}>
            <div className="font-display text-sm font-bold uppercase text-gold">{t.label}</div>
            <div className="text-xs text-muted">{t.count} treinamento(s)</div>
            <Progress className="mt-2" value={t.count ? (t.done / t.count) * 100 : 0} label={`Realizados na trilha ${t.label}`} />
          </button>
        ))}
      </section>
      {trainings.error ? <ErrorState message={trainings.error} onRetry={trainings.reload} /> : trainings.loading ? <Loading /> : list.length === 0 ? <EmptyState icon={<GraduationCap />} title="Nenhum treinamento" action={<Button onClick={() => setCreating(true)}><Plus size={16} />Treinamento</Button>} /> : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {list.map((t) => {
            const present = t.attendees.filter((a) => a.present).length;
            const scores = t.attendees.map((a) => a.score).filter((s): s is number => s != null);
            return (
              <li key={t.id}><Card className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div><div className="font-semibold">{t.title} {t.is_demo && <DemoBadge />}</div>
                    <div className="flex flex-wrap gap-1 text-xs text-muted"><span className="chip border-gold-300/50 text-gold">{TRACKS.find((x) => x.value === t.track)?.label}</span><InstitutionBadge id={t.institution_id} />{fmtDate(t.date)} · {t.duration_min} min</div></div>
                  <div className="flex"><Button variant="ghost" size="icon" aria-label={`Editar ${t.title}`} onClick={() => setEditing(t)}><Pencil size={15} /></Button>
                    <Button variant="ghost" size="icon" aria-label={`Excluir ${t.title}`} onClick={() => confirmDelete('Excluir treinamento', `“${t.title}”`, () => actions.remove('trainings', t.id))}><Trash2 size={15} /></Button></div>
                </div>
                <p className="mt-2 text-sm">Presença: <strong>{present}/{t.attendees.length}</strong> · Nota média: <strong>{scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : 'não avaliado'}</strong></p>
              </Card></li>
            );
          })}
        </ul>
      )}
      <TrainingDialog open={creating || !!editing} training={editing} onOpenChange={(o) => { if (!o) { setCreating(false); setEditing(null); } }} />
      {confirmNode}
    </div>
  );
}
