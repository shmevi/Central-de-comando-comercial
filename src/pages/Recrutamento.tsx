import * as React from 'react';
import { CalendarPlus, MessageCircle, Pencil, Plus, ShieldAlert, Trash2 } from 'lucide-react';
import { actions, useCollection } from '@/data/store';
import { useScope } from '@/app/scope';
import { PageHeader, Segmented, Loading, ErrorState, EmptyState, Card, DemoBadge } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/dialog';
import { SearchInput } from '@/components/ui/search';
import { KanbanBoard } from '@/components/ui/kanban';
import { useToast } from '@/components/ui/toast';
import { InstitutionBadge } from '@/components/domain/Institution';
import { CandidateDialog, InterviewDialog, InviteDialog } from '@/features/recruitment/dialogs';
import { ATTENDANCE, STAGES, STAGE_LABEL } from '@/domain/labels';
import type { Candidate, CandidateStage, Interview } from '@/domain/types';
import { conflictingIds } from '@/lib/conflicts';
import { fmtDate, todayISO } from '@/lib/time';
import { nowIso, cn } from '@/lib/utils';

export default function Recrutamento() {
  const candidates = useCollection('candidates');
  const interviews = useCollection('interviews');
  const { matches } = useScope();
  const toast = useToast();
  const { confirm, confirmDelete, confirmNode } = useConfirm();
  const [tab, setTab] = React.useState<'pipeline' | 'entrevistas'>('pipeline');
  const [q, setQ] = React.useState('');
  const [editC, setEditC] = React.useState<Candidate | null>(null);
  const [newC, setNewC] = React.useState(false);
  const [editI, setEditI] = React.useState<Interview | null>(null);
  const [newI, setNewI] = React.useState<string | null>(null);
  const [invite, setInvite] = React.useState<Interview | null>(null);
  const today = todayISO();

  const cs = candidates.items.filter((c) => matches(c.institution_id)).filter((c) => !q || `${c.name} ${c.position} ${c.email}`.toLowerCase().includes(q.toLowerCase()));
  const byId = Object.fromEntries(candidates.items.map((c) => [c.id, c]));
  const ivs = interviews.items.filter((i) => matches(i.institution_id)).sort((a, b) => (a.date + (a.start || '99')).localeCompare(b.date + (b.start || '99')));
  const conflictSet = conflictingIds(ivs.filter((i) => i.start && i.end));
  const expired = candidates.items.filter((c) => matches(c.institution_id) && c.retention_until && c.retention_until < today);

  async function moveStage(id: string, stage: CandidateStage) {
    const c = byId[id]; if (!c || c.stage === stage) return;
    try { await actions.update('candidates', id, { stage, history: [...c.history, { at: nowIso(), action: 'Etapa alterada', detail: `${STAGE_LABEL[c.stage]} → ${STAGE_LABEL[stage]}` }] }); }
    catch (e) { toast((e as Error).message, 'erro'); }
  }
  async function delC(c: Candidate) {
    const n = interviews.items.filter((i) => i.candidate_id === c.id);
    if (!(await confirm({ title: 'Excluir candidato', message: `Excluir os dados de “${c.name}”${n.length ? ` e ${n.length} entrevista(s)` : ''}? (LGPD: eliminação definitiva)`, danger: true, confirmLabel: 'Excluir' }))) return;
    for (const i of n) await actions.remove('interviews', i.id);
    await actions.remove('candidates', c.id); toast('Dados do candidato excluídos.');
  }
  async function delI(i: Interview) {
    await confirmDelete('Excluir entrevista', 'esta entrevista', () => actions.remove('interviews', i.id));
  }
  async function setAttendance(i: Interview, a: Interview['attendance']) {
    try {
      await actions.update('interviews', i.id, { attendance: a });
      const c = byId[i.candidate_id];
      if (a === 'compareceu' && c?.stage === 'entrevista_agendada')
        await actions.update('candidates', c.id, { stage: 'entrevistado', history: [...c.history, { at: nowIso(), action: 'Entrevistado' }] });
      toast('Presença atualizada.');
    } catch (e) { toast((e as Error).message, 'erro'); }
  }

  const loading = candidates.loading || interviews.loading;
  const error = candidates.error || interviews.error;

  return (
    <div>
      <PageHeader title="Recrutamento" subtitle={`${cs.length} candidato(s) · ${ivs.filter((i) => i.date >= today).length} entrevista(s) futuras`}
        actions={<>
          <Segmented label="Seção" value={tab} onChange={setTab} options={[{ value: 'pipeline', label: 'Pipeline' }, { value: 'entrevistas', label: 'Entrevistas' }]} />
          <Button variant="secondary" onClick={() => setNewI('')}><CalendarPlus size={16} />Entrevista</Button>
          <Button onClick={() => setNewC(true)}><Plus size={16} />Candidato</Button>
        </>} />

      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-3 text-xs text-muted">
        <ShieldAlert size={16} className="text-gold" aria-hidden />
        <span>LGPD: colete só o necessário, registre o consentimento e defina prazo de retenção. Convites são copiados, nunca enviados automaticamente.</span>
        {expired.length > 0 && <span className="chip border-orange/60 text-orange">{expired.length} candidato(s) com prazo de retenção vencido</span>}
      </div>

      {error ? <ErrorState message={error} onRetry={() => { candidates.reload(); interviews.reload(); }} /> : loading ? <Loading /> : tab === 'pipeline' ? (
        <>
          <SearchInput id="busca-cand" className="mb-3 max-w-md" label="Buscar candidato" placeholder="Buscar candidato…" value={q} onChange={setQ} />
          {candidates.items.length === 0 ? <EmptyState title="Nenhum candidato" description="Cadastre os candidatos de vendas recebidos para iniciar a triagem." action={<Button onClick={() => setNewC(true)}><Plus size={16} />Candidato</Button>} /> : (
            <KanbanBoard columns={STAGES} items={cs} columnOf={(c) => c.stage} onMove={moveStage} itemLabel={(c) => c.name} minWidth={1680} compactTitle
              renderCard={(c) => (<>
                <div className="flex items-start justify-between gap-1">
                  <button type="button" className="text-left font-semibold hover:text-gold" onClick={() => setEditC(c)}>{c.name}</button>
                  <span className="flex shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Agendar entrevista para ${c.name}`} onClick={() => setNewI(c.id)}><CalendarPlus size={14} /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Excluir ${c.name}`} onClick={() => delC(c)}><Trash2 size={14} /></Button>
                  </span>
                </div>
                <div className="text-xs text-muted">{c.position}</div>
                <div className="mt-1 flex flex-wrap gap-1"><InstitutionBadge id={c.institution_id} />{c.is_demo && <DemoBadge />}{!c.consent_lgpd && <span className="chip border-orange/50 text-orange">Sem consentimento</span>}</div>
              </>)} />
          )}
        </>
      ) : ivs.length === 0 ? <EmptyState title="Nenhuma entrevista" description="Agende entrevistas a partir dos candidatos selecionados. Não registre horários sem confirmação." action={<Button onClick={() => setNewI('')}><CalendarPlus size={16} />Agendar</Button>} /> : (
        <ul className="space-y-2">
          {ivs.map((i) => {
            const c = byId[i.candidate_id];
            return (
              <li key={i.id}>
                <Card className={cn('flex flex-wrap items-center gap-3 p-3', conflictSet.has(i.id) && 'border-danger/60')}>
                  <div className="w-32 shrink-0">
                    <div className="font-semibold">{fmtDate(i.date)}</div>
                    <div className="text-xs text-muted">{i.time_confirmed ? `${i.start}–${i.end}` : i.start ? `${i.start} (a confirmar)` : 'Horário a confirmar'}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{c?.name ?? 'Candidato removido'} {c?.is_demo && <DemoBadge />}</div>
                    <div className="flex flex-wrap gap-1 text-xs"><InstitutionBadge id={i.institution_id} />{conflictSet.has(i.id) && <span className="chip border-danger/60 text-danger">Conflito</span>}
                      {i.decision !== 'pendente' && <span className="chip border-gold-300/60 text-gold">{STAGE_LABEL[i.decision]}</span>}</div>
                  </div>
                  <label><span className="sr-only">Presença</span>
                    <select className="field h-8 w-auto py-0 text-xs" value={i.attendance} onChange={(e) => setAttendance(i, e.target.value as any)}>
                      {Object.entries(ATTENDANCE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </label>
                  <div className="flex">
                    <Button variant="ghost" size="icon" aria-label="Gerar convite para WhatsApp" onClick={() => setInvite(i)}><MessageCircle size={16} /></Button>
                    <Button variant="ghost" size="icon" aria-label="Editar entrevista" onClick={() => setEditI(i)}><Pencil size={16} /></Button>
                    <Button variant="ghost" size="icon" aria-label="Excluir entrevista" onClick={() => delI(i)}><Trash2 size={16} /></Button>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      <CandidateDialog open={newC || !!editC} candidate={editC} onOpenChange={(o) => { if (!o) { setNewC(false); setEditC(null); } }} />
      <InterviewDialog open={newI !== null || !!editI} interview={editI} candidateId={newI ?? undefined} onOpenChange={(o) => { if (!o) { setNewI(null); setEditI(null); } }} />
      <InviteDialog open={!!invite} interview={invite} onOpenChange={(o) => !o && setInvite(null)} />
      {confirmNode}
    </div>
  );
}
