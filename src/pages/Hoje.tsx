import * as React from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Plus, Star } from 'lucide-react';
import { useCollection } from '@/data/store';
import { useNow, useSettings } from '@/app/hooks';
import { useScope } from '@/app/scope';
import { Card, CardHeader, ErrorState, Loading, Progress } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { effectiveMinutes, workdayStatus, workedMinutes, type WorkdayStatus } from '@/lib/workday';
import { fmtDuration, fmtLongDate, recifeParts, toMin, weekdayOf } from '@/lib/time';
import { cn } from '@/lib/utils';
import { TaskRow } from '@/features/tasks/TaskRow';
import { TaskDialog } from '@/features/tasks/TaskDialog';
import { isOpen, isOverdue, MAX_MISSION, missionFor } from '@/features/tasks/taskLogic';
import { toggleMission } from '@/features/tasks/actions';
import { useDayBlocks } from '@/features/routine/useDayBlocks';
import type { RoutineBlock, Task } from '@/domain/types';

/**
 * Tela Hoje — responde "o que eu faço agora?":
 * topo com o bloco atual e a jornada; números só quando não são zero; Missão do dia como bloco principal;
 * "Próximos" junta rotina e agenda (só o que ainda vem); anotação rápida discreta no fim.
 */

const SUGGESTIONS = 3;
const NEXT_ITEMS = 3;

