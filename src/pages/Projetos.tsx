import * as React from 'react';
import { FolderKanban, Link2, Pencil, Plus, Trash2 } from 'lucide-react';
import { actions, useCollection } from '@/data/store';
import { useScope } from '@/app/scope';
import { PageHeader, Loading, ErrorState, EmptyState, Card, DemoBadge, Progress } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { useDraft } from '@/components/ui/use-draft';
import { Dialog, useConfirm } from '@/components/ui/dialog';
import { Checkbox, SelectField, TextArea, TextField } from '@/components/ui/form';
import { InstitutionBadge, InstitutionSelect } from '@/components/domain/Institution';
import { useToast } from '@/components/ui/toast';
import type { Project, ProjectStep } from '@/domain/types';
import { fmtDate, todayISO } from '@/lib/time';
import { uid, cn } from '@/lib/utils';

const STATUS: Record<Project['status'], string> = { proposto: 'Proposto', em_andamento: 'Em andamento', pausado: 'Pausado', concluido: 'Concluído' };
export const projectProgress = (p: Project) => (p.steps.length ? Math.round((p.steps.filter((s) => s.done).length / p.steps.length) * 100) : null);
const blocked = (s: ProjectStep, steps: ProjectStep[]) => !!s.depends_on && !steps.find((x) => x.id === s.depends_on)?.done;

