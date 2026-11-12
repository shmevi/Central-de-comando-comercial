import { CalendarClock, ListChecks, Star, Trash2 } from 'lucide-react';
import type { Task } from '@/domain/types';
import { PRIORITY, TASK_STATUS } from '@/domain/labels';
import { InstitutionBadge } from '@/components/domain/Institution';
import { Badge, DemoBadge, NotionBadge } from '@/components/ui/misc';
import { isFromNotion, isPersonalNotion } from '@/integrations/notion/mapping';
import { fmtDate, todayISO } from '@/lib/time';
import { cn } from '@/lib/utils';
import { dueText, isOverdue } from './taskLogic';
import { toggleComplete } from './actions';
import { useToast } from '@/components/ui/toast';

/** Cor da prioridade (filete à esquerda do cartão). */
export const PRIORITY_TONE: Record<Task['priority'], string> = {
  urgente: 'rgb(var(--danger))', alta: 'rgb(var(--orange))', media: 'rgb(var(--gold-300))', baixa: 'rgb(var(--border))',
};

/** Selos de uma tarefa (prioridade, instituição/pessoal, Notion, prazo, checklist). */
export function TaskMeta({ task, compact }: { task: Task; compact?: boolean }) {
  const late = isOverdue(task, todayISO());
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className={cn('chip', PRIORITY[task.priority].cls)}>{PRIORITY[task.priority].label}</span>
      {!compact && <span className="chip border-border/80 text-muted">{TASK_STATUS[task.status]}</span>}
      {isPersonalNotion(task) ? <Badge className="border-dashed">Pessoal</Badge> : <InstitutionBadge id={task.institution_id} />}
      {isFromNotion(task) && <NotionBadge />}
      {task.due_date && <span className={cn('chip border-border/80', late ? 'border-danger/50 text-danger' : 'text-muted')}><CalendarClock size={11} aria-hidden />{late ? 'Atrasada · ' : ''}{fmtDate(task.due_date)}</span>}
      {task.checklist.length > 0 && <span className="chip border-border/80 text-muted"><ListChecks size={11} aria-hidden />{task.checklist.filter((c) => c.done).length}/{task.checklist.length}</span>}
      {task.is_demo && <DemoBadge />}
    </div>
  );
}

/** Versão enxuta (tela Hoje): prioridade só no filete colorido; uma linha com o prazo e, se houver, a instituição. */
function TaskMetaMinimal({ task }: { task: Task }) {
  const due = task.due_date ? dueText(task.due_date, todayISO()) : null;
  if (!due && !task.institution_id && !task.is_demo) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
      {due && <span className={cn(due.late && 'font-medium text-danger')}>{due.text}</span>}
      {task.institution_id && !isPersonalNotion(task) && <InstitutionBadge id={task.institution_id} />}
      {task.is_demo && <DemoBadge />}
    </div>
  );
}

export function TaskRow({ task, onOpen, onMission, onDelete, compact, minimal }: { task: Task; onOpen: (t: Task) => void; onMission?: (t: Task) => void; onDelete?: (t: Task) => void; compact?: boolean; minimal?: boolean }) {
  const toast = useToast();
  const today = todayISO();
  const done = task.status === 'concluida';
  const inMission = task.is_mission && task.mission_date === today;
  return (
    <li className={cn('relative flex items-start gap-3 overflow-hidden rounded-xl border border-border/70 bg-surface-2/50 pl-4 pr-2 transition hover:border-border hover:bg-surface-2', minimal ? 'py-2.5' : 'py-3')}>
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px]" style={{ background: PRIORITY_TONE[task.priority] }} />
      <input type="checkbox" className="mt-0.5 h-[18px] w-[18px] shrink-0 cursor-pointer rounded accent-[rgb(var(--gold-300))]" checked={done}
        aria-label={done ? `Reabrir ${task.title}` : `Concluir ${task.title}`}
        onChange={() => toggleComplete(task).then(() => toast(done ? 'Tarefa reaberta.' : 'Tarefa concluída.')).catch((e) => toast(e.message, 'erro'))} />
      <div className="min-w-0 flex-1">
        <button type="button" onClick={() => onOpen(task)} className={cn('text-left text-sm font-medium leading-snug hover:text-gold', done && 'text-muted line-through')}>{task.title}</button>
        {minimal ? <TaskMetaMinimal task={task} /> : <div className="mt-1.5"><TaskMeta task={task} compact={compact} /></div>}
      </div>
      {onMission && !done && (
        <button type="button" onClick={() => onMission(task)} aria-pressed={inMission} aria-label={inMission ? 'Remover da missão do dia' : 'Adicionar à missão do dia'}
          className={cn('rounded-lg p-1.5 transition', inMission ? 'text-gold' : 'text-muted/70 hover:bg-surface-3 hover:text-gold')}>
          <Star size={17} fill={inMission ? 'currentColor' : 'none'} />
        </button>
      )}
      {onDelete && (
        <button type="button" onClick={() => onDelete(task)} aria-label={`Excluir ${task.title}`} className="rounded-lg p-1.5 text-muted/70 transition hover:bg-surface-3 hover:text-danger">
          <Trash2 size={16} />
        </button>
      )}
    </li>
  );
}
