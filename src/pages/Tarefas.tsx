import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useCollection, actions } from '@/data/store';
import { useScope } from '@/app/scope';
import { useSettings } from '@/app/hooks';
import { PageHeader, Segmented, Loading, ErrorState, EmptyState, FilterBar } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/form';
import { useConfirm } from '@/components/ui/dialog';
import { SearchInput } from '@/components/ui/search';
import { KanbanBoard } from '@/components/ui/kanban';
import { useToast } from '@/components/ui/toast';
import { TaskMeta, TaskRow, PRIORITY_TONE } from '@/features/tasks/TaskRow';
import { TaskDialog } from '@/features/tasks/TaskDialog';
import { isOpen, isOverdue, matchesOrigin, taskOrigin, type TaskOrigin } from '@/features/tasks/taskLogic';
import { setTaskStatus, toggleMission } from '@/features/tasks/actions';
import { PRIORITY, TASK_STATUS, toOptions } from '@/domain/labels';
import type { Task, TaskStatus } from '@/domain/types';
import { todayISO } from '@/lib/time';
import { cn } from '@/lib/utils';

const COLUMNS: { value: TaskStatus; label: string; tone: string }[] = [
  { value: 'a_fazer', label: TASK_STATUS.a_fazer, tone: 'rgb(var(--muted))' },
  { value: 'em_andamento', label: TASK_STATUS.em_andamento, tone: 'rgb(var(--gold-300))' },
  { value: 'aguardando', label: TASK_STATUS.aguardando, tone: 'rgb(var(--orange))' },
  { value: 'concluida', label: TASK_STATUS.concluida, tone: 'rgb(var(--success))' },
];
const QUICK: [string, string][] = [['', 'Todas'], ['hoje', 'Vencem hoje'], ['atrasadas', 'Atrasadas'], ['missao', 'Missão do dia']];
type Origin = 'todas' | TaskOrigin;
const isOrigin = (v: string | null): v is Origin => v === 'todas' || v === 'central' || v === 'notion';

export default function Tarefas() {
  const tasks = useCollection('tasks');
  const { matchesItem } = useScope();
  const { settings } = useSettings();
  const [params, setParams] = useSearchParams();
  const [view, setView] = React.useState<'lista' | 'kanban'>(() => { try { return (localStorage.getItem('ccc:tasks-view') as 'lista' | 'kanban') ?? 'lista'; } catch { return 'lista'; } });
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

  return (
    <div>
      <PageHeader title="Tarefas" eyebrow="Dia a dia" subtitle={`${filtered.filter(isOpen).length} abertas · ${filtered.length} exibidas`}
        actions={<><Segmented label="Visualização" value={view} onChange={setView} options={[{ value: 'lista', label: 'Lista' }, { value: 'kanban', label: 'Kanban' }]} />
          <Button onClick={() => setCreating(true)}><Plus size={16} />Nova tarefa</Button></>} />

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
        ) : (
          <KanbanBoard
            columns={COLUMNS}
            moveOptions={[...COLUMNS, { value: 'cancelada' as TaskStatus, label: TASK_STATUS.cancelada }]}
            items={filtered} columnOf={(t) => t.status} onMove={move} itemLabel={(t) => t.title} emptyText="Arraste tarefas para cá"
            renderCard={(t) => (
              <div className="relative pl-2.5">
                <span aria-hidden className="absolute bottom-0 left-0 top-0 w-[3px] rounded-full" style={{ background: PRIORITY_TONE[t.priority] }} />
                <button type="button" className={cn('pr-4 text-left text-sm font-medium leading-snug hover:text-gold', t.status === 'concluida' && 'text-muted line-through')} onClick={() => setEditing(t)}>{t.title}</button>
                <div className="mt-2"><TaskMeta task={t} compact /></div>
              </div>
            )} />
        )}
      <TaskDialog open={creating || !!editing} task={editing} onOpenChange={(o) => { if (!o) { setEditing(null); setCreating(false); } }} />
      {confirmNode}
    </div>
  );
}
