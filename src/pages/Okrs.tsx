import * as React from 'react';
import { Pencil, Plus, Target, Trash2 } from 'lucide-react';
import { actions, useCollection } from '@/data/store';
import { useScope } from '@/app/scope';
import { PageHeader, Loading, ErrorState, EmptyState, Card, Badge, DemoBadge, NotionBadge, Progress } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { useDraft } from '@/components/ui/use-draft';
import { Dialog, useConfirm } from '@/components/ui/dialog';
import { SelectField, TextField } from '@/components/ui/form';
import { InstitutionBadge, InstitutionSelect } from '@/components/domain/Institution';
import { useToast } from '@/components/ui/toast';
import type { KeyResult, Objective } from '@/domain/types';
import { krProgress, objectiveProgress } from '@/lib/okr';
import { fmtDate, todayISO } from '@/lib/time';
import { isFromNotion, isPersonalNotion } from '@/integrations/notion/mapping';
import { uid } from '@/lib/utils';

const currentCycle = () => { const [y, m] = todayISO().split('-').map(Number); return `${y}-T${Math.ceil(m / 3)}`; };
const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));
const period = (k: KeyResult) => (k.period_start ? `${fmtDate(k.period_start)}${k.period_end ? ` – ${fmtDate(k.period_end)}` : ''}` : null);

/** Status, período e progresso do Notion de um KR sincronizado (somente leitura). */
function KrNotionInfo({ k }: { k: KeyResult }) {
  if (!k.external_ref) return null;
  const p = period(k);
  return (
    <span className="flex flex-wrap items-center gap-1 text-xs text-muted">
      <NotionBadge />
      {k.status && <span className="chip border-border">{k.status}</span>}
      <span className="chip border-border">{p ?? 'Sem período'}</span>
      {k.notion_progress != null && <span className="chip border-border" title="Calculado no Notion">{k.notion_progress}% no Notion</span>}
    </span>
  );
}

function ObjectiveDialog({ open, onOpenChange, item }: { open: boolean; onOpenChange: (o: boolean) => void; item: Objective | null }) {
  const toast = useToast();
  const empty = (): Omit<Objective, 'id' | 'created_at' | 'updated_at'> => ({ title: '', institution_id: null, cycle: currentCycle(), owner: '', key_results: [] });
  const { d, set, err, setErr } = useDraft(open, () => item ? { ...item } : empty(), [item]);
  const setKr = (id: string, patch: Partial<KeyResult>) => set('key_results', d.key_results.map((k) => (k.id === id ? { ...k, ...patch } : k)));
  // OKR sincronizado do Notion: instituição opcional, título e ciclo somente leitura (a página VISÃO é compartilhada).
  const synced = !!item && isFromNotion(item);
  async function save() {
    const e: Record<string, string> = {};
    if (!d.title.trim()) e.title = 'Informe o objetivo.';
    if (!synced && !d.institution_id) e.inst = 'OKRs são sempre por instituição.';
    if (!synced && !/^\d{4}-(T[1-4]|S[12]|A)$/.test(d.cycle)) e.cycle = 'Formato: 2026-T4, 2026-S2 ou 2026-A.';
    if (d.key_results.some((k) => !k.title.trim())) e.kr = 'Todo KR precisa de título.';
    if (d.key_results.some((k) => [k.start, k.target, k.current].some((n) => n != null && !Number.isFinite(n)))) e.kr = 'Valores numéricos inválidos.';
    setErr(e); if (Object.keys(e).length) return;
    // Nunca envia título/ciclo de um objetivo sincronizado, mesmo que o rascunho tenha sido adulterado.
    const payload = synced && item ? { ...d, title: item.title, cycle: item.cycle } : d;
    try { item ? await actions.update('objectives', item.id, payload) : await actions.create('objectives', payload); toast('OKR salvo.'); onOpenChange(false); } catch (er) { toast((er as Error).message, 'erro'); }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={item ? 'Editar objetivo' : 'Novo objetivo'} wide
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={save}>Salvar</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField className="sm:col-span-2" label="Objetivo" required value={d.title} onChange={(e) => set('title', e.target.value)} error={err.title}
          disabled={synced} hint={synced ? 'Vem da base VISÃO do Notion, compartilhada com outras pessoas: somente leitura nesta fase.' : undefined} />
        <InstitutionSelect required={!synced} value={d.institution_id} onChange={(v) => set('institution_id', v)} error={err.inst} />
        <TextField label="Ciclo" value={d.cycle} onChange={(e) => set('cycle', e.target.value.toUpperCase())} error={err.cycle}
          disabled={synced} hint={synced ? 'Calculado dos períodos dos KRs no Notion.' : 'Ex.: 2026-T4'} />
        <TextField label="Responsável" value={d.owner} onChange={(e) => set('owner', e.target.value)} />
        <fieldset className="sm:col-span-2 space-y-3 rounded-lg border border-border p-3">
          <legend className="label px-1">Resultados-chave</legend>
          {d.key_results.map((k) => {
            const p = krProgress(k);
            return (
              <div key={k.id} className="grid gap-2 rounded-lg bg-surface-2/50 p-2 sm:grid-cols-[1fr_90px_90px_90px_100px_auto]">
                <TextField label="KR" value={k.title} onChange={(e) => setKr(k.id, { title: e.target.value })} />
                <TextField label="Inicial" inputMode="decimal" value={k.start ?? ''} onChange={(e) => setKr(k.id, { start: num(e.target.value) })} />
                <TextField label="Meta" inputMode="decimal" value={k.target ?? ''} onChange={(e) => setKr(k.id, { target: num(e.target.value) })} />
                <TextField label="Atual" inputMode="decimal" value={k.current ?? ''} onChange={(e) => setKr(k.id, { current: num(e.target.value) })} />
                <TextField label="Unidade" value={k.unit} onChange={(e) => setKr(k.id, { unit: e.target.value })} />
                {k.external_ref ? <span className="self-end" /> : <Button variant="ghost" size="icon" className="self-end" aria-label="Remover KR" onClick={() => set('key_results', d.key_results.filter((x) => x.id !== k.id))}><Trash2 size={14} /></Button>}
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted sm:col-span-6"><KrNotionInfo k={k} />
                  <span>{p == null ? (k.external_ref ? 'Progresso da Central indisponível: o Notion não tem valor inicial.' : 'Progresso indisponível: defina valor inicial, meta (diferente do inicial) e valor atual.') : `Progresso: ${p}%`}</span></div>
              </div>
            );
          })}
          {err.kr && <p role="alert" className="text-xs text-danger">{err.kr}</p>}
          {synced ? <p className="text-xs text-muted">KRs deste objetivo vêm do Notion. Criar KR novo daqui é uma fase futura.</p>
            : <Button variant="secondary" size="sm" onClick={() => set('key_results', [...d.key_results, { id: uid(), title: '', start: null, target: null, current: null, unit: '' }])}><Plus size={14} />Adicionar KR</Button>}
        </fieldset>
      </div>
    </Dialog>
  );
}

