import * as React from 'react';
import { ExternalLink, Pencil, Plus, Trash2 } from 'lucide-react';
import { actions, useCollection } from '@/data/store';
import { useScope } from '@/app/scope';
import { PageHeader, Segmented, Loading, ErrorState, EmptyState, Card, DemoBadge } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { useDraft } from '@/components/ui/use-draft';
import { Dialog, useConfirm } from '@/components/ui/dialog';
import { KanbanBoard } from '@/components/ui/kanban';
import { SelectField, TextArea, TextField } from '@/components/ui/form';
import { InstitutionBadge, InstitutionMulti, InstitutionSelect } from '@/components/domain/Institution';
import { useToast } from '@/components/ui/toast';
import { IMPROVEMENT_STAGES } from '@/domain/labels';
import type { Improvement, ImprovementStage, SystemItem } from '@/domain/types';
import { fmtDate, todayISO } from '@/lib/time';
import { cn, safeHttpUrl } from '@/lib/utils';

function SystemDialog({ open, onOpenChange, item }: { open: boolean; onOpenChange: (o: boolean) => void; item: SystemItem | null }) {
  const toast = useToast();
  const empty = (): Omit<SystemItem, 'id' | 'created_at' | 'updated_at'> => ({ name: '', purpose: '', owner: '', institution_ids: [], status: 'ativo', url: '' });
  const { d, set, err, setErr } = useDraft(open, () => item ? { ...item } : empty(), [item]);
  async function save() {
    const e: Record<string, string> = {};
    if (!d.name.trim()) e.name = 'Informe o nome.';
    if (d.url && !safeHttpUrl(d.url)) e.url = 'Use um endereço válido iniciando com http:// ou https://';
    setErr(e); if (Object.keys(e).length) return;
    try { item ? await actions.update('systems', item.id, d) : await actions.create('systems', d); toast('Sistema salvo.'); onOpenChange(false); } catch (er) { toast((er as Error).message, 'erro'); }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={item ? 'Editar sistema' : 'Novo sistema'}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={save}>Salvar</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Nome" required value={d.name} onChange={(e) => set('name', e.target.value)} error={err.name} />
        <TextField label="Responsável" value={d.owner} onChange={(e) => set('owner', e.target.value)} />
        <TextArea className="sm:col-span-2" label="Finalidade" value={d.purpose} onChange={(e) => set('purpose', e.target.value)} />
        <SelectField label="Status" value={d.status} onChange={(e) => set('status', e.target.value)} options={[{ value: 'ativo', label: 'Ativo' }, { value: 'em_avaliacao', label: 'Em avaliação' }, { value: 'descontinuado', label: 'Descontinuado' }]} />
        <TextField label="Endereço (URL)" value={d.url} onChange={(e) => set('url', e.target.value)} error={err.url} />
        <div className="sm:col-span-2"><InstitutionMulti value={d.institution_ids} onChange={(v) => set('institution_ids', v)} /></div>
      </div>
    </Dialog>
  );
}

function ImprovementDialog({ open, onOpenChange, item }: { open: boolean; onOpenChange: (o: boolean) => void; item: Improvement | null }) {
  const systems = useCollection('systems');
  const toast = useToast();
  const empty = (): Omit<Improvement, 'id' | 'created_at' | 'updated_at'> => ({ title: '', description: '', system_id: null, institution_id: null, stage: 'backlog', kind: 'proposta', implemented_at: null, impact: '' });
  const { d, set, err, setErr } = useDraft(open, () => item ? { ...item } : empty(), [item]);
  async function save() {
    const e: Record<string, string> = {};
    if (!d.title.trim()) e.title = 'Informe o título.';
    if (d.kind === 'implantada' && !d.implemented_at) e.impl = 'Informe a data em que a implantação foi confirmada.';
    if (d.kind === 'implantada' && d.stage !== 'concluido') e.impl = 'Só marque como implantada quando a etapa for “Concluído”.';
    setErr(e); if (Object.keys(e).length) return;
    try { item ? await actions.update('improvements', item.id, d) : await actions.create('improvements', d); toast('Melhoria salva.'); onOpenChange(false); } catch (er) { toast((er as Error).message, 'erro'); }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={item ? 'Editar melhoria' : 'Nova melhoria'}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={save}>Salvar</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField className="sm:col-span-2" label="Título" required value={d.title} onChange={(e) => set('title', e.target.value)} error={err.title} />
        <TextArea className="sm:col-span-2" label="Descrição" value={d.description} onChange={(e) => set('description', e.target.value)} />
        <SelectField label="Sistema" value={d.system_id ?? ''} onChange={(e) => set('system_id', e.target.value || null)} options={systems.items.map((s) => ({ value: s.id, label: s.name }))} placeholder="Nenhum / processo" />
        <InstitutionSelect value={d.institution_id} onChange={(v) => set('institution_id', v)} />
        <SelectField label="Etapa" value={d.stage} onChange={(e) => set('stage', e.target.value)} options={IMPROVEMENT_STAGES} />
        <SelectField label="Situação" value={d.kind} onChange={(e) => set('kind', e.target.value)} options={[{ value: 'proposta', label: 'Proposta (não implantada)' }, { value: 'implantada', label: 'Implantação efetiva confirmada' }]} error={err.impl} />
        {d.kind === 'implantada' && <TextField label="Implantada em" type="date" value={d.implemented_at ?? ''} max={todayISO()} onChange={(e) => set('implemented_at', e.target.value || null)} />}
        <TextArea className="sm:col-span-2" label="Impacto esperado / observado" value={d.impact} onChange={(e) => set('impact', e.target.value)} />
      </div>
    </Dialog>
  );
}

