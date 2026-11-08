import * as React from 'react';
import { FileText, Pencil, Plus, Target, Trash2 } from 'lucide-react';
import { actions, useCollection } from '@/data/store';
import { useScope } from '@/app/scope';
import { PageHeader, Loading, ErrorState, EmptyState, Card, Badge, DemoBadge, NotionBadge, Progress, Segmented, FilterBar } from '@/components/ui/misc';
import { KanbanBoard } from '@/components/ui/kanban';
import { PushBanner } from '@/features/notion/PushPanel';
import { KR_STATUS, KR_STATUS_OPTIONS, krColumnOf, type KrColumn } from '@/integrations/notion/config';
import { TONE_RGB, krStatusTone, toneChip } from '@/features/notion/notionLook';
import { Checkbox } from '@/components/ui/form';
import { cn } from '@/lib/utils';
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

/** Colunas ("tópicos") do Kanban: os grupos de status da base de KRs do Notion. */
const KR_COLUMNS: { value: KrColumn; label: string; tone: string }[] = [
  { value: 'a_caminho', label: 'A caminho', tone: TONE_RGB.blue },
  { value: 'em_analise', label: '??', tone: TONE_RGB.blue },
  { value: 'atingiu', label: 'Concluído (Atingiu)', tone: TONE_RGB.green },
  { value: 'nao_atingiu', label: 'Não Atingiu', tone: TONE_RGB.red },
];
const isActiveKr = (k: KeyResult) => ['a_caminho', 'em_analise'].includes(krColumnOf(k.status));
const COLUMN_STATUS: Record<Exclude<KrColumn, 'nao_atingiu'>, string> = { a_caminho: KR_STATUS.a_caminho, em_analise: KR_STATUS.em_analise, atingiu: KR_STATUS.atingiu };
type KrCard = { id: string; o: Objective; k: KeyResult };
type View = 'objetivos' | 'kanban' | 'lista';

/** Grava um KR dentro do objetivo (KRs ficam em objectives.key_results). */
async function saveKr(o: Objective, krId: string, patch: Partial<KeyResult>) {
  await actions.update('objectives', o.id, { key_results: o.key_results.map((k) => (k.id === krId ? { ...k, ...patch } : k)) });
}

/** Edição rápida de um KR (título, meta, atual e status). KR do Notion: a mudança fica pendente de envio. */
function KrDialog({ card, onOpenChange, statusOnly }: { card: KrCard | null; onOpenChange: (o: boolean) => void; statusOnly?: string | null }) {
  const toast = useToast();
  const open = !!card;
  const { d, set, err, setErr } = useDraft(open, () => card ? { title: card.k.title, target: card.k.target, current: card.k.current, status: statusOnly ?? card.k.status ?? KR_STATUS.a_caminho } : { title: '', target: null, current: null, status: KR_STATUS.a_caminho as string }, [card, statusOnly]);
  if (!card) return null;
  const options = statusOnly != null ? KR_STATUS.nao_atingiu.map((s) => ({ value: s, label: s.replace(/^Não Atingiu - /, '') })) : KR_STATUS_OPTIONS.map((s) => ({ value: s, label: s }));
  async function save() {
    const e: Record<string, string> = {};
    if (!d.title.trim()) e.title = 'Informe o KR.';
    if ([d.target, d.current].some((n) => n != null && !Number.isFinite(n))) e.num = 'Valor numérico inválido.';
    if (!KR_STATUS_OPTIONS.includes(d.status ?? '')) e.status = 'Escolha um status.';
    setErr(e); if (Object.keys(e).length) return;
    try {
      await saveKr(card!.o, card!.k.id, { title: d.title.trim(), target: d.target, current: d.current, status: d.status });
      toast(card!.k.external_ref ? 'KR salvo na Central. Envie ao Notion pelo aviso no topo da página.' : 'KR salvo.');
      onOpenChange(false);
    } catch (er) { toast((er as Error).message, 'erro'); }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={statusOnly != null ? 'Por que não atingiu?' : 'Atualizar KR'} description={card.o.title}
      badge={card.k.external_ref ? <NotionBadge /> : undefined}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={save}>Salvar</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        {statusOnly == null && <>
          <TextField className="sm:col-span-2" label="KR" value={d.title} onChange={(e) => set('title', e.target.value)} error={err.title} />
          <TextField label="Meta" inputMode="decimal" value={d.target ?? ''} onChange={(e) => set('target', num(e.target.value))} />
          <TextField label="Atual" inputMode="decimal" value={d.current ?? ''} onChange={(e) => set('current', num(e.target.value))} error={err.num} />
        </>}
        <SelectField className="sm:col-span-2" label={statusOnly != null ? 'Motivo (status no Notion)' : 'Status'} value={d.status ?? ''} onChange={(e) => set('status', e.target.value)} options={options} error={err.status} />
      </div>
      {statusOnly == null && card.k.external_ref && <KrNotes k={card.k} />}
    </Dialog>
  );
}