function greeting(time: string) {
  const h = Number(time.slice(0, 2));
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

/** Uma frase sobre o momento: bloco atual, intervalo, início ou fim do expediente. */
function nowLine(status: WorkdayStatus, current: RoutineBlock | undefined, start: string): React.ReactNode {
  if (status === 'sem_expediente') return 'Sem expediente hoje.';
  if (status === 'antes') return <>Expediente começa às <strong className="font-semibold text-fg">{start}</strong>.</>;
  if (status === 'encerrado') return 'Expediente encerrado.';
  if (current) return <>Agora: <strong className="font-semibold text-fg">{current.title}</strong> · até {current.end}</>;
  return status === 'intervalo' ? 'Intervalo.' : 'Em expediente.';
}

function Pill({ to, tone, children }: { to: string; tone: 'danger' | 'orange' | 'neutral' | 'success'; children: React.ReactNode }) {
  const cls = { danger: 'border-danger/40 bg-danger/10 text-danger', orange: 'border-orange/40 bg-orange/10 text-orange', success: 'border-success/40 bg-success/10 text-success', neutral: 'border-border text-muted' }[tone];
  return <Link to={to} className={cn('inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium transition hover:brightness-125', cls)}>{children}</Link>;
}

type NextItem = { id: string; start: string; end: string; title: string; kind: 'rotina' | 'compromisso' | 'reuniao'; muted?: boolean };

/** Próximos itens do dia: blocos da rotina e compromissos/reuniões que ainda não começaram. Some quando não há nada. */
function NextUp({ date, time, blocks, currentId }: { date: string; time: string; blocks: RoutineBlock[]; currentId?: string }) {
  const events = useCollection('agenda_events');
  const meetings = useCollection('meetings');
  const { matches } = useScope();
  const t = toMin(time);
  const items: NextItem[] = [
    ...blocks.filter((b) => b.id !== currentId && toMin(b.start) >= t).map((b) => ({ id: b.id, start: b.start, end: b.end, title: b.title, kind: 'rotina' as const, muted: b.is_break })),
    ...events.items.filter((e) => e.date === date && matches(e.institution_id) && toMin(e.end) > t).map((e) => ({ id: e.id, start: e.start, end: e.end, title: e.title, kind: 'compromisso' as const })),
    ...meetings.items.filter((m) => m.date === date && matches(m.institution_id) && toMin(m.end) > t).map((m) => ({ id: m.id, start: m.start, end: m.end, title: m.title, kind: 'reuniao' as const })),
  ].sort((a, b) => a.start.localeCompare(b.start) || (a.kind === 'rotina' ? 1 : -1)).slice(0, NEXT_ITEMS);
  if (!items.length) return null;
  return (
    <Card>
      <CardHeader title="Próximos" action={<span className="flex gap-3 text-xs"><Link to="/rotina" className="text-muted hover:text-gold">Rotina</Link><Link to="/agenda" className="text-muted hover:text-gold">Agenda</Link></span>} />
      <ol className="space-y-1 p-5 pt-3 text-sm">
        {items.map((i) => (
          <li key={i.id} className={cn('flex items-baseline gap-3 py-1', i.muted && 'opacity-60')}>
            <span className="w-11 shrink-0 tabular-nums text-xs text-muted">{i.start}</span>
            <span className="min-w-0 flex-1 truncate">{i.title}</span>
            {i.kind !== 'rotina' && <span className="shrink-0 text-xs text-gold">{i.kind === 'reuniao' ? 'Reunião' : 'Compromisso'}</span>}
          </li>
        ))}
      </ol>
    </Card>
  );
}

/** Anotação rápida: só o campo; as anotações do dia ficam recolhidas. */
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
    <Card className="p-4">
      <form onSubmit={add} className="flex gap-2">
        <label htmlFor="quick-note" className="sr-only">Anotação rápida</label>
        <input id="quick-note" className="field" value={text} onChange={(e) => setText(e.target.value)} placeholder="Anotação rápida…" />
        <Button type="submit" size="icon" variant="secondary" aria-label="Salvar anotação" className="h-10 w-10 shrink-0"><Plus size={16} /></Button>
      </form>
      {today.length > 0 && (
        <details className="group mt-3 text-sm">
          <summary className="flex cursor-pointer list-none items-center gap-1 text-xs text-muted hover:text-fg">
            {today.length === 1 ? '1 anotação hoje' : `${today.length} anotações hoje`}
            <ChevronDown size={14} className="transition group-open:rotate-180" aria-hidden />
          </summary>
          <ul className="scrollbar-thin mt-2 max-h-52 space-y-2 overflow-y-auto">
            {today.map((n) => (
              <li key={n.id} className="panel flex items-start justify-between gap-2 px-3 py-2">
                <span className="whitespace-pre-wrap break-words">{n.text}</span>
                <button type="button" className="text-xs text-muted hover:text-danger" onClick={() => notes.remove(n.id)} aria-label="Excluir anotação">Excluir</button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

export default function Hoje() {
  const now = useNow();
  const { settings, workday } = useSettings();
  const { matchesItem } = useScope();
  const tasks = useCollection('tasks');
  const { day, off } = useDayBlocks(now.date, true);
  const toast = useToast();
  const [editing, setEditing] = React.useState<Task | null>(null);
  const [creating, setCreating] = React.useState(false);

  const status = workdayStatus(now.date, now.time, workday);
  const total = Math.max(1, effectiveMinutes(workday));
  const worked = workedMinutes(now.date, now.time, workday);
  const pct = Math.round((worked / total) * 100);
  const scoped = tasks.items.filter((t) => matchesItem(t));
  const mission = missionFor(scoped, now.date);
  const open = scoped.filter(isOpen);
  const overdue = open.filter((t) => isOverdue(t, now.date));
  const dueToday = open.filter((t) => t.due_date === now.date);
  const doneToday = scoped.filter((t) => t.status === 'concluida' && t.completed_at && recifeParts(new Date(t.completed_at)).date === now.date);
  const current = day.find((b) => toMin(b.start) <= toMin(now.time) && toMin(now.time) < toMin(b.end));
  const focus = settings.weekly_focus[String(weekdayOf(now.date))];
  const suggestions = open.filter((t) => !(t.is_mission && t.mission_date === now.date))
    .sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999')).slice(0, SUGGESTIONS);

  async function onMission(t: Task) {
    const er = await toggleMission(t, tasks.items, now.date);
    if (er) toast(er, 'erro');
  }

  return (
    <div className="space-y-5">
      <section className="card relative overflow-hidden p-5 sm:p-6">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-gold-300/[.07] blur-3xl" />
        <div className="relative">
          <p className="text-xs text-muted">{fmtLongDate(now.date)} · {now.time}</p>
          <h1 className="brand-title mt-1.5 text-[26px] leading-none sm:text-[34px]">{greeting(now.time)}, <span className="text-gold">{settings.display_name}</span></h1>
          {focus && <p className="mt-2 text-sm text-muted">Foco do dia: <strong className="font-semibold text-fg">{focus}</strong></p>}

          <p className="mt-4 text-sm text-muted">{off && day.length === 0 ? 'Dia de folga — sem rotina hoje.' : nowLine(status, current, workday.start)}</p>
          {status !== 'sem_expediente' && !(off && day.length === 0) && (
            <div className="mt-2 flex items-center gap-3">
              <Progress value={pct} label="Progresso da jornada" className="h-1.5" />
              <span className="shrink-0 text-xs tabular-nums text-muted">{fmtDuration(worked)} de {fmtDuration(total)}</span>
            </div>
          )}

          {!tasks.loading && !tasks.error && (
            <div className="mt-4 flex flex-wrap gap-2" aria-label="Resumo das tarefas">
              {overdue.length > 0 && <Pill to="/tarefas?f=atrasadas" tone="danger">{overdue.length} {overdue.length === 1 ? 'atrasada' : 'atrasadas'}</Pill>}
              {dueToday.length > 0 && <Pill to="/tarefas?f=hoje" tone="orange">{dueToday.length} {dueToday.length === 1 ? 'vence hoje' : 'vencem hoje'}</Pill>}
              {open.length > 0 && <Pill to="/tarefas" tone="neutral">{open.length} {open.length === 1 ? 'aberta' : 'abertas'}</Pill>}
              {doneToday.length > 0 && <Pill to="/tarefas" tone="success">{doneToday.length} {doneToday.length === 1 ? 'concluída hoje' : 'concluídas hoje'}</Pill>}
              {open.length === 0 && doneToday.length === 0 && <span className="text-xs text-muted">Nenhuma tarefa pendente.</span>}
            </div>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.35fr_1fr] [&>*]:min-w-0">
        <Card>
          <CardHeader title="Missão do dia" subtitle={`${mission.length} de ${MAX_MISSION}`} icon={<Star size={16} />}
            action={<Button size="sm" variant="ghost" onClick={() => setCreating(true)}><Plus size={14} />Tarefa</Button>} />
          <div className="p-5 pt-4">
            {tasks.error ? <ErrorState message={tasks.error} onRetry={tasks.reload} /> : tasks.loading ? <Loading /> : (
              <>
                {mission.length > 0 && <ul className="space-y-2">{mission.map((t) => <TaskRow key={t.id} task={t} onOpen={setEditing} onMission={onMission} minimal />)}</ul>}
                {mission.length < MAX_MISSION && suggestions.length > 0 && (
                  <div className={cn(mission.length > 0 && 'mt-5')}>
                    <p className="mb-2 text-xs text-muted">{mission.length === 0 ? 'Toque na estrela para escolher até 3 tarefas. Sugestões:' : 'Sugestões'}</p>
                    <ul className="space-y-2">{suggestions.map((t) => <TaskRow key={t.id} task={t} onOpen={setEditing} onMission={onMission} minimal />)}</ul>
                  </div>
                )}
                {mission.length === 0 && suggestions.length === 0 && <p className="text-sm text-muted">Nenhuma tarefa aberta. Use “Tarefa” para criar uma.</p>}
              </>
            )}
          </div>
        </Card>

        <div className="space-y-5">
          <NextUp date={now.date} time={now.time} blocks={day} currentId={current?.id} />
          <QuickNote date={now.date} />
        </div>
      </div>
      <TaskDialog open={creating || !!editing} task={editing} onOpenChange={(o) => { if (!o) { setEditing(null); setCreating(false); } }} />
    </div>
  );
}
