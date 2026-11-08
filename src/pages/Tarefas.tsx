import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarClock, FileText, Plus } from 'lucide-react';
import { useCollection, actions } from '@/data/store';
import { useScope } from '@/app/scope';
import { useSettings } from '@/app/hooks';
import { PageHeader, Segmented, Loading, ErrorState, EmptyState, FilterBar, NotionBadge, DemoBadge } from '@/components/ui/misc';
import { Checkbox } from '@/components/ui/form';
import { TASK_ATTRIBUTION_OPTIONS, TASK_PRIORITY_MAP, sortAttribution } from '@/integrations/notion/config';
import { isFromNotion } from '@/integrations/notion/mapping';
import { TASK_STATUS_NOTION, TONE_RGB, attributionTone, toneChip, type Tone } from '@/features/notion/notionLook';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/form';
import { useConfirm } from '@/components/ui/dialog';
import { SearchInput } from '@/components/ui/search';
import { KanbanBoard } from '@/components/ui/kanban';
import { useToast } from '@/components/ui/toast';
import { TaskRow, PRIORITY_TONE } from '@/features/tasks/TaskRow';
import { TaskDialog } from '@/features/tasks/TaskDialog';
import { PushBanner } from '@/features/notion/PushPanel';
import { isOpen, isOverdue, matchesOrigin, taskOrigin, type TaskOrigin } from '@/features/tasks/taskLogic';
import { setTaskStatus, toggleMission } from '@/features/tasks/actions';
import { PRIORITY, TASK_STATUS, toOptions } from '@/domain/labels';
import type { Task, TaskStatus } from '@/domain/types';
import { fmtDate, todayISO } from '@/lib/time';
import { nowIso } from '@/lib/utils';
import { cn } from '@/lib/utils';

/** Colunas por STATUS com os nomes e cores do Notion (Não iniciada, Em andamento, Pausada, Concluída). */
const COLUMNS: { value: TaskStatus; label: string; tone: string }[] = (['a_fazer', 'em_andamento', 'aguardando', 'concluida'] as TaskStatus[])
  .map((v) => ({ value: v, label: TASK_STATUS_NOTION[v].label, tone: TONE_RGB[TASK_STATUS_NOTION[v].tone] }));
const NO_ATTR = 'sem';
/** Colunas por ATRIBUIÇÃO, como a visualização de Tarefas do hub no Notion (70% / 20% / 10% / OFF WORK). */
const ATTR_COLUMNS = [...TASK_ATTRIBUTION_OPTIONS.map((a) => ({ value: a as string, label: a as string, tone: TONE_RGB[attributionTone(a)] })), { value: NO_ATTR, label: 'Sem atribuição', tone: 'rgb(var(--muted))' }];
const PRIORITY_NOTION = Object.fromEntries(Object.entries(TASK_PRIORITY_MAP).map(([n, c]) => [c, n])) as Record<Task['priority'], string>;
const PRIORITY_NOTION_TONE: Record<Task['priority'], Tone> = { urgente: 'red', alta: 'blue', media: 'yellow', baixa: 'gray' };
type AttrCard = { id: string; t: Task; col: string };

/** Cartão no estilo do Notion: título, STATUS, PRIORIDADE, PRAZO (e ATRIBUIÇÃO quando o quadro é por status). */
function NotionTaskCard({ t, onOpen, showAttribution }: { t: Task; onOpen: (t: Task) => void; showAttribution?: boolean }) {
  const st = TASK_STATUS_NOTION[t.status];
  const late = isOverdue(t, todayISO());
  return (
    <div className="relative pl-2.5">
      <span aria-hidden className="absolute bottom-0 left-0 top-0 w-[3px] rounded-full" style={{ background: PRIORITY_TONE[t.priority] }} />
      <button type="button" className={cn('pr-4 text-left text-sm font-medium leading-snug hover:text-gold', t.status === 'concluida' && 'text-muted line-through')} onClick={() => onOpen(t)}>{t.title}</button>
      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1 text-[11px]">
        <span className={cn('chip', toneChip(st.tone))}>{st.label}</span>
        <span className={cn('chip max-w-full', toneChip(PRIORITY_NOTION_TONE[t.priority]))} title={`PRIORIDADE: ${PRIORITY_NOTION[t.priority]}`}><span className="truncate">{isFromNotion(t) ? PRIORITY_NOTION[t.priority] : PRIORITY[t.priority].label}</span></span>
        {t.due_date && <span className={cn('chip border-border/80', late ? 'border-danger/50 text-danger' : 'text-muted')}><CalendarClock size={11} aria-hidden />{fmtDate(t.due_date)}</span>}
        {showAttribution && sortAttribution(t.attribution).map((a) => <span key={a} className={cn('chip', toneChip(attributionTone(a)))}>{a}</span>)}
        {t.description?.trim() && <span className="chip border-border/80 text-muted" title="Tem descrição — clique na tarefa para ler"><FileText size={11} aria-hidden />Descrição</span>}
        {isFromNotion(t) && <NotionBadge />}{t.is_demo && <DemoBadge />}
      </div>
    </div>
  );
}
const QUICK: [string, string][] = [['', 'Todas'], ['hoje', 'Vencem hoje'], ['atrasadas', 'Atrasadas'], ['missao', 'Missão do dia']];
type Origin = 'todas' | TaskOrigin;
const isOrigin = (v: string | null): v is Origin => v === 'todas' || v === 'central' || v === 'notion';

