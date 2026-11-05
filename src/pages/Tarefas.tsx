import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Search, Trash2 } from 'lucide-react';
import { useCollection, actions } from '@/data/store';
import { useScope } from '@/app/scope';
import { useSettings } from '@/app/hooks';
import { PageHeader, Segmented, Loading, ErrorState, EmptyState, Card } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/form';
import { useConfirm } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { TaskRow } from '@/features/tasks/TaskRow';
import { TaskDialog } from '@/features/tasks/TaskDialog';
import { isOpen, isOverdue, withHistory } from '@/features/tasks/taskLogic';
import { toggleMission } from '@/features/tasks/actions';
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
  const [dragId, setDragId] = React.useState<string | null>(null);
  const { confirm, confirmNode } = useConfirm();
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
  async function del(t: Task) {
    if (await confirm({ title: 'Excluir tarefa', message: `Excluir “${t.title}”? Esta ação não pode ser desfeita.`, confirmLabel: 'Excluir', danger: true })) {
      try { await actions.remove('tasks', t.id); toast('Tarefa excluída.'); setEditing(null); } catch (e) { toast((e as Error).message, 'erro'); }
    }
  }
  async function move(id: string, s: TaskStatus) {
    const t = tasks.items.find((x) => x.id === id); if (!t || t.status === s) return;
    await actions.update('tasks', id, { status: s, completed_at: s === 'concluida' ? new Date().toISOString() : null, history: withHistory(t, 'Status alterado', `${TASK_STATUS[t.status]} → ${TASK_STATUS[s]}`) });
  }
  const setQuick = (v: string) => { v ? setParams({ f: v }) : setParams({}); };

  return (
    <div>
      <PageHeader title="Tarefas" subtitle={`${filtered.filter(isOpen).length} abertas · ${filtered.length} exibidas`}
        actions={<><Segmented label="Visualização" value={view} onChange={setView} options={[{ value: 'lista', label: 'Lista' }, { value: 'kanban', label: 'Kanban' }]} />
          <Button onClick={() => setCreating(true)}><Plus size={16} />Nova tarefa</Button></>} />

      <Card className="mb-4 grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="relative lg:col-span-2">
          <label htmlFor="busca" className="label">Buscar</label>
          <Search size={16} className="pointer-events-none absolute bottom-2.5 left-3 text-muted" aria-hidden />
          <input id="busca" type="search" className="field pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Título ou descrição…" />
        </div>
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
            {filtered.map((t) => (
              <div key={t.id} className="flex items-start gap-1">
                <div className="flex-1"><TaskRow task={t} onOpen={setEditing} onMission={onMission} /></div>
                <Button variant="ghost" size="icon" aria-label={`Excluir ${t.title}`} onClick={() => del(t)} className="mt-2"><Trash2 size={16} /></Button>
              </div>
            ))}
          </ul>
        ) : (
          <div className="-mx-4 overflow-x-auto px-4 pb-2">
            <div className="grid min-w-[880px] grid-cols-4 gap-3">
              {COLUMNS.map((col) => {
                const items = filtered.filter((t) => t.status === col);
                return (
                  <section key={col} aria-label={TASK_STATUS[col]} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (dragId) move(dragId, col); setDragId(null); }}
                    className="card flex min-h-[200px] flex-col p-3">
                    <h2 className="mb-2 flex items-center justify-between text-base text-gold">{TASK_STATUS[col]}<span className="text-xs text-muted">{items.length}</span></h2>
                    <ul className="flex flex-1 flex-col gap-2">
                      {items.map((t) => (
                        <li key={t.id} draggable onDragStart={() => setDragId(t.id)} className="cursor-grab rounded-lg border border-border bg-surface-2 p-3 text-sm">
                          <button type="button" className="text-left font-semibold hover:text-gold" onClick={() => setEditing(t)}>{t.title}</button>
                          <div className="mt-1 flex flex-wrap gap-1 text-xs">
                            <span className={cn('chip', PRIORITY[t.priority].cls)}>{PRIORITY[t.priority].label}</span>
                            {t.due_date && <span className={cn('chip border-border', isOverdue(t, today) ? 'text-danger' : 'text-muted')}>{fmtDate(t.due_date)}</span>}
                          </div>
                          <label className="mt-2 block">
                            <span className="sr-only">Mover {t.title} para</span>
                            <select className="field h-8 py-0 text-xs" value={t.status} onChange={(e) => move(t.id, e.target.value as TaskStatus)}>
                              {[...COLUMNS, 'cancelada' as TaskStatus].map((s) => <option key={s} value={s}>{TASK_STATUS[s]}</option>)}
                            </select>
                          </label>
                        </li>
                      ))}
                      {items.length === 0 && <li className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted">Arraste tarefas para cá</li>}
                    </ul>
                  </section>
                );
              })}
            </div>
          </div>
        )}
      <TaskDialog open={creating || !!editing} task={editing} onOpenChange={(o) => { if (!o) { setEditing(null); setCreating(false); } }} />
      {confirmNode}
    </div>
  );
}