export default function Okrs() {
  const objectives = useCollection('objectives');
  const { matchesItem } = useScope();
  const { confirmDelete, confirmNode } = useConfirm();
  const [cycle, setCycle] = React.useState('');
  const [editing, setEditing] = React.useState<Objective | null>(null); const [creating, setCreating] = React.useState(false);
  const cycles = [...new Set(objectives.items.map((o) => o.cycle))].sort().reverse();
  const list = objectives.items.filter((o) => matchesItem(o)).filter((o) => !cycle || o.cycle === cycle);
  return (
    <div>
      <PageHeader title="OKRs" subtitle="Objetivos e resultados-chave por instituição e ciclo; os do Notion são pessoais"
        actions={<><SelectField label="Ciclo" className="w-40" value={cycle} onChange={(e) => setCycle(e.target.value)} options={cycles.map((c) => ({ value: c, label: c }))} placeholder="Todos" />
          <Button className="self-end" onClick={() => setCreating(true)}><Plus size={16} />Objetivo</Button></>} />
      {objectives.error ? <ErrorState message={objectives.error} onRetry={objectives.reload} /> : objectives.loading ? <Loading /> : list.length === 0 ? <EmptyState icon={<Target />} title="Nenhum OKR" description="Defina objetivos por instituição. O progresso só é calculado quando a meta é válida." action={<Button onClick={() => setCreating(true)}><Plus size={16} />Objetivo</Button>} /> : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {list.map((o) => {
            const p = objectiveProgress(o.key_results);
            return (
              <li key={o.id}><Card className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div><div className="font-semibold">{o.title} {o.is_demo && <DemoBadge />}</div><div className="flex flex-wrap gap-1 text-xs text-muted">{isPersonalNotion(o) ? <Badge className="border-dashed">Pessoal</Badge> : <InstitutionBadge id={o.institution_id} />}{isFromNotion(o) && <NotionBadge />}<span className="chip border-border">{o.cycle || 'Sem ciclo'}</span>{o.owner && <span>{o.owner}</span>}</div></div>
                  <div className="flex"><Button variant="ghost" size="icon" aria-label={`Editar ${o.title}`} onClick={() => setEditing(o)}><Pencil size={15} /></Button>
                    <Button variant="ghost" size="icon" aria-label={`Excluir ${o.title}`} onClick={() => confirmDelete('Excluir objetivo', `“${o.title}”`, () => actions.remove('objectives', o.id))}><Trash2 size={15} /></Button></div>
                </div>
                <div className="mt-3">
                  <div className="mb-1 flex justify-between text-xs"><span className="text-muted">Progresso</span><span className="text-gold">{p == null ? 'Sem meta válida' : `${p}%`}</span></div>
                  {p != null && <Progress value={p} label={`Progresso de ${o.title}`} />}
                </div>
                <ul className="mt-3 space-y-2 text-sm">
                  {o.key_results.map((k) => { const kp = krProgress(k); return (
                    <li key={k.id}>
                      <div className="flex justify-between gap-2"><span>{k.title}</span><span className="shrink-0 text-xs text-muted">{kp != null || (k.external_ref && k.target != null) ? `${k.current ?? '—'} / ${k.target} ${k.unit}` : 'meta não definida'}</span></div>
                      <KrNotionInfo k={k} />
                      {kp != null ? <Progress className="mt-1 h-1.5" value={kp} label={k.title} />
                        : k.notion_progress != null && <Progress className="mt-1 h-1.5" value={k.notion_progress} label={`${k.title} (calculado no Notion)`} />}
                    </li>); })}
                  {o.key_results.length === 0 && <li className="text-xs text-muted">Nenhum KR cadastrado.</li>}
                </ul>
              </Card></li>
            );
          })}
        </ul>
      )}
      <ObjectiveDialog open={creating || !!editing} item={editing} onOpenChange={(o) => { if (!o) { setCreating(false); setEditing(null); } }} />
      {confirmNode}
    </div>
  );
}
