import * as React from 'react';
import { AlertTriangle, Copy, ShieldCheck } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox, SelectField, TextArea, TextField } from '@/components/ui/form';
import { InstitutionSelect } from '@/components/domain/Institution';
import { useToast } from '@/components/ui/toast';
import { actions, getItems, useCollection } from '@/data/store';
import { ATTENDANCE, STAGES, STAGE_LABEL, toOptions } from '@/domain/labels';
import type { Candidate, Interview } from '@/domain/types';
import { addDays, fmtDate, todayISO, toMin } from '@/lib/time';
import { findConflicts } from '@/lib/conflicts';
import { nowIso } from '@/lib/utils';
import { buildWhatsAppInvite } from '@/lib/whatsapp';
import { useInstitutions } from '@/app/hooks';

type CDraft = Omit<Candidate, 'id' | 'created_at' | 'updated_at'>;
const emptyCandidate = (): CDraft => ({ name: '', phone: '', email: '', position: 'Consultor(a) de vendas', institution_id: null, stage: 'recebido', source: '', notes: '', consent_lgpd: false, consent_at: null, retention_until: null, history: [] });

export function CandidateDialog({ open, onOpenChange, candidate }: { open: boolean; onOpenChange: (o: boolean) => void; candidate: Candidate | null }) {
  const [d, setD] = React.useState<CDraft>(emptyCandidate());
  const [err, setErr] = React.useState<Record<string, string>>({});
  const toast = useToast();
  React.useEffect(() => { if (open) { setD(candidate ? { ...candidate } : emptyCandidate()); setErr({}); } }, [open, candidate]);
  const set = <K extends keyof CDraft>(k: K, v: CDraft[K]) => setD((p) => ({ ...p, [k]: v }));
  async function save() {
    const e: Record<string, string> = {};
    if (!d.name.trim()) e.name = 'Informe o nome.';
    if (!d.institution_id) e.inst = 'Escolha a instituição da vaga (não misturar processos).';
    if (d.email && !/^\S+@\S+\.\S+$/.test(d.email)) e.email = 'E-mail inválido.';
    if (d.phone && d.phone.replace(/\D/g, '').length < 10) e.phone = 'Telefone com DDD (mín. 10 dígitos).';
    setErr(e); if (Object.keys(e).length) return;
    const patch = { ...d, consent_at: d.consent_lgpd ? (d.consent_at ?? nowIso()) : null };
    try {
      if (candidate) {
        const hist = candidate.stage !== d.stage ? [...candidate.history, { at: nowIso(), action: 'Etapa alterada', detail: `${STAGE_LABEL[candidate.stage]} → ${STAGE_LABEL[d.stage]}` }] : candidate.history;
        await actions.update('candidates', candidate.id, { ...patch, history: hist });
      } else await actions.create('candidates', { ...patch, history: [{ at: nowIso(), action: 'Cadastrado' }] });
      toast('Candidato salvo.'); onOpenChange(false);
    } catch (er) { toast((er as Error).message, 'erro'); }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={candidate ? 'Editar candidato' : 'Novo candidato'} wide
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={save}>Salvar</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Nome" required value={d.name} onChange={(e) => set('name', e.target.value)} error={err.name} />
        <TextField label="Vaga" value={d.position} onChange={(e) => set('position', e.target.value)} />
        <TextField label="Telefone (WhatsApp)" inputMode="tel" value={d.phone} onChange={(e) => set('phone', e.target.value)} error={err.phone} placeholder="(81) 9…" />
        <TextField label="E-mail" type="email" value={d.email} onChange={(e) => set('email', e.target.value)} error={err.email} />
        <InstitutionSelect required value={d.institution_id} onChange={(v) => set('institution_id', v)} error={err.inst} />
        <SelectField label="Etapa" value={d.stage} onChange={(e) => set('stage', e.target.value as any)} options={STAGES} />
        <TextField label="Origem" value={d.source} onChange={(e) => set('source', e.target.value)} placeholder="Indicação, site, anúncio…" />
        <TextField label="Reter dados até" type="date" value={d.retention_until ?? ''} onChange={(e) => set('retention_until', e.target.value || null)} hint="LGPD: defina prazo para descarte." />
        <TextArea className="sm:col-span-2" label="Observações" value={d.notes} onChange={(e) => set('notes', e.target.value)} hint="Registre apenas o necessário ao processo seletivo." />
        <div className="sm:col-span-2 rounded-lg border border-border p-3">
          <Checkbox label={<span className="flex items-center gap-1"><ShieldCheck size={14} className="text-gold" />Candidato consentiu com o tratamento dos dados para este processo (LGPD)</span>}
            checked={d.consent_lgpd} onChange={(v) => { set('consent_lgpd', v); if (v && !d.retention_until) set('retention_until', addDays(todayISO(), 180)); }} />
          {d.consent_at && <p className="mt-1 text-xs text-muted">Consentimento registrado em {fmtDate(d.consent_at.slice(0, 10))}.</p>}
        </div>
      </div>
    </Dialog>
  );
}