/**
 * Cartão como no Notion ("Kanban por Objetivo"): KR, Dono, Período, Progresso e Status.
 * No quadro por objetivo o status muda ali mesmo, pelo seletor (no Notion, editando a propriedade do cartão).
 */
/** Descrição, Motivo e conteúdo da página do KR no Notion — somente leitura (edite no Notion). */
function KrNotes({ k }: { k: KeyResult }) {
  const parts = [['Descrição', k.description], ['Motivo', k.reason], ['Conteúdo da página', k.notion_body]] as const;
  const any = parts.some(([, v]) => v && v.trim());
  return (
    <section className="mt-4 space-y-3 rounded-lg border border-border p-3" aria-label="Conteúdo do Notion">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><FileText size={14} aria-hidden />No Notion <span className="text-xs font-normal text-muted">(somente leitura — edite no Notion)</span></h3>
      {!any && <p className="text-xs text-muted">{k.notion_body === undefined ? 'Sincronize de novo em Integrações para trazer a descrição e o conteúdo da página.' : 'Este KR não tem descrição, motivo nem conteúdo na página.'}</p>}
      {parts.filter(([, v]) => v && v.trim()).map(([label, v]) => (
        <div key={label}>
          <div className="label mb-1">{label}</div>
          <p className="max-h-60 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-surface-2/60 p-2 text-sm">{v}</p>
        </div>
      ))}
    </section>
  );
}

