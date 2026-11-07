import * as React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarCheck, CheckSquare, Clock, NotebookPen, Plus, Star, Timer, UserSearch } from 'lucide-react';
import { useCollection } from '@/data/store';
import { useNow, useSettings } from '@/app/hooks';
import { useScope } from '@/app/scope';
import { Card, CardHeader, EmptyState, ErrorState, Loading, Progress, Badge } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { effectiveMinutes, STATUS_LABEL, workdayStatus, workedMinutes } from '@/lib/workday';
import { fmtDate, fmtDuration, fmtLongDate, toMin, weekdayOf } from '@/lib/time';
import { cn } from '@/lib/utils';
import { TaskRow } from '@/features/tasks/TaskRow';
import { TaskDialog } from '@/features/tasks/TaskDialog';
import { isOpen, isOverdue, MAX_MISSION, missionFor } from '@/features/tasks/taskLogic';
import { toggleMission } from '@/features/tasks/actions';
import { useDayBlocks } from '@/features/routine/useDayBlocks';
import { BLOCK_STATUS, ATTENDANCE } from '@/domain/labels';
import type { Task } from '@/domain/types';

function greeting(time: string) {
  const h = Number(time.slice(0, 2));
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

function QuickNote({ date }: { date: string }) {
  const notes = useCollection('notes');
  const toast = useToast();
  const [text, setText] = React.useState('');
  const today = notes.items.filter((n) => n.date === date).sort((a, b) => b.created_at.localeCompare(a.created_at));
  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    try { await notes.create({ date, text: text.trim() }); setText(''); toast('Anotação salva.'); } catch (er) { toast((er as Error).message, 'erro'); }
  }
  return (
    <Card>
      <CardHeader title="Anotação rápida" icon={<NotebookPen size={18} />} />
      <form onSubmit={add} className="flex gap-2 p-4">
        <label htmlFor="quick-note" className="sr-only">Nova anotação</label>
        <input id="quick-note" className="field" value={text} onChange={(e) => setText(e.target.value)} placeholder="Escreva e pressione Enter…" />
        <Button type="submit" size="icon" aria-label="Salvar anotação"><Plus size={16} /></Button>
      </form>
      <ul className="max-h-48 space-y-2 overflow-y-auto px-4 pb-4 text-sm">
        {today.length === 0 && <li className="text-muted">Nenhuma anotação hoje.</li>}
        {today.map((n) => (
          <li key={n.id} className="flex items-start justify-between gap-2 rounded-lg bg-surface-2/60 px-3 py-2">
            <span className="whitespace-pre-wrap break-words">{n.text}</span>
            <button type="button" className="text-xs text-muted hover:text-danger" onClick={() => notes.remove(n.id)} aria-label="Excluir anotação">Excluir</button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default function Hoje() {
  const now = useNow();
  const { settings, workday } = useSettings();
  const { matches, matchesItem } = useScope();
  const tasks = useCollection('tasks');
  const interviews = useCollection('interviews');
  const candidates = useCollection('candidates');
  const { day, ready } = useDayBlocks(now.date, true);
  const toast = useToast();
  const [editing, setEditing] = React.useState<Task | null>(null);
  const [creating, setCreating] = React.useState(false);

  const status = workdayStatus(now.date, now.time, workday);
  const total = Math.max(1, effectiveMinutes(workday));
  const worked = workedMinutes(now.date, now.time, workday);
  const scoped = tasks.items.filter((t) => matchesItem(t));
  const mission = missionFor(scoped, now.date);
  const open = scoped.filter(isOpen);
  const overdue = open.filter((t) => isOverdue(t, now.date));
  const dueToday = open.filter((t) => t.due_date === now.date);
  const candidateById = Object.fromEntries(candidates.items.map((c) => [c.id, c]));
  const nextInterviews = interviews.items
    .filter((i) => matches(i.institution_id) && i.date >= now.date && i.decision === 'pendente')
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)).slice(0, 5);
  const current = day.find((b) => toMin(b.start) <= toMin(now.time) && toMin(now.time) < toMin(b.end));
  const focus = settings.weekly_focus[String(weekdayOf(now.date))];

  async function onMission(t: Task) {
    const er = await toggleMission(t, tasks.items, now.date);
    if (er) toast(er, 'erro');
  }

  const suggestions = open.filter((t) => !(t.is_mission && t.mission_date === now.date))
    .sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999')).slice(0, 5);

  return (
    <div className="space-y-5">
      <section className="card relative overflow-hidden p-5">
        <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-gold-300/10 blur-3xl" />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-muted">{fmtLongDate(now.date)} · {now.time}</p>
            <h1 className="text-3xl sm:text-4xl">{greeting(now.time)}, <span className="text-gold">{settings.display_name}</span></h1>
            {focus && <p className="mt-1 text-sm">Foco do dia: <strong className="text-gold">{focus}</strong></p>}
          </div>
          <div className="flex items-center gap-2">
            <span className={cn('chip', status === 'em_expediente' ? 'border-success/60 text-success bg-success/10' : status === 'intervalo' ? 'border-orange/60 text-orange bg-orange/10' : 'border-border text-muted')}>
              <Clock size={12} aria-hidden />{STATUS_LABEL[status]}
            </span>
          </div>
        </div>
        <div className="mt-5">
          <div className="mb-1 flex justify-between text-xs text-muted">
            <span>Jornada: {fmtDuration(worked)} de {fmtDuration(total)}</span>
            <span>{Math.round((worked / total) * 100)}%</span>
          </div>
          <Progress value={(worked / total) * 100} label="Progresso da jornada" />
          <p className="mt-1 text-xs text-muted">{workday.start}–{workday.end} · intervalo {workday.break_start}–{workday.break_end}</p>
        </div>
      </section>

      <section aria-label="Indicadores" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Tarefas abertas', value: open.length, icon: CheckSquare, cls: 'text-gold' },
          { label: 'Atrasadas', value: overdue.length, icon: AlertTriangle, cls: overdue.length ? 'text-danger' : 'text-muted' },
          { label: 'Vencem hoje', value: dueToday.length, icon: CalendarCheck, cls: 'text-orange' },
          { label: 'Próx. entrevistas', value: nextInterviews.length, icon: UserSearch, cls: 'text-info' },
        ].map(({ label, value, icon: Icon, cls }) => (
          <Card key={label} className="p-4">
            <div className="flex items-center justify-between text-xs uppercase tracking-wider text-muted">{label}<Icon size={16} className={cls} aria-hidden /></div>
            <div className={cn('mt-1 font-display text-4xl font-extrabold', cls)}>{tasks.loading ? '…' : value}</div>
          </Card>
        ))}
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.3fr_1fr] [&>*]:min-w-0">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Missão do dia" subtitle={`Até ${MAX_MISSION} tarefas essenciais · ${mission.length}/${MAX_MISSION}`} icon={<Star size={18} />}
              action={<Button size="sm" variant="secondary" onClick={() => setCreating(true)}><Plus size={14} />Tarefa</Button>} />
            <div className="p-4">
              {tasks.error ? <ErrorState message={tasks.error} onRetry={tasks.reload} /> : tasks.loading ? <Loading /> : (
                <>
                  {mission.length === 0 ? <p className="mb-3 text-sm text-muted">Nenhuma tarefa na missão. Marque a estrela de até 3 tarefas abaixo.</p> : (
                    <ul className="mb-4 space-y-2">{mission.map((t) => <TaskRow key={t.id} task={t} onOpen={setEditing} onMission={onMission} compact />)}</ul>
                  )}
                  {mission.length < MAX_MISSION && suggestions.length > 0 && (
                    <>
                      <p className="label">Sugestões (por prazo)</p>
                      <ul className="space-y-2">{suggestions.map((t) => <TaskRow key={t.id} task={t} onOpen={setEditing} onMission={onMission} compact />)}</ul>
                    </>
                  )}
                  {overdue.length > 0 && <p className="mt-3 text-xs text-danger">{overdue.length} tarefa(s) atrasada(s). <Link className="underline" to="/tarefas?f=atrasadas">Ver atrasadas</Link></p>}
                </>
              )}
            </div>
          </Card>
          <QuickNote date={now.date} />
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Rotina de hoje" icon={<Timer size={18} />} action={<Link to="/rotina" className="text-xs text-gold underline-offset-2 hover:underline">Abrir rotina</Link>} />
            <div className="p-4">
              {status === 'sem_expediente' && day.length === 0 ? <EmptyState title="Sem expediente" description="Sábados e domingos não têm rotina programada." /> :
                !ready ? <Loading /> : day.length === 0 ? <Loading label="Gerando rotina do dia…" /> : (
                  <ol className="space-y-1.5">
                    {day.map((b) => {
                      const isCur = current?.id === b.id;
                      return (
                        <li key={b.id} aria-current={isCur ? 'step' : undefined}
                          className={cn('flex items-center gap-3 rounded-lg border px-3 py-2 text-sm', isCur ? 'border-gold-300 bg-gold-300/10' : 'border-transparent', b.is_break && 'opacity-70')}>
                          <span className="w-24 shrink-0 font-mono text-xs text-muted">{b.start}–{b.end}</span>
                          <span className={cn('flex-1 truncate', isCur && 'font-semibold text-gold')}>{b.title}</span>
                          {isCur ? <Badge className="border-gold-300 text-gold">Agora</Badge> : <span className={cn('chip', BLOCK_STATUS[b.status].cls)}>{BLOCK_STATUS[b.status].label}</span>}
                        </li>
                      );
                    })}
                  </ol>
                )}
            </div>
          </Card>
          <Card>
            <CardHeader title="Próximas entrevistas" icon={<UserSearch size={18} />} action={<Link to="/recrutamento" className="text-xs text-gold hover:underline">Recrutamento</Link>} />
            <div className="p-4">
              {interviews.loading ? <Loading /> : nextInterviews.length === 0 ? <p className="text-sm text-muted">Nenhuma entrevista agendada.</p> : (
                <ul className="space-y-2 text-sm">
                  {nextInterviews.map((i) => (
                    <li key={i.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface-2/60 px-3 py-2">
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{candidateById[i.candidate_id]?.name ?? 'Candidato removido'}</div>
                        <div className="text-xs text-muted">{fmtDate(i.date)} · {i.time_confirmed ? i.start : 'horário a confirmar'}</div>
                      </div>
                      <span className="chip border-border text-muted">{ATTENDANCE[i.attendance]}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>
      </div>
      <TaskDialog open={creating || !!editing} task={editing} onOpenChange={(o) => { if (!o) { setEditing(null); setCreating(false); } }} />
    </div>
  );
}
