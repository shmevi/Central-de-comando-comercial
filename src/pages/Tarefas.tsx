import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronDown, ListChecks, Plus, SlidersHorizontal, X } from 'lucide-react';
import { useCollection, actions } from '@/data/store';
import { useScope } from '@/app/scope';
import { useSettings } from '@/app/hooks';
import { PageHeader, Segmented, Loading, ErrorState, EmptyState, NotionBadge, DemoBadge } from '@/components/ui/misc';
import { Checkbox } from '@/components/ui/form';
import { TASK_ATTRIBUTION_OPTIONS, sortAttribution } from '@/integrations/notion/config';
import { isFromNotion } from '@/integrations/notion/mapping';
import { TASK_STATUS_NOTION, TONE_RGB, attributionTone, toneChip } from '@/features/notion/notionLook';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/form';
import { SearchInput } from '@/components/ui/search';
import { KanbanBoard } from '@/components/ui/kanban';
import { useToast } from '@/components/ui/toast';
import { TaskRow, PRIORITY_TONE } from '@/features/tasks/TaskRow';
import { TaskDialog } from '@/features/tasks/TaskDialog';
import { PushBanner } from '@/features/notion/PushPanel';
import { DUE_GROUPS, dueGroup, dueText, emptyTask, isOpen, isOverdue, matchesOrigin, matchesTab, taskOrigin, withHistory, type TaskOrigin, type TaskTab } from '@/features/tasks/taskLogic';
import { setTaskStatus, toggleMission } from '@/features/tasks/actions';
import { PRIORITY, TASK_STATUS, toOptions } from '@/domain/labels';
import type { Task, TaskStatus } from '@/domain/types';
import { todayISO } from '@/lib/time';
import { cn, nowIso } from '@/lib/utils';

/**
 * Tarefas — organizada por prazo:
 * - abas Todas / Hoje / Atrasadas / Próximos 7 dias (com contagem);
 * - busca sempre à mão; os outros filtros ficam recolhidos em "Filtros" e aparecem como etiquetas removíveis;
 * - lista agrupada (Atrasadas → Hoje → Amanhã → 7 dias → Depois → Sem prazo; concluídas recolhidas no fim);
 * - adicionar rápido (Enter) e concluir com "Desfazer";
 * - Kanban por atribuição ou status, com abas no celular e menu "⋯" para mover.
 */

/** Colunas por STATUS com os nomes e cores do Notion (Não iniciada, Em andamento, Pausada, Concluída). */
const COLUMNS: { value: TaskStatus; label: string; tone: string }[] = (['a_fazer', 'em_andamento', 'aguardando', 'concluida'] as TaskStatus[])
  .map((v) => ({ value: v, label: TASK_STATUS_NOTION[v].label, tone: TONE_RGB[TASK_STATUS_NOTION[v].tone] }));
const NO_ATTR = 'sem';
/** Colunas por ATRIBUIÇÃO, como a visualização de Tarefas do hub no Notion (70% / 20% / 10% / OFF WORK). */
const ATTR_COLUMNS = [...TASK_ATTRIBUTION_OPTIONS.map((a) => ({ value: a as string, label: a as string, tone: TONE_RGB[attributionTone(a)] })), { value: NO_ATTR, label: 'Sem atribuição', tone: 'rgb(var(--muted))' }];
type AttrCard = { id: string; t: Task; col: string };

const TABS: { value: TaskTab; label: string }[] = [{ value: '', label: 'Todas' }, { value: 'hoje', label: 'Hoje' }, { value: 'atrasadas', label: 'Atrasadas' }, { value: 'semana', label: 'Próximos 7 dias' }];
const EMPTY_TEXT: Record<TaskTab, string> = { '': 'Nenhuma tarefa por aqui.', hoje: 'Nada vence hoje.', atrasadas: 'Nenhuma tarefa atrasada.', semana: 'Nada nos próximos 7 dias.', missao: 'Nenhuma tarefa na missão do dia.' };
type Origin = 'todas' | TaskOrigin;
const isOrigin = (v: string | null): v is Origin => v === 'todas' || v === 'central' || v === 'notion';
const isTab = (v: string | null): v is TaskTab => v === '' || v === 'hoje' || v === 'atrasadas' || v === 'semana' || v === 'missao';
const SPECIAL_STATUS: Partial<Record<TaskStatus, string>> = { em_andamento: 'border-info/40 text-info', aguardando: 'border-orange/40 text-orange', cancelada: 'border-border text-muted' };