function ProjectDialog({ open, onOpenChange, item }: { open: boolean; onOpenChange: (o: boolean) => void; item: Project | null }) {
  const toast = useToast();
  const empty = (): Omit<Project, 'id' | 'created_at' | 'updated_at'> => ({ name: '', institution_id: null, owner: '', description: '', status: 'proposto', status_confirmed: false, start_date: null, end_date: null, steps: [] });
  const { d, set, err, setErr } = useDraft(open, () => item ? { ...item } : empty(), [item]);
  const setStep = (id: string, patch: Partial<ProjectStep>) => set('steps', d.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  async function save() {
    const e: Record<string, string> = {};
    if (!d.name.trim()) e.name = 'Informe o nome.';
    if (d.status === 'em_andamento' && !d.status_confirmed) e.status = 'Confirme explicitamente que o projeto está em andamento.';
    if (d.start_date && d.end_date && d.end_date < d.start_date) e.end = 'Término antes do início.';
    if (d.steps.some((s) => !s.title.trim())) e.steps = 'Toda etapa precisa de título.';
    if (d.steps.some((s) => s.done && blocked(s, d.steps))) e.steps = 'Há etapa concluída cuja dependência ainda não foi concluída.';
    setErr(e); if (Object.keys(e).length) return;
    try { item ? await actions.update('projects', item.id, d) : await actions.create('projects', d); toast('Projeto salvo.'); onOpenChange(false); } catch (er) { toast((er as Error).message, 'erro'); }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={item ? 'Editar projeto' : 'Novo projeto'} wide
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={save}>Salvar</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField className="sm:col-span-2" label="Nome" required value={d.name} onChange={(e) => set('name', e.target.value)} error={err.name} />
        <InstitutionSelect value={d.institution_id} onChange={(v) => set('institution_id', v)} />
        <TextField label="Responsável" value={d.owner} onChange={(e) => set('owner', e.target.value)} />
        <TextField label="Início" type="date" value={d.start_date ?? ''} onChange={(e) => set('start_date', e.target.value || null)} />
        <TextField label="Término previsto" type="date" value={d.end_date ?? ''} onChange={(e) => set('end_date', e.target.value || null)} error={err.end} />
        <SelectField label="Status" value={d.status} onChange={(e) => { set('status', e.target.value); if (e.target.value !== 'em_andamento') set('status_confirmed', false); }} options={Object.entries(STATUS).map(([value, label]) => ({ value, label }))} error={err.status} />
        {d.status === 'em_andamento' && <Checkbox className="self-end" label="Confirmo que o projeto está de fato em andamento" checked={d.status_confirmed} onChange={(v) => set('status_confirmed', v)} />}
        <TextArea className="sm:col-span-2" label="Descrição" value={d.description} onChange={(e) => set('description', e.target.value)} />
        <fieldset className="sm:col-span-2 space-y-2 rounded-lg border border-border p-3">
          <legend className="label px-1">Etapas e entregas</legend>
          {d.steps.map((s) => (
            <div key={s.id} className="grid gap-2 rounded-lg bg-surface-2/50 p-2 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_140px_140px_160px_auto]">
              <TextField label="Etapa" value={s.title} onChange={(e) => setStep(s.id, { title: e.target.value })} />
              <TextField label="Entrega" value={s.deliverable} onChange={(e) => setStep(s.id, { deliverable: e.target.value })} />
              <TextField label="Responsável" value={s.owner} onChange={(e) => setStep(s.id, { owner: e.target.value })} />
              <TextField label="Prazo" type="date" value={s.deadline ?? ''} onChange={(e) => setStep(s.id, { deadline: e.target.value || null })} />
              <SelectField label="Depende de" value={s.depends_on ?? ''} onChange={(e) => setStep(s.id, { depends_on: e.target.value || null })} options={d.steps.filter((x) => x.id !== s.id).map((x) => ({ value: x.id, label: x.title || '(sem título)' }))} placeholder="Nenhuma" />
              <div className="flex items-end gap-1">
                <Checkbox label="Feita" checked={s.done} disabled={blocked(s, d.steps) && !s.done} onChange={(v) => setStep(s.id, { done: v })} />
                <Button variant="ghost" size="icon" aria-label="Remover etapa" onClick={() => set('steps', d.steps.filter((x) => x.id !== s.id).map((x) => (x.depends_on === s.id ? { ...x, depends_on: null } : x)))}><Trash2 size={14} /></Button>
              </div>
            </div>
          ))}
          {err.steps && <p role="alert" className="text-xs text-danger">{err.steps}</p>}
          <Button variant="secondary" size="sm" onClick={() => set('steps', [...d.steps, { id: uid(), title: '', owner: '', deadline: null, done: false, depends_on: null, deliverable: '' }])}><Plus size={14} />Etapa</Button>
        </fieldset>
      </div>
    </Dialog>
  );
}

export default function Projetos() {
  const projects = useCollection('projects');
  const { matches } = useScope();
  const { confirmDelete, confirmNode } = useConfirm();
  const [editing, setEditing] = React.useState<Project | null>(null); const [creating, setCreating] = React.useState(false);
  const list = projects.items.filter((p) => matches(p.institution_id));
  const today = todayISO();
  return (
    <div>
      <PageHeader title="Projetos" subtitle="Etapas, entregas, responsáveis e dependências" actions={<Button onClick={() => setCreating(true)}><Plus size={16} />Projeto</Button>} />
      {projects.error ? <ErrorState message={projects.error} onRetry={projects.reload} /> : projects.loading ? <Loading /> : list.length === 0 ? <EmptyState icon={<FolderKanban />} title="Nenhum projeto" action={<Button onClick={() => setCreating(true)}><Plus size={16} />Projeto</Button>} /> : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {list.map((p) => {
            const prog = projectProgress(p);
            const statusLabel = p.status === 'em_andamento' && !p.status_confirmed ? 'Andamento não confirmado' : STATUS[p.status];
            return (
              <li key={p.id}><Card className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <div><div className="font-semibold">{p.name} {p.is_demo && <DemoBadge />}</div>
                    <div className="flex flex-wrap gap-1 text-xs text-muted"><InstitutionBadge id={p.institution_id} /><span className={cn('chip', p.status === 'concluido' ? 'border-success/60 text-success' : p.status === 'em_andamento' && p.status_confirmed ? 'border-gold-300/60 text-gold' : 'border-border')}>{statusLabel}</span>
                      {p.end_date && <span className={cn(p.end_date < today && p.status !== 'concluido' && 'text-danger')}>até {fmtDate(p.end_date)}</span>}</div></div>
                  <div className="flex"><Button variant="ghost" size="icon" aria-label={`Editar ${p.name}`} onClick={() => setEditing(p)}><Pencil size={15} /></Button>
                    <Button variant="ghost" size="icon" aria-label={`Excluir ${p.name}`} onClick={() => confirmDelete('Excluir projeto', `“${p.name}”`, () => actions.remove('projects', p.id))}><Trash2 size={15} /></Button></div>
                </div>
                <div className="mt-3"><div className="mb-1 flex justify-between text-xs"><span className="text-muted">Etapas</span><span className="text-gold">{prog == null ? 'Sem etapas' : `${prog}%`}</span></div>{prog != null && <Progress value={prog} label={`Progresso de ${p.name}`} />}</div>
                <ol className="mt-3 space-y-1 text-sm">
                  {p.steps.map((s) => (
                    <li key={s.id} className="flex items-center gap-2">
                      <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--gold-300))]" checked={s.done} disabled={blocked(s, p.steps) && !s.done} aria-label={`Concluir etapa ${s.title}`}
                        onChange={(e) => actions.update('projects', p.id, { steps: p.steps.map((x) => (x.id === s.id ? { ...x, done: e.target.checked } : x)) })} />
                      <span className={cn('flex-1', s.done && 'line-through text-muted')}>{s.title}{s.deliverable && <span className="text-xs text-muted"> · {s.deliverable}</span>}</span>
                      {blocked(s, p.steps) && <span className="chip border-orange/50 text-orange"><Link2 size={10} />bloqueada</span>}
                      {s.owner && <span className="text-xs text-muted">{s.owner}</span>}
                    </li>
                  ))}
                </ol>
              </Card></li>
            );
          })}
        </ul>
      )}
      <ProjectDialog open={creating || !!editing} item={editing} onOpenChange={(o) => { if (!o) { setCreating(false); setEditing(null); } }} />
      {confirmNode}
    </div>
  );
}