function KrCardView({ c, onEdit, showObjective, onStatus }: { c: KrCard; onEdit: () => void; showObjective?: boolean; onStatus?: (s: string) => void }) {
  const { k, o } = c;
  const kp = krProgress(k);
  const pv = kp ?? k.notion_progress ?? null;
  const tone = krStatusTone(k.status);
  return (
    <div className="space-y-2 pr-4">
      <button type="button" onClick={onEdit} className="text-left text-sm font-medium leading-snug hover:text-gold">{k.title}</button>
      {showObjective && <div className="truncate text-[11px] text-muted" title={o.title}>{o.title}</div>}
      <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted">
        {o.owner && <span className="chip border-border" title="Dono">{o.owner}</span>}
        {(k.description || k.reason || k.notion_body) && <span className="chip border-border" title="Tem descrição/conteúdo no Notion — clique no KR para ler"><FileText size={11} aria-hidden />Descrição</span>}
        <span className="chip border-border" title="Período">{period(k) ?? 'Sem período'}</span>
        {k.external_ref && <NotionBadge />}{o.is_demo && <DemoBadge />}
      </div>
      <div className="flex items-center justify-between text-xs"><span className="text-muted">{k.target != null ? `${k.current ?? '—'} / ${k.target} ${k.unit}` : 'meta não definida'}</span><span className="text-gold" title="Progresso">{pv != null ? `${pv}%` : '—'}</span></div>
      {pv != null && <Progress className="h-1.5" value={pv} label={`Progresso de ${k.title}`} />}
      {onStatus ? (
        <label className="block">
          <span className="sr-only">Status de {k.title}</span>
          <select className={cn('field h-7 rounded-lg px-2 py-0 text-[11px]', toneChip(tone))} value={k.status ?? KR_STATUS.a_caminho} onChange={(e) => onStatus(e.target.value)}>
            {[...new Set([...(k.status && !KR_STATUS_OPTIONS.includes(k.status) ? [k.status] : []), ...KR_STATUS_OPTIONS])].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      ) : <span className={cn('chip text-[11px]', toneChip(tone))}>{k.status ?? KR_STATUS.a_caminho}</span>}
    </div>
  );
}

export default function Okrs() {
  const objectives = useCollection('objectives');
  const { matchesItem } = useScope();
  const { confirmDelete, confirmNode } = useConfirm();
  const toast = useToast();
  const [cycle, setCycle] = React.useState('');
  const [objFilter, setObjFilter] = React.useState('');
  const [view, setView] = React.useState<View>(() => { try { const v = localStorage.getItem('ccc:okr-view'); return v === 'kanban' || v === 'lista' ? v : 'objetivos'; } catch { return 'objetivos'; } });
  /** Como no Notion: só KRs ativos (A caminho / ??), a não ser que se peça o contrário. */
  const [showClosed, setShowClosed] = React.useState(false);
  React.useEffect(() => { try { localStorage.setItem('ccc:okr-view', view); } catch { /* */ } }, [view]);
  const [editing, setEditing] = React.useState<Objective | null>(null); const [creating, setCreating] = React.useState(false);
  const [krEdit, setKrEdit] = React.useState<{ card: KrCard; statusOnly: string | null } | null>(null);
  const cycles = [...new Set(objectives.items.map((o) => o.cycle))].sort().reverse();
  const list = objectives.items.filter((o) => matchesItem(o)).filter((o) => !cycle || o.cycle === cycle);
  const cards: KrCard[] = list.filter((o) => !objFilter || o.id === objFilter).flatMap((o) => o.key_results.map((k) => ({ id: `${o.id}:${k.id}`, o, k })));
  const objCards = showClosed ? cards : cards.filter((c) => isActiveKr(c.k));
  // Colunas = Objetivos em ordem alfabética, sem os vazios (hideEmptyGroups do Notion).
  const objColumns = [...new Set(objCards.map((c) => c.o.id))].map((id) => list.find((o) => o.id === id)!)
    .sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'))
    .map((o) => ({ value: o.id, label: o.title, tone: isFromNotion(o) ? 'rgb(var(--gold-300))' : 'rgb(var(--muted))' }));
  async function setStatus(c: KrCard, s: string) {
    if (s === c.k.status) return;
    try { await saveKr(c.o, c.k.id, { status: s }); toast(c.k.external_ref ? `“${c.k.title}” → ${s} na Central. Envie ao Notion pelo aviso no topo.` : 'Status do KR atualizado.'); }
    catch (e) { toast((e as Error).message, 'erro'); }
  }

  async function move(id: string, to: KrColumn) {
    const c = cards.find((x) => x.id === id); if (!c || krColumnOf(c.k.status) === to) return;
    if (to === 'nao_atingiu') { setKrEdit({ card: c, statusOnly: KR_STATUS.nao_atingiu[0] }); return; } // pede o motivo
    try {
      await saveKr(c.o, c.k.id, { status: COLUMN_STATUS[to] });
      toast(c.k.external_ref ? `“${c.k.title}” → ${COLUMN_STATUS[to]} na Central. Envie ao Notion pelo aviso no topo.` : 'Status do KR atualizado.');
    } catch (e) { toast((e as Error).message, 'erro'); }
  }

  const empty = <EmptyState icon={<Target />} title="Nenhum OKR" description="Defina objetivos por instituição ou sincronize os do Notion em Integrações." action={<Button onClick={() => setCreating(true)}><Plus size={16} />Objetivo</Button>} />;
  return (
    <div>
      <PageHeader title="OKRs" eyebrow="Estratégia" subtitle={`${list.length} objetivo(s) · ${list.reduce((n, o) => n + o.key_results.length, 0)} KR(s) · os do Notion são pessoais`}
        actions={<><Segmented label="Visualização" value={view} onChange={setView} options={[{ value: 'objetivos', label: 'Kanban por Objetivo' }, { value: 'kanban', label: 'Por status' }, { value: 'lista', label: 'Lista' }]} />
          <Button onClick={() => setCreating(true)}><Plus size={16} />Objetivo</Button></>} />
      <PushBanner entity="krs" />
      <FilterBar>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <SelectField label="Ciclo" value={cycle} onChange={(e) => setCycle(e.target.value)} options={cycles.map((c) => ({ value: c, label: c || 'Sem ciclo' }))} placeholder="Todos" />
          {view !== 'lista' && <SelectField className="lg:col-span-2" label="Objetivo (tópico)" value={objFilter} onChange={(e) => setObjFilter(e.target.value)} options={list.map((o) => ({ value: o.id, label: o.title }))} placeholder="Todos os objetivos" />}
        </div>
        {view === 'objetivos' && <Checkbox className="self-start text-xs text-muted" label="Mostrar KRs encerrados (no Notion este quadro mostra só os ativos)" checked={showClosed} onChange={setShowClosed} />}
      </FilterBar>
      {objectives.error ? <ErrorState message={objectives.error} onRetry={objectives.reload} /> : objectives.loading ? <Loading /> : list.length === 0 ? empty :
        view === 'kanban' ? (
          <KanbanBoard columns={KR_COLUMNS} items={cards} columnOf={(c) => krColumnOf(c.k.status)} onMove={move} itemLabel={(c) => c.k.title} emptyText="Arraste KRs para cá"
            renderCard={(c) => <KrCardView c={c} showObjective onEdit={() => setKrEdit({ card: c, statusOnly: null })} />} />
        ) : view === 'objetivos' ? (
          objColumns.length === 0 ? <EmptyState icon={<Target />} title="Nenhum KR ativo" description="Marque “Mostrar KRs encerrados” para ver os concluídos e os não atingidos." /> :
          <KanbanBoard readOnly columns={objColumns}
            items={objCards} columnOf={(c) => c.o.id} onMove={() => {}} itemLabel={(c) => c.k.title} emptyText="Nenhum KR neste objetivo"
            renderCard={(c) => <KrCardView c={c} onEdit={() => setKrEdit({ card: c, statusOnly: null })} onStatus={(s) => setStatus(c, s)} />} />
        ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {list.map((o) => {
            const p = objectiveProgress(o.key_results);
            return (
              <li key={o.id}><Card className="p-5">
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
      <KrDialog card={krEdit?.card ?? null} statusOnly={krEdit?.statusOnly ?? null} onOpenChange={(o) => { if (!o) setKrEdit(null); }} />
      {confirmNode}
    </div>
  );
}