export default function Sistemas() {
  const systems = useCollection('systems');
  const improvements = useCollection('improvements');
  const { matches } = useScope();
  const { confirmDelete, confirmNode } = useConfirm();
  const [tab, setTab] = React.useState<'melhorias' | 'inventario'>('melhorias');
  const [editS, setEditS] = React.useState<SystemItem | null>(null); const [newS, setNewS] = React.useState(false);
  const [editI, setEditI] = React.useState<Improvement | null>(null); const [newI, setNewI] = React.useState(false);
  const sName = Object.fromEntries(systems.items.map((s) => [s.id, s.name]));
  const imps = improvements.items.filter((i) => matches(i.institution_id));
  const move = (id: string, stage: ImprovementStage) => {
    const i = improvements.items.find((x) => x.id === id); if (!i || i.stage === stage) return;
    actions.update('improvements', id, { stage, ...(stage !== 'concluido' && i.kind === 'implantada' ? { kind: 'proposta', implemented_at: null } : {}) });
  };
  return (
    <div>
      <PageHeader title="Sistemas e Melhorias" subtitle={`${imps.filter((i) => i.kind === 'implantada').length} implantada(s) · ${imps.filter((i) => i.kind === 'proposta').length} proposta(s)`}
        actions={<><Segmented label="Seção" value={tab} onChange={setTab} options={[{ value: 'melhorias', label: 'Melhorias' }, { value: 'inventario', label: 'Inventário' }]} />
          <Button onClick={() => (tab === 'melhorias' ? setNewI(true) : setNewS(true))}><Plus size={16} />{tab === 'melhorias' ? 'Melhoria' : 'Sistema'}</Button></>} />
      {(systems.error || improvements.error) ? <ErrorState message={(systems.error || improvements.error)!} /> : (systems.loading || improvements.loading) ? <Loading /> : tab === 'melhorias' ? (
        <KanbanBoard columns={IMPROVEMENT_STAGES} items={imps} columnOf={(i) => i.stage} onMove={move} itemLabel={(i) => i.title} minWidth={1260} compactTitle
          renderCard={(i) => (<>
            <div className="flex items-start justify-between gap-1">
              <button type="button" className="text-left font-semibold hover:text-gold" onClick={() => setEditI(i)}>{i.title}</button>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label={`Excluir ${i.title}`} onClick={() => confirmDelete('Excluir melhoria', `“${i.title}”`, () => actions.remove('improvements', i.id))}><Trash2 size={14} /></Button>
            </div>
            <div className="mt-1 flex flex-wrap gap-1 text-xs">
              <span className={cn('chip', i.kind === 'implantada' ? 'border-success/60 text-success' : 'border-border text-muted')}>{i.kind === 'implantada' ? `Implantada ${fmtDate(i.implemented_at)}` : 'Proposta'}</span>
              {i.system_id && <span className="chip border-border text-muted">{sName[i.system_id] ?? '—'}</span>}
              <InstitutionBadge id={i.institution_id} />{i.is_demo && <DemoBadge />}
            </div>
          </>)} />
      ) : (() => {
        const ss = systems.items.filter((s) => matches(s.institution_ids));
        return ss.length === 0 ? <EmptyState title="Nenhum sistema" description="Cadastre os sistemas usados pela área comercial (CRM, ERP, planilhas…)." action={<Button onClick={() => setNewS(true)}><Plus size={16} />Sistema</Button>} /> : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ss.map((s) => (
              <li key={s.id}><Card className="p-4">
                <div className="flex items-start justify-between">
                  <div><div className="font-semibold">{s.name} {s.is_demo && <DemoBadge />}</div><div className="text-xs text-muted">{s.status === 'ativo' ? 'Ativo' : s.status === 'em_avaliacao' ? 'Em avaliação' : 'Descontinuado'}{s.owner && ` · ${s.owner}`}</div></div>
                  <div className="flex">{safeHttpUrl(s.url) && <Button asChild variant="ghost" size="icon"><a href={safeHttpUrl(s.url)!} target="_blank" rel="noreferrer noopener" aria-label={`Abrir ${s.name}`}><ExternalLink size={15} /></a></Button>}
                    <Button variant="ghost" size="icon" aria-label={`Editar ${s.name}`} onClick={() => setEditS(s)}><Pencil size={15} /></Button>
                    <Button variant="ghost" size="icon" aria-label={`Excluir ${s.name}`} onClick={() => confirmDelete('Excluir sistema', `“${s.name}” do inventário (o sistema real não é alterado)`, () => actions.remove('systems', s.id))}><Trash2 size={15} /></Button></div>
                </div>
                {s.purpose && <p className="mt-2 text-sm text-muted">{s.purpose}</p>}
                <div className="mt-2 flex flex-wrap gap-1">{s.institution_ids.map((i) => <InstitutionBadge key={i} id={i} />)}</div>
                <p className="mt-2 text-xs text-muted">{improvements.items.filter((i) => i.system_id === s.id).length} melhoria(s)</p>
              </Card></li>
            ))}
          </ul>
        );
      })()}
      <SystemDialog open={newS || !!editS} item={editS} onOpenChange={(o) => { if (!o) { setNewS(false); setEditS(null); } }} />
      <ImprovementDialog open={newI || !!editI} item={editI} onOpenChange={(o) => { if (!o) { setNewI(false); setEditI(null); } }} />
      {confirmNode}
    </div>
  );
}
