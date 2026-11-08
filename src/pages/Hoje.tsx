import * as React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarCheck, CalendarDays, CheckCircle2, CheckSquare, Clock, NotebookPen, Plus, Star, Timer } from 'lucide-react';
import { useCollection } from '@/data/store';
import { useNow, useSettings } from '@/app/hooks';
import { useScope } from '@/app/scope';
import { Card, CardHeader, EmptyState, ErrorState, Loading, Progress, Stat } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { effectiveMinutes, STATUS_LABEL, workdayStatus, workedMinutes } from '@/lib/workday';
import { fmtDuration, fmtLongDate, recifeParts, toMin, weekdayOf } from '@/lib/time';
import { cn } from '@/lib/utils';
import { TaskRow } from '@/features/tasks/TaskRow';
import { TaskDialog } from '@/features/tasks/TaskDialog';
import { isOpen, isOverdue, MAX_MISSION, missionFor } from '@/features/tasks/taskLogic';
import { toggleMission } from '@/features/tasks/actions';
import { useDayBlocks } from '@/features/routine/useDayBlocks';
import { BLOCK_STATUS } from '@/domain/labels';
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
      <CardHeader title="Anotação rápida" icon={<NotebookPen size={16} />} />
      <form onSubmit={add} className="flex gap-2 px-5 pt-4">
        <label htmlFor="quick-note" className="sr-only">Nova anotação</label>
        <input id="quick-note" className="field" value={text} onChange={(e) => setText(e.target.value)} placeholder="Escreva e pressione Enter…" />
        <Button type="submit" size="icon" aria-label="Salvar anotação" className="h-10 w-10 shrink-0"><Plus size={16} /></Button>
      </form>
      <ul className="scrollbar-thin max-h-52 space-y-2 overflow-y-auto px-5 py-4 text-sm">
        {today.length === 0 && <li className="text-muted">Nenhuma anotação hoje.</li>}
        {today.map((n) => (
          <li key={n.id} className="panel flex items-start justify-between gap-2 px-3 py-2">
            <span className="whitespace-pre-wrap break-words">{n.text}</span>
            <button type="button" className="text-xs text-muted hover:text-danger" onClick={() => notes.remove(n.id)} aria-label="Excluir anotação">Excluir</button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Compromissos e reuniões de hoje (Agenda interna). */
function TodayAgenda({ date }: { date: string }) {
  const events = useCollection('agenda_events');
  const meetings = useCollection('meetings');
  const { matches } = useScope();
  const items = [
    ...events.items.filter((e) => e.date === date && matches(e.institution_id)).map((e) => ({ id: e.id, start: e.start, end: e.end, title: e.title, kind: 'Compromisso' })),
    ...meetings.items.filter((m) => m.date === date && matches(m.institution_id)).map((m) => ({ id: m.id, start: m.start, end: m.end, title: m.title, kind: 'Reunião' })),
  ].sort((a, b) => a.start.localeCompare(b.start));
  return (
    <Card>
      <CardHeader title="Agenda de hoje" icon={<CalendarDays size={16} />} action={<Link to="/agenda" className="text-xs text-muted hover:text-gold">Abrir agenda</Link>} />
      <div className="p-5 pt-4">
        {events.loading || meetings.loading ? <Loading /> : items.length === 0 ? <p className="text-sm text-muted">Nenhum compromisso hoje.</p> : (
          <ul className="space-y-2 text-sm">
            {items.map((i) => (
              <li key={i.id} className="panel flex items-center gap-3 px-3 py-2">
                <span className="w-24 shrink-0 font-mono text-xs text-muted">{i.start}–{i.end}</span>
                <span className="min-w-0 flex-1 truncate">{i.title}</span>
                <span className="chip border-border/80 text-muted">{i.kind}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

export default function Hoje() {
  const now = useNow();
  const { settings, workday } = useSettings();
  const { matchesItem } = useScope();
  const tasks = useCollection('tasks');
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
  const doneToday = scoped.filter((t) => t.status === 'concluida' && t.completed_at && recifeParts(new Date(t.completed_at)).date === now.date);
  const current = day.find((b) => toMin(b.start) <= toMin(now.time) && toMin(now.time) < toMin(b.end));
  const focus = settings.weekly_focus[String(weekdayOf(now.date))];
  const pct = Math.round((worked / total) * 100);

  async function onMission(t: Task) {
    const er = await toggleMission(t, tasks.items, now.date);
    if (er) toast(er, 'erro');
  }

  const suggestions = open.filter((t) => !(t.is_mission && t.mission_date === now.date))
    .sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999')).slice(0, 5);

  return (
    <div className="space-y-6">
      <section className="card relative overflow-hidden p-5 sm:p-7">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-gold-300/[.07] blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow">{fmtLongDate(now.date)} · {now.time}</p>
            <h1 className="brand-title mt-2 text-[28px] leading-none sm:text-[38px]">{greeting(now.time)}, <span className="text-gold">{settings.display_name}</span></h1>
            {focus && <p className="mt-2 text-sm text-muted">Foco do dia: <strong className="font-semibold text-fg">{focus}</strong></p>}
          </div>
          <span className={cn('chip', status === 'em_expediente' ? 'border-success/40 bg-success/10 text-success' : status === 'intervalo' ? 'border-orange/40 bg-orange/10 text-orange' : 'border-border text-muted')}>
            <Clock size={12} aria-hidden />{STATUS_LABEL[status]}
          </span>
        </div>
        <div className="relative mt-6">
          <div className="mb-2 flex items-end justify-between text-xs text-muted">
            <span>Jornada: <strong className="font-semibold text-fg">{fmtDuration(worked)}</strong> de {fmtDuration(total)}</span>
            <span className="tabular-nums">{pct}%</span>
          </div>
          <Progress value={pct} label="Progresso da jornada" />
          <p className="mt-2 text-xs text-muted">{workday.start}–{workday.end} · intervalo {workday.break_start}–{workday.break_end}</p>
        </div>
      </section>

      <section aria-label="Indicadores" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Tarefas abertas" value={tasks.loading ? '…' : open.length} icon={<CheckSquare size={16} />} />
        <Stat label="Atrasadas" value={tasks.loading ? '…' : overdue.length} icon={<AlertTriangle size={16} />} tone={overdue.length ? 'danger' : 'neutral'} />
        <Stat label="Vencem hoje" value={tasks.loading ? '…' : dueToday.length} icon={<CalendarCheck size={16} />} tone={dueToday.length ? 'orange' : 'neutral'} />
        <Stat label="Concluídas hoje" value={tasks.loading ? '…' : doneToday.length} icon={<CheckCircle2 size={16} />} tone={doneToday.length ? 'success' : 'neutral'} />
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.35fr_1fr] [&>*]:min-w-0">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Missão do dia" subtitle={`Até ${MAX_MISSION} tarefas essenciais · ${mission.length}/${MAX_MISSION}`} icon={<Star size={16} />}
              action={<Button size="sm" variant="secondary" onClick={() => setCreating(true)}><Plus size={14} />Tarefa</Button>} />
            <div className="p-5 pt-4">
              {tasks.error ? <ErrorState message={tasks.error} onRetry={tasks.reload} /> : tasks.loading ? <Loading /> : (
                <>
                  {mission.length === 0 ? <p className="mb-4 text-sm text-muted">Nenhuma tarefa na missão. Marque a estrela de até 3 tarefas abaixo.</p> : (
                    <ul className="mb-5 space-y-2">{mission.map((t) => <TaskRow key={t.id} task={t} onOpen={setEditing} onMission={onMission} compact />)}</ul>
                  )}
                  {mission.length < MAX_MISSION && suggestions.length > 0 && (
                    <>
                      <p className="eyebrow mb-2">Sugestões (por prazo)</p>
                      <ul className="space-y-2">{suggestions.map((t) => <TaskRow key={t.id} task={t} onOpen={setEditing} onMission={onMission} compact />)}</ul>
                    </>
                  )}
                  {overdue.length > 0 && <p className="mt-4 text-xs text-danger">{overdue.length} tarefa(s) atrasada(s). <Link className="underline" to="/tarefas?f=atrasadas">Ver atrasadas</Link></p>}
                </>
              )}
            </div>
          </Card>
          <QuickNote date={now.date} />
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Rotina de hoje" icon={<Timer size={16} />} action={<Link to="/rotina" className="text-xs text-muted hover:text-gold">Abrir rotina</Link>} />
            <div className="p-5 pt-4">
              {status === 'sem_expediente' && day.length === 0 ? <EmptyState title="Sem expediente" description="Sábados e domingos não têm rotina programada." /> :
                !ready ? <Loading /> : day.length === 0 ? <Loading label="Gerando rotina do dia…" /> : (
                  <ol className="space-y-1">
                    {day.map((b) => {
                      const isCur = current?.id === b.id;
                      return (
                        <li key={b.id} aria-current={isCur ? 'step' : undefined}
                          className={cn('flex items-center gap-3 rounded-xl border px-3 py-2 text-sm transition', isCur ? 'border-gold-300/40 bg-gold-300/[.06]' : 'border-transparent', b.is_break && 'opacity-60')}>
                          <span className="w-[88px] shrink-0 font-mono text-[11px] text-muted">{b.start}–{b.end}</span>
                          <span className={cn('min-w-0 flex-1 truncate', isCur && 'font-semibold')}>{b.title}</span>
                          {isCur ? <span className="chip border-gold-300/50 text-gold">Agora</span> : <span className={cn('chip', BLOCK_STATUS[b.status].cls)}>{BLOCK_STATUS[b.status].label}</span>}
                        </li>
                      );
                    })}
                  </ol>
                )}
            </div>
          </Card>
          <TodayAgenda date={now.date} />
        </div>
      </div>
      <TaskDialog open={creating || !!editing} task={editing} onOpenChange={(o) => { if (!o) { setEditing(null); setCreating(false); } }} />
    </div>
  );
}