type IDraft = Omit<Interview, 'id' | 'created_at' | 'updated_at'>;

export function InterviewDialog({ open, onOpenChange, interview, candidateId }: { open: boolean; onOpenChange: (o: boolean) => void; interview: Interview | null; candidateId?: string }) {
  const candidates = useCollection('candidates');
  const interviews = useCollection('interviews');
  const events = useCollection('agenda_events');
  const meetings = useCollection('meetings');
  const toast = useToast();
  const empty = (): IDraft => ({ candidate_id: candidateId ?? '', institution_id: null, date: '', start: '', end: '', location: '', interviewer: '', attendance: 'pendente', time_confirmed: false, evaluation: '', score: null, decision: 'pendente' });
  const [d, setD] = React.useState<IDraft>(empty());
  const [err, setErr] = React.useState<Record<string, string>>({});
  React.useEffect(() => { if (open) { setD(interview ? { ...interview } : empty()); setErr({}); } }, [open, interview, candidateId]); // eslint-disable-line
  const set = <K extends keyof IDraft>(k: K, v: IDraft[K]) => setD((p) => ({ ...p, [k]: v }));
  const cand = candidates.items.find((c) => c.id === d.candidate_id);

  const conflicts = d.date && d.start && d.end && toMin(d.end) > toMin(d.start) ? [
    ...findConflicts({ id: interview?.id ?? '_', date: d.date, start: d.start, end: d.end }, interviews.items).map((i) => `Entrevista: ${candidates.items.find((c) => c.id === i.candidate_id)?.name ?? '—'} (${i.start}–${i.end})`),
    ...findConflicts({ id: '_', date: d.date, start: d.start, end: d.end }, events.items).map((e) => `Agenda: ${e.title} (${e.start}–${e.end})`),
    ...findConflicts({ id: '_', date: d.date, start: d.start, end: d.end }, meetings.items).map((m) => `Reunião: ${m.title} (${m.start}–${m.end})`),
  ] : [];

  async function save() {
    const e: Record<string, string> = {};
    if (!d.candidate_id) e.cand = 'Escolha o candidato.';
    if (!d.date) e.date = 'Informe a data.';
    if (d.start && d.end && toMin(d.end) <= toMin(d.start)) e.time = 'O fim deve ser depois do início.';
    if (d.time_confirmed && (!d.start || !d.end)) e.time = 'Para confirmar o horário, informe início e fim.';
    if (d.score != null && (d.score < 0 || d.score > 10)) e.score = 'Nota de 0 a 10.';
    setErr(e); if (Object.keys(e).length) return;
    const payload = { ...d, institution_id: cand?.institution_id ?? null };
    // Lê o candidato atual do store a cada passo, para não sobrescrever o histórico com uma cópia antiga.
    const current = () => getItems('candidates').find((c) => c.id === d.candidate_id);
    const moveTo = async (stage: Candidate['stage'], action: string, detail?: string) => {
      const c = current(); if (!c || c.stage === stage) return;
      await actions.update('candidates', c.id, { stage, history: [...c.history, { at: nowIso(), action, detail }] });
    };
    try {
      if (interview) await actions.update('interviews', interview.id, payload);
      else {
        await actions.create('interviews', payload);
        if (cand && ['recebido', 'triagem', 'selecionado'].includes(cand.stage)) await moveTo('entrevista_agendada', 'Entrevista agendada', fmtDate(d.date));
      }
      if (d.decision !== 'pendente') await moveTo(d.decision, 'Decisão registrada', STAGE_LABEL[d.decision]);
      else if (d.attendance === 'compareceu' && current()?.stage === 'entrevista_agendada') await moveTo('entrevistado', 'Entrevistado');
      toast('Entrevista salva.'); onOpenChange(false);
    } catch (er) { toast((er as Error).message, 'erro'); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={interview ? 'Editar entrevista' : 'Agendar entrevista'} wide
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={save}>Salvar</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField className="sm:col-span-2" label="Candidato" required value={d.candidate_id} onChange={(e) => set('candidate_id', e.target.value)} error={err.cand}
          options={candidates.items.filter((c) => c.stage !== 'reprovado').map((c) => ({ value: c.id, label: `${c.name}${c.is_demo ? ' (demonstração)' : ''}` }))} placeholder="Selecione…" />
        <TextField label="Data" type="date" required value={d.date} onChange={(e) => set('date', e.target.value)} error={err.date} />
        <TextField label="Local / link" value={d.location} onChange={(e) => set('location', e.target.value)} />
        <TextField label="Início" type="time" value={d.start} onChange={(e) => set('start', e.target.value)} error={err.time} />
        <TextField label="Fim" type="time" value={d.end} onChange={(e) => set('end', e.target.value)} />
        <div className="sm:col-span-2"><Checkbox label="Horário confirmado com o candidato" checked={d.time_confirmed} onChange={(v) => set('time_confirmed', v)} />
          <p className="text-xs text-muted">Enquanto não confirmado, o horário aparece como “a confirmar”.</p></div>
        {conflicts.length > 0 && (
          <div role="alert" className="sm:col-span-2 rounded-lg border border-danger/50 bg-danger/5 p-3 text-sm">
            <p className="flex items-center gap-2 font-semibold text-danger"><AlertTriangle size={14} />Conflito de horário</p>
            <ul className="mt-1 list-disc pl-5 text-xs">{conflicts.map((c) => <li key={c}>{c}</li>)}</ul>
          </div>
        )}
        <TextField label="Entrevistador(a)" value={d.interviewer} onChange={(e) => set('interviewer', e.target.value)} />
        <SelectField label="Presença" value={d.attendance} onChange={(e) => set('attendance', e.target.value as any)} options={toOptions(ATTENDANCE)} />
        <TextArea className="sm:col-span-2" label="Avaliação" value={d.evaluation} onChange={(e) => set('evaluation', e.target.value)} />
        <TextField label="Nota (0–10)" type="number" min={0} max={10} step={0.5} value={d.score ?? ''} onChange={(e) => set('score', e.target.value === '' ? null : Number(e.target.value))} error={err.score} />
        <SelectField label="Decisão" value={d.decision} onChange={(e) => set('decision', e.target.value as any)}
          options={[{ value: 'pendente', label: 'Pendente' }, { value: 'aprovado', label: 'Aprovado' }, { value: 'banco_talentos', label: 'Banco de talentos' }, { value: 'reprovado', label: 'Reprovado' }]} />
      </div>
    </Dialog>
  );
}

export function InviteDialog({ open, onOpenChange, interview }: { open: boolean; onOpenChange: (o: boolean) => void; interview: Interview | null }) {
  const candidates = useCollection('candidates');
  const { byId } = useInstitutions();
  const toast = useToast();
  const c = candidates.items.find((x) => x.id === interview?.candidate_id);
  const [text, setText] = React.useState('');
  React.useEffect(() => {
    if (open && interview) setText(buildWhatsAppInvite({ name: c?.name ?? '', position: c?.position ?? '', institution: c?.institution_id ? byId[c.institution_id]?.name ?? '' : '', date: interview.date, start: interview.start, confirmed: interview.time_confirmed, location: interview.location }));
  }, [open, interview]); // eslint-disable-line
  async function copy() {
    try { await navigator.clipboard.writeText(text); toast('Convite copiado. Cole no WhatsApp e envie manualmente.'); }
    catch { toast('Não foi possível copiar automaticamente. Selecione o texto e copie.', 'erro'); }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Convite para WhatsApp" description="Nada é enviado automaticamente. Revise, copie e envie você mesmo."
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Fechar</Button><Button onClick={copy}><Copy size={16} />Copiar texto</Button></>}>
      <TextArea label="Mensagem" rows={12} value={text} onChange={(e) => setText(e.target.value)} />
      {c?.phone && <p className="mt-2 text-xs text-muted">Telefone do candidato: {c.phone}</p>}
      {c && !c.consent_lgpd && <p className="mt-2 text-xs text-orange">Atenção: consentimento LGPD ainda não registrado para este candidato.</p>}
    </Dialog>
  );
}