/** Cartão do Kanban, enxuto como na lista: prioridade no filete; uma linha com o essencial. */
function KanbanTaskCard({ t, onOpen, showAttribution, showStatus }: { t: Task; onOpen: (t: Task) => void; showAttribution?: boolean; showStatus?: boolean }) {
  const due = t.due_date ? dueText(t.due_date, todayISO(), isOpen(t)) : null;
  const special = showStatus ? SPECIAL_STATUS[t.status] : undefined;
  return (
    <div className="relative pl-2.5" title={`Prioridade ${PRIORITY[t.priority].label.toLowerCase()}`}>
      <span aria-hidden className="absolute bottom-0 left-0 top-0 w-[3px] rounded-full" style={{ background: PRIORITY_TONE[t.priority] }} />
      <span className="sr-only">Prioridade {PRIORITY[t.priority].label}.</span>
      <button type="button" className={cn('text-left text-sm font-medium leading-snug hover:text-gold', t.status === 'concluida' && 'text-muted line-through')} onClick={() => onOpen(t)}>{t.title}</button>
      <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
        {special && <span className={cn('chip', special)}>{TASK_STATUS_NOTION[t.status].label}</span>}
        {due && <span className={cn(due.late && 'font-medium text-danger')}>{due.text}</span>}
        {t.checklist.length > 0 && <span className="inline-flex items-center gap-1"><ListChecks size={12} aria-hidden />{t.checklist.filter((c) => c.done).length}/{t.checklist.length}</span>}
        {showAttribution && sortAttribution(t.attribution).map((a) => <span key={a} className={cn('chip', toneChip(attributionTone(a)))}>{a}</span>)}
        {isFromNotion(t) && <NotionBadge />}{t.is_demo && <DemoBadge />}
      </div>
    </div>
  );
}

/** Filtro ligado, com "x" para tirar. */
function FilterChip({ children, onClear }: { children: React.ReactNode; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-gold-300/40 bg-gold-300/[.08] py-0.5 pl-2.5 pr-1 text-xs text-fg">
      {children}
      <button type="button" onClick={onClear} className="grid h-5 w-5 place-items-center rounded-full text-muted hover:bg-surface-3 hover:text-fg" aria-label={`Remover filtro: ${typeof children === 'string' ? children : ''}`}><X size={12} /></button>
    </span>
  );
}

