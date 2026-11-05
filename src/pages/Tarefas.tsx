import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useCollection, actions } from '@/data/store';
import { useScope } from '@/app/scope';
import { useSettings } from '@/app/hooks';
import { PageHeader, Segmented, Loading, ErrorState, EmptyState, Card } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/form';
import { useConfirm } from '@/components/ui/dialog';
import { SearchInput } from '@/components/ui/search';
import { KanbanBoard } from '@/components/ui/kanban';
import { useToast } from '@/components/ui/toast';
import { TaskRow } from '@/features/tasks/TaskRow';
import { TaskDialog } from '@/features/tasks/TaskDialog';
import { isOpen, isOverdue } from '@/features/tasks/taskLogic';
import { setTaskStatus, toggleMission } from '@/features/tasks/actions';
import { PRIORITY, TASK_STATUS, toOptions } from '@/domain/labels';
import type { Task, TaskStatus } from '@/domain/types';
import { todayISO, fmtDate } from '@/lib/time';
import { cn } from '@/lib/utils';

const COLUMNS: TaskStatus[] = ['a_fazer', 'em_andamento', 'aguardando', 'concluida'];

export default function Tarefas() {
  const tasks = useCollection('tasks');
  const { matches } = useScope();
  const { settings } = useSettings();
  const [params, setParams] = useSearchParams();
  const [view, setView] = React.useState<'lista' | 'kanban'>(() => { try { return (localStorage.getItem('ccc:tasks-view') as any) ?? 'lista'; } catch { return 'lista'; } });
  const [q, setQ] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [priority, setPriority] = React.useState('');
  const [category, setCategory] = React.useState('');
  const quick = params.get('f') ?? '';
  const [editing, setEditing] = React.useState<Task | null>(null);
  const [creating, setCreating] = React.useState(false);
  const { confirmDelete, confirmNode } = useConfirm();
  const toast = useToast();
  const today = todayISO();

  React.useEffect(() => { try { localStorage.setItem('ccc:tasks-view', view); } catch { /* */ } }, [view]);

  const filtered = tasks.items
    .filter((t) => matches(t.institution_id))
    .filter((t) => !q || `${t.title} ${t.description}`.toLowerCase().includes(q.toLowerCase()))
    .filter((t) => !status || t.status === status)
    .filter((t) => !priority || t.priority === priority)
    .filter((t) => !category || t.category === category)
    .filter((t) => quick !== 'atrasadas' || isOverdue(t, today))
    .filter((t) => quick !== 'hoje' || (isOpen(t) && t.due_date === today))
    .filter((t) => quick !== 'missao' || (t.is_mission && t.mission_date === today))
    .sort((a, b) => Number(!isOpen(a)) - Number(!isOpen(b)) || PRIORITY[a.priority].rank - PRIORITY[b.priority].rank || (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'));

  async function onMission(t: Task) { const e = await toggleMission(t, tasks.items, today); if (e) toast(e, 'erro'); }
  const del = (t: Task) => confirmDelete('Excluir tarefa', `“${t.title}”`, async () => { await actions.remove('tasks', t.id); toast('Tarefa excluída.'); });
  async function move(id: string, s: TaskStatus) {
    const t = tasks.items.find((x) => x.id === id); if (!t || t.status === s) return;
    try { await setTaskStatus(t, s); } catch (e) { toast((e as Error).message, 'erro'); }
  }
  const setQuick = (v: string) => { v ? setParams({ f: v }) : setParams({}); };

  return (
    <div>
      <PageHeader title="Tarefas" subtitle={`${filtered.filter(isOpen).length} abertas · ${filtered.length} exibidas`}
        actions={<><Segmented label="Visualização" value={view} onChange={setView} options={[{ value: 'lista', label: 'Lista' }, { value: 'kanban', label: 'Kanban' }]} />
          <Button onClick={() => setCreating(true)}><Plus size={16} />Nova tarefa</Button></>} />

      <Card className="mb-4 grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-5">
        <SearchInput id="busca" className="lg:col-span-2" visibleLabel value={q} onChange={setQ} placeholder="Título ou descrição…" />
        <SelectField label="Status" value={status} onChange={(e) => setStatus(e.target.value)} options={toOptions(TASK_STATUS)} placeholder="Todos" />
        <SelectField label="Prioridade" value={priority} onChange={(e) => setPriority(e.target.value)} options={Object.entries(PRIORITY).map(([v, p]) => ({ value: v, label: p.label }))} placeholder="Todas" />
        <SelectField label="Categoria" value={category} onChange={(e) => setCategory(e.target.value)} options={settings.categories.map((c) => ({ value: c, label: c }))} placeholder="Todas" />
        <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-5">
          {[['', 'Todas'], ['hoje', 'Vencem hoje'], ['atrasadas', 'Atrasadas'], ['missao', 'Missão do dia']].map(([v, l]) => (
            <button key={v} type="button" aria-pressed={quick === v} onClick={() => setQuick(v)} className={cn('chip px-3 py-1', quick === v ? 'border-gold-300 text-gold bg-gold-300/10' : 'border-border text-muted')}>{l}</button>
          ))}
        </div>
      </Card>

      {tasks.error ? <ErrorState message={tasks.error} onRetry={tasks.reload} /> : tasks.loading ? <Loading /> :
        filtered.length === 0 && view === 'lista' ? <EmptyState title="Nenhuma tarefa encontrada" description={tasks.items.length ? 'Ajuste os filtros ou a busca.' : 'Crie sua primeira tarefa.'} action={<Button onClick={() => setCreating(true)}><Plus size={16} />Nova tarefa</Button>} /> :
        view === 'lista' ? (
          <ul className="space-y-2">
            {filtered.map((t) => <TaskRow key={t.id} task={t} onOpen={setEditing} onMission={onMission} onDelete={del} />)}
          </ul>
        ) : (
          <KanbanBoard
            columns={COLUMNS.map((c) => ({ value: c, label: TASK_STATUS[c] }))}
            moveOptions={[...COLUMNS, 'cancelada' as TaskStatus].map((c) => ({ value: c, label: TASK_STATUS[c] }))}
            items={filtered} columnOf={(t) => t.status} onMove={move} itemLabel={(t) => t.title} minWidth={880} emptyText="Arraste tarefas para cá"
            renderCard={(t) => (<>
              <button type="button" className="text-left font-semibold hover:text-gold" onClick={() => setEditing(t)}>{t.title}</button>
              <div className="mt-1 flex flex-wrap gap-1 text-xs">
                <span className={cn('chip', PRIORITY[t.priority].cls)}>{PRIORITY[t.priority].label}</span>
                {t.due_date && <span className={cn('chip border-border', isOverdue(t, today) ? 'text-danger' : 'text-muted')}>{fmtDate(t.due_date)}</span>}
              </div>
            </>)} />
        )}
      <TaskDialog open={creating || !!editing} task={editing} onOpenChange={(o) => { if (!o) { setEditing(null); setCreating(false); } }} />
      {confirmNode}
    </div>
  );
}