export default function Tarefas() {
  const tasks = useCollection('tasks');
  const { matchesItem } = useScope();
  const { settings } = useSettings();
  const [params, setParams] = useSearchParams();
  const [view, setView] = React.useState<'lista' | 'kanban'>(() => { try { return (localStorage.getItem('ccc:tasks-view') as 'lista' | 'kanban') ?? 'lista'; } catch { return 'lista'; } });
  const [groupBy, setGroupBy] = React.useState<'atribuicao' | 'status'>(() => { try { return localStorage.getItem('ccc:tasks-group') === 'status' ? 'status' : 'atribuicao'; } catch { return 'atribuicao'; } });
  React.useEffect(() => { try { localStorage.setItem('ccc:tasks-group', groupBy); } catch { /* */ } }, [groupBy]);
  /** Como no Notion: o quadro por atribuição mostra só tarefas ativas, a não ser que se peça o contrário. */
  const [showClosed, setShowClosed] = React.useState(false);
  const [q, setQ] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [priority, setPriority] = React.useState('');
  const [category, setCategory] = React.useState('');
  const quick = params.get('f') ?? '';
  const rawOrigin = params.get('origem');
  const origin: Origin = isOrigin(rawOrigin) ? rawOrigin : 'todas';
  const [editing, setEditing] = React.useState<Task | null>(null);
  const [creating, setCreating] = React.useState(false);
  const { confirmDelete, confirmNode } = useConfirm();
  const toast = useToast();
  const today = todayISO();

  React.useEffect(() => { try { localStorage.setItem('ccc:tasks-view', view); } catch { /* */ } }, [view]);

  /** Todos os filtros exceto a origem (base dos contadores das abas de origem). */
  const base = tasks.items
    .filter((t) => matchesItem(t))
    .filter((t) => !q || `${t.title} ${t.description}`.toLowerCase().includes(q.toLowerCase()))
    .filter((t) => !status || t.status === status)
    .filter((t) => !priority || t.priority === priority)
    .filter((t) => !category || t.category === category)
    .filter((t) => quick !== 'atrasadas' || isOverdue(t, today))
    .filter((t) => quick !== 'hoje' || (isOpen(t) && t.due_date === today))
    .filter((t) => quick !== 'missao' || (t.is_mission && t.mission_date === today));
  const counts = { todas: base.length, central: base.filter((t) => taskOrigin(t) === 'central').length, notion: base.filter((t) => taskOrigin(t) === 'notion').length };
  const filtered = base
    .filter((t) => matchesOrigin(t, origin))
    .sort((a, b) => Number(!isOpen(a)) - Number(!isOpen(b)) || PRIORITY[a.priority].rank - PRIORITY[b.priority].rank || (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'));

  async function onMission(t: Task) { const e = await toggleMission(t, tasks.items, today); if (e) toast(e, 'erro'); }
  const del = (t: Task) => confirmDelete('Excluir tarefa', `“${t.title}”`, async () => { await actions.remove('tasks', t.id); toast('Tarefa excluída.'); });
  /** Mover entre colunas de atribuição troca SÓ a atribuição de origem pela de destino (multi-select do Notion). */
  async function moveAttr(id: string, to: string) {
    const [taskId, from] = id.split('|');
    const t = tasks.items.find((x) => x.id === taskId); if (!t || from === to) return;
    const cur = sortAttribution(t.attribution);
    const next = sortAttribution(to === NO_ATTR ? cur.filter((a) => a !== from) : [...cur.filter((a) => a !== from), to]);
    try {
      await actions.update('tasks', t.id, { attribution: next, history: [...t.history, { at: nowIso(), action: 'Atribuição alterada', detail: next.join(', ') || 'sem atribuição' }] });
      toast(isFromNotion(t) ? `Atribuição de “${t.title}” alterada na Central. Envie ao Notion pelo aviso no topo.` : 'Atribuição alterada.');
    } catch (e) { toast((e as Error).message, 'erro'); }
  }
  async function move(id: string, s: TaskStatus) {
    const t = tasks.items.find((x) => x.id === id); if (!t || t.status === s) return;
    try { await setTaskStatus(t, s); } catch (e) { toast((e as Error).message, 'erro'); }
  }
  /** Atualiza um parâmetro da URL preservando os outros (atalho rápido e origem convivem). */
  const setParam = (key: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v && v !== 'todas') next.set(key, v); else next.delete(key);
    setParams(next);
  };
  const hasFilters = !!(q || status || priority || category || quick || origin !== 'todas');
  const byAttr = view === 'kanban' && groupBy === 'atribuicao';
  const boardTasks = byAttr && !showClosed && !status ? filtered.filter(isOpen) : filtered;
  const attrCards: AttrCard[] = boardTasks.flatMap((t) => {
    const attrs = sortAttribution(t.attribution).filter((a) => (TASK_ATTRIBUTION_OPTIONS as readonly string[]).includes(a));
    return attrs.length ? attrs.map((a) => ({ id: `${t.id}|${a}`, t, col: a })) : [{ id: `${t.id}|${NO_ATTR}`, t, col: NO_ATTR }];
  });
  const attrColumns = ATTR_COLUMNS.filter((c) => c.value !== NO_ATTR || attrCards.some((x) => x.col === NO_ATTR));

  return (
    <div>
      <PageHeader title="Tarefas" eyebrow="Dia a dia" subtitle={`${filtered.filter(isOpen).length} abertas · ${filtered.length} exibidas`}
        actions={<><Segmented label="Visualização" value={view} onChange={setView} options={[{ value: 'lista', label: 'Lista' }, { value: 'kanban', label: 'Kanban' }]} />
          {view === 'kanban' && <Segmented label="Agrupar Kanban por" value={groupBy} onChange={setGroupBy} options={[{ value: 'atribuicao', label: 'Atribuição' }, { value: 'status', label: 'Status' }]} />}
          <Button onClick={() => setCreating(true)}><Plus size={16} />Nova tarefa</Button></>} />

      <PushBanner entity="tarefas" />
      <FilterBar>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented label="Origem das tarefas" value={origin} onChange={(v) => setParam('origem', v)}
            options={[{ value: 'todas', label: 'Todas', count: counts.todas }, { value: 'central', label: 'Rotina / Central', count: counts.central }, { value: 'notion', label: 'Notion', count: counts.notion }]} />
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Atalhos de filtro">
            {QUICK.map(([v, l]) => (
              <button key={v} type="button" aria-pressed={quick === v} onClick={() => setParam('f', v)}
                className={cn('chip px-3 py-1 transition', quick === v ? 'border-gold-300/50 bg-gold-300/10 text-gold' : 'border-border/80 text-muted hover:text-fg')}>{l}</button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <SearchInput id="busca" className="col-span-2" visibleLabel value={q} onChange={setQ} placeholder="Título ou descrição…" />
          <SelectField label="Status" value={status} onChange={(e) => setStatus(e.target.value)} options={toOptions(TASK_STATUS)} placeholder="Todos" />
          <SelectField label="Prioridade" value={priority} onChange={(e) => setPriority(e.target.value)} options={Object.entries(PRIORITY).map(([v, p]) => ({ value: v, label: p.label }))} placeholder="Todas" />
          <SelectField className="col-span-2 lg:col-span-1" label="Categoria" value={category} onChange={(e) => setCategory(e.target.value)} options={settings.categories.map((c) => ({ value: c, label: c }))} placeholder="Todas" />
        </div>
        {byAttr && <Checkbox className="self-start text-xs text-muted" label="Mostrar concluídas e canceladas (no Notion este quadro mostra só as ativas)" checked={showClosed} onChange={setShowClosed} />}
        {hasFilters && (
          <button type="button" className="self-start text-xs text-muted underline-offset-2 hover:text-fg hover:underline"
            onClick={() => { setQ(''); setStatus(''); setPriority(''); setCategory(''); setParams({}); }}>Limpar filtros</button>
        )}
      </FilterBar>

      {tasks.error ? <ErrorState message={tasks.error} onRetry={tasks.reload} /> : tasks.loading ? <Loading /> :
        filtered.length === 0 && view === 'lista' ? <EmptyState title="Nenhuma tarefa encontrada" description={tasks.items.length ? 'Ajuste os filtros ou a busca.' : 'Crie sua primeira tarefa.'} action={<Button onClick={() => setCreating(true)}><Plus size={16} />Nova tarefa</Button>} /> :
        view === 'lista' ? (
          <ul className="space-y-2">
            {filtered.map((t) => <TaskRow key={t.id} task={t} onOpen={setEditing} onMission={onMission} onDelete={del} />)}
          </ul>
        ) : byAttr ? (
          <KanbanBoard columns={attrColumns} items={attrCards} columnOf={(c) => c.col} onMove={moveAttr} itemLabel={(c) => c.t.title} emptyText="Arraste tarefas para cá"
            renderCard={(c) => <NotionTaskCard t={c.t} onOpen={setEditing} />} />
        ) : (
          <KanbanBoard
            columns={COLUMNS}
            moveOptions={[...COLUMNS, { value: 'cancelada' as TaskStatus, label: TASK_STATUS_NOTION.cancelada.label, tone: TONE_RGB.red }]}
            items={filtered} columnOf={(t) => t.status} onMove={move} itemLabel={(t) => t.title} emptyText="Arraste tarefas para cá"
            renderCard={(t) => <NotionTaskCard t={t} onOpen={setEditing} showAttribution />} />
        )}
      <TaskDialog open={creating || !!editing} task={editing} onOpenChange={(o) => { if (!o) { setEditing(null); setCreating(false); } }} />
      {confirmNode}
    </div>
  );
}