export default function Tarefas() {
  const tasks = useCollection('tasks');
  const { scope, matchesItem } = useScope();
  const { settings } = useSettings();
  const [params, setParams] = useSearchParams();
  const [view, setView] = React.useState<'lista' | 'kanban'>(() => { try { return (localStorage.getItem('ccc:tasks-view') as 'lista' | 'kanban') ?? 'lista'; } catch { return 'lista'; } });
  const [groupBy, setGroupBy] = React.useState<'atribuicao' | 'status'>(() => { try { return localStorage.getItem('ccc:tasks-group') === 'status' ? 'status' : 'atribuicao'; } catch { return 'atribuicao'; } });
  React.useEffect(() => { try { localStorage.setItem('ccc:tasks-group', groupBy); } catch { /* */ } }, [groupBy]);
  React.useEffect(() => { try { localStorage.setItem('ccc:tasks-view', view); } catch { /* */ } }, [view]);
  /** Como no Notion: o quadro por atribuição mostra só tarefas ativas, a não ser que se peça o contrário. */
  const [showClosed, setShowClosed] = React.useState(false);
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [doneOpen, setDoneOpen] = React.useState(false);
  const [q, setQ] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [priority, setPriority] = React.useState('');
  const [category, setCategory] = React.useState('');
  const [quickTitle, setQuickTitle] = React.useState('');
  const rawTab = params.get('f');
  const tab: TaskTab = isTab(rawTab) ? rawTab : '';
  const rawOrigin = params.get('origem');
  const origin: Origin = isOrigin(rawOrigin) ? rawOrigin : 'todas';
  const [editing, setEditing] = React.useState<Task | null>(null);
  const [creating, setCreating] = React.useState(false);
  const toast = useToast();
  const today = todayISO();

  /** Atualiza um parâmetro da URL preservando os outros (aba e origem convivem). */
  const setParam = (key: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v && v !== 'todas') next.set(key, v); else next.delete(key);
    setParams(next);
  };

  /** Filtros, exceto a aba e a origem (base dos contadores). */
  const base = tasks.items
    .filter((t) => matchesItem(t))
    .filter((t) => !q || `${t.title} ${t.description}`.toLowerCase().includes(q.toLowerCase()))
    .filter((t) => !status || t.status === status)
    .filter((t) => !priority || t.priority === priority)
    .filter((t) => !category || t.category === category);
  const inOrigin = base.filter((t) => matchesOrigin(t, origin));
  const originCounts = { todas: base.filter((t) => matchesTab(t, tab, today)).length, central: 0, notion: 0 };
  for (const t of base) if (matchesTab(t, tab, today)) originCounts[taskOrigin(t)]++;
  const tabCount = (v: TaskTab) => inOrigin.filter((t) => matchesTab(t, v, today) && (v !== '' || isOpen(t))).length;
  const filtered = inOrigin.filter((t) => matchesTab(t, tab, today))
    .sort((a, b) => PRIORITY[a.priority].rank - PRIORITY[b.priority].rank || (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'));
  const openCount = inOrigin.filter(isOpen).length;
  const lateCount = inOrigin.filter((t) => isOverdue(t, today)).length;

  async function onMission(t: Task) { const e = await toggleMission(t, tasks.items, today); if (e) toast(e, 'erro'); }

  async function quickAdd(e: React.FormEvent) {
    e.preventDefault();
    const title = quickTitle.trim(); if (!title) return;
    try {
      const created = await actions.create('tasks', {
        ...emptyTask(), title, due_date: tab === 'hoje' ? today : null,
        institution_id: scope !== 'all' && scope !== 'none' ? scope : null, history: withHistory({ history: [] }, 'Criada'),
      });
      setQuickTitle('');
      toast('Tarefa adicionada.', 'ok', { label: 'Detalhes', onClick: () => setEditing(created) });
    } catch (er) { toast((er as Error).message, 'erro'); }
  }

  /** Mover entre colunas de atribuição troca SÓ a atribuição de origem pela de destino (multi-select do Notion). */
  async function moveAttr(id: string, to: string) {
    const [taskId, from] = id.split('|');
    const t = tasks.items.find((x) => x.id === taskId); if (!t || from === to) return;
    const cur = sortAttribution(t.attribution);
    const next = sortAttribution(to === NO_ATTR ? cur.filter((a) => a !== from) : [...cur.filter((a) => a !== from), to]);
    try {
      await actions.update('tasks', t.id, { attribution: next, history: [...t.history, { at: nowIso(), action: 'Atribuição alterada', detail: next.join(', ') || 'sem atribuição' }] });
      toast(isFromNotion(t) ? `Atribuição de “${t.title}” alterada na Central. Envie ao Notion pelo aviso no topo.` : `Movida para ${to === NO_ATTR ? 'Sem atribuição' : to}.`);
    } catch (e) { toast((e as Error).message, 'erro'); }
  }
  async function move(id: string, s: TaskStatus) {
    const t = tasks.items.find((x) => x.id === id); if (!t || t.status === s) return;
    try { await setTaskStatus(t, s); toast(`Movida para ${TASK_STATUS_NOTION[s].label}.`); } catch (e) { toast((e as Error).message, 'erro'); }
  }

  const byAttr = view === 'kanban' && groupBy === 'atribuicao';
  const boardTasks = byAttr && !showClosed && !status ? filtered.filter(isOpen) : filtered;
  const attrCards: AttrCard[] = boardTasks.flatMap((t) => {
    const attrs = sortAttribution(t.attribution).filter((a) => (TASK_ATTRIBUTION_OPTIONS as readonly string[]).includes(a));
    return attrs.length ? attrs.map((a) => ({ id: `${t.id}|${a}`, t, col: a })) : [{ id: `${t.id}|${NO_ATTR}`, t, col: NO_ATTR }];
  });
  const attrColumns = ATTR_COLUMNS.filter((c) => c.value !== NO_ATTR || attrCards.some((x) => x.col === NO_ATTR));

  // Filtros ligados (aparecem como etiquetas removíveis)
  const active: { key: string; label: string; clear: () => void }[] = [
    ...(origin !== 'todas' ? [{ key: 'origem', label: origin === 'notion' ? 'Origem: Notion' : 'Origem: Rotina / Central', clear: () => setParam('origem', '') }] : []),
    ...(status ? [{ key: 'status', label: `Status: ${TASK_STATUS[status as TaskStatus]}`, clear: () => setStatus('') }] : []),
    ...(priority ? [{ key: 'prioridade', label: `Prioridade: ${PRIORITY[priority as Task['priority']].label}`, clear: () => setPriority('') }] : []),
    ...(category ? [{ key: 'categoria', label: `Categoria: ${category}`, clear: () => setCategory('') }] : []),
    ...(tab === 'missao' ? [{ key: 'missao', label: 'Só missão do dia', clear: () => setParam('f', '') }] : []),
  ];

  const groups = DUE_GROUPS.map((g) => ({ ...g, list: filtered.filter((t) => dueGroup(t, today) === g.key) })).filter((g) => g.list.length);
  groups.find((g) => g.key === 'concluidas')?.list.sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''));
  const showHeaders = groups.length > 1 || tab === '';

  return (
    <div>
      <PageHeader title="Tarefas" eyebrow="Dia a dia" subtitle={<>{openCount} {openCount === 1 ? 'aberta' : 'abertas'}{lateCount > 0 && <> · <span className="text-danger">{lateCount} {lateCount === 1 ? 'atrasada' : 'atrasadas'}</span></>}</>}
        actions={<><Segmented label="Visualização" value={view} onChange={setView} options={[{ value: 'lista', label: 'Lista' }, { value: 'kanban', label: 'Kanban' }]} />
          {view === 'kanban' && <Segmented label="Agrupar Kanban por" value={groupBy} onChange={setGroupBy} options={[{ value: 'atribuicao', label: 'Atribuição' }, { value: 'status', label: 'Status' }]} />}
          <Button onClick={() => setCreating(true)}><Plus size={16} />Nova tarefa</Button></>} />

      <PushBanner entity="tarefas" />

      {/* Abas por prazo */}
      <div className="scrollbar-thin -mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" role="group" aria-label="Mostrar">
        {TABS.map((t) => {
          const on = tab === t.value; const n = tabCount(t.value);
          return (
            <button key={t.value} type="button" aria-pressed={on} onClick={() => setParam('f', t.value)}
              className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition', on ? 'border-gold-300/50 bg-gold-300/10 font-semibold text-fg' : 'border-border/80 text-muted hover:text-fg')}>
              {t.label}
              {n > 0 && <span className={cn('rounded-full px-1.5 text-xs tabular-nums', t.value === 'atrasadas' ? 'bg-danger/15 text-danger' : 'bg-surface-3 text-muted')}>{n}</span>}
            </button>
          );
        })}
      </div>

      {/* Busca + filtros recolhidos */}
      <div className="mb-4 space-y-2">
        <div className="flex gap-2">
          <SearchInput id="busca" className="flex-1" value={q} onChange={setQ} placeholder="Buscar por título ou descrição…" />
          <Button variant="secondary" aria-expanded={filtersOpen} aria-controls="filtros-tarefas" onClick={() => setFiltersOpen((o) => !o)} className="shrink-0">
            <SlidersHorizontal size={15} />Filtros{active.length > 0 && <span className="rounded-full bg-gold-300/20 px-1.5 text-xs tabular-nums text-gold">{active.length}</span>}
          </Button>
        </div>
        {active.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {active.map((f) => <FilterChip key={f.key} onClear={f.clear}>{f.label}</FilterChip>)}
            {active.length > 1 && <button type="button" className="text-xs text-muted underline-offset-2 hover:text-fg hover:underline" onClick={() => { setStatus(''); setPriority(''); setCategory(''); const n = new URLSearchParams(params); n.delete('origem'); if (tab === 'missao') n.delete('f'); setParams(n); }}>Limpar tudo</button>}
          </div>
        )}
        {filtersOpen && (
          <div id="filtros-tarefas" className="card grid gap-3 p-3 sm:p-4">
            <Segmented label="Origem das tarefas" value={origin} onChange={(v) => setParam('origem', v)}
              options={[{ value: 'todas', label: 'Todas', count: originCounts.todas }, { value: 'central', label: 'Rotina / Central', count: originCounts.central }, { value: 'notion', label: 'Notion', count: originCounts.notion }]} />
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <SelectField label="Status" value={status} onChange={(e) => setStatus(e.target.value)} options={toOptions(TASK_STATUS)} placeholder="Todos" />
              <SelectField label="Prioridade" value={priority} onChange={(e) => setPriority(e.target.value)} options={Object.entries(PRIORITY).map(([v, p]) => ({ value: v, label: p.label }))} placeholder="Todas" />
              <SelectField className="col-span-2 lg:col-span-1" label="Categoria" value={category} onChange={(e) => setCategory(e.target.value)} options={settings.categories.map((c) => ({ value: c, label: c }))} placeholder="Todas" />
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              <Checkbox className="text-xs text-muted" label="Só a missão do dia" checked={tab === 'missao'} onChange={(v) => setParam('f', v ? 'missao' : '')} />
              {byAttr && <Checkbox className="text-xs text-muted" label="Mostrar concluídas e canceladas no quadro (no Notion ele mostra só as ativas)" checked={showClosed} onChange={setShowClosed} />}
            </div>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted" aria-label="Cores de prioridade">
              Prioridade (faixa à esquerda):
              {(Object.keys(PRIORITY) as Task['priority'][]).sort((a, b) => PRIORITY[a].rank - PRIORITY[b].rank).map((p) => (
                <span key={p} className="inline-flex items-center gap-1"><span aria-hidden className="h-3 w-[3px] rounded-full" style={{ background: PRIORITY_TONE[p] }} />{PRIORITY[p].label}</span>
              ))}
            </p>
          </div>
        )}
      </div>

      {tasks.error ? <ErrorState message={tasks.error} onRetry={tasks.reload} /> : tasks.loading ? <Loading /> :
        view === 'lista' ? (
          <div className="space-y-6">
            <form onSubmit={quickAdd} className="flex gap-2">
              <label htmlFor="nova-rapida" className="sr-only">Adicionar tarefa rápida</label>
              <input id="nova-rapida" className="field" value={quickTitle} onChange={(e) => setQuickTitle(e.target.value)}
                placeholder={tab === 'hoje' ? 'Nova tarefa para hoje… (Enter)' : 'Nova tarefa… (Enter para adicionar)'} />
              <Button type="submit" variant="secondary" size="icon" aria-label="Adicionar tarefa" className="h-10 w-10 shrink-0"><Plus size={16} /></Button>
            </form>
            {filtered.length === 0 ? (
              <EmptyState title={tasks.items.length ? EMPTY_TEXT[tab] : 'Nenhuma tarefa ainda'} description={tasks.items.length ? (active.length || q ? 'Ajuste a busca ou os filtros.' : undefined) : 'Escreva no campo acima e aperte Enter.'} />
            ) : groups.map((g) => {
              const list = <ul className="space-y-2">{g.list.map((t) => <TaskRow key={t.id} task={t} onOpen={setEditing} onMission={onMission} minimal />)}</ul>;
              if (g.key === 'concluidas') return (
                <details key={g.key} open={doneOpen} onToggle={(e) => setDoneOpen((e.currentTarget as HTMLDetailsElement).open)} className="group">
                  <summary className="mb-2 flex cursor-pointer list-none items-center gap-2 text-sm text-muted hover:text-fg">
                    <ChevronDown size={15} className="-rotate-90 transition group-open:rotate-0" aria-hidden />{g.label}<span className="tabular-nums">{g.list.length}</span>
                  </summary>
                  {list}
                </details>
              );
              return (
                <div key={g.key}>
                  {showHeaders && (
                    <h2 className={cn('mb-2 flex items-center gap-2 font-display text-sm tracking-wide', g.key === 'atrasadas' ? 'text-danger' : g.key === 'hoje' ? 'text-gold' : 'text-muted')}>
                      {g.label}<span className="font-sans text-xs font-normal tabular-nums text-muted">{g.list.length}</span>
                    </h2>
                  )}
                  {list}
                </div>
              );
            })}
          </div>
        ) : byAttr ? (
          <KanbanBoard mobileTabs columns={attrColumns} items={attrCards} columnOf={(c) => c.col} onMove={moveAttr} itemLabel={(c) => c.t.title} emptyText="Arraste tarefas para cá"
            renderCard={(c) => <KanbanTaskCard t={c.t} onOpen={setEditing} showStatus />} />
        ) : (
          <KanbanBoard mobileTabs
            columns={COLUMNS}
            moveOptions={[...COLUMNS, { value: 'cancelada' as TaskStatus, label: TASK_STATUS_NOTION.cancelada.label, tone: TONE_RGB.red }]}
            items={filtered} columnOf={(t) => t.status} onMove={move} itemLabel={(t) => t.title} emptyText="Arraste tarefas para cá"
            renderCard={(t) => <KanbanTaskCard t={t} onOpen={setEditing} showAttribution />} />
        )}

      <TaskDialog open={creating || !!editing} task={editing} onOpenChange={(o) => { if (!o) { setEditing(null); setCreating(false); } }} />
    </div>
  );
}
