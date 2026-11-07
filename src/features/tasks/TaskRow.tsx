import { CalendarClock, Star, Trash2 } from 'lucide-react';
import type { Task } from '@/domain/types';
import { PRIORITY, TASK_STATUS } from '@/domain/labels';
import { InstitutionBadge } from '@/components/domain/Institution';
import { Badge, DemoBadge, NotionBadge } from '@/components/ui/misc';
import { isFromNotion, isPersonalNotion } from '@/integrations/notion/mapping';
import { fmtDate, todayISO } from '@/lib/time';
import { cn } from '@/lib/utils';
import { isOverdue } from './taskLogic';
import { toggleComplete } from './actions';
import { useToast } from '@/components/ui/toast';

export function TaskRow({ task, onOpen, onMission, onDelete, compact }: { task: Task; onOpen: (t: Task) => void; onMission?: (t: Task) => void; onDelete?: (t: Task) => void; compact?: boolean }) {
  const toast = useToast();
  const today = todayISO();
  const done = task.status === 'concluida';
  const late = isOverdue(task, today);
  const inMission = task.is_mission && task.mission_date === today;
  return (
    <li className="flex items-start gap-3 rounded-lg border border-border bg-surface-2/40 p-3">
      <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-[rgb(var(--gold-300))]" checked={done}
        aria-label={done ? `Reabrir ${task.title}` : `Concluir ${task.title}`}
        onChange={() => toggleComplete(task).then(() => toast(done ? 'Tarefa reaberta.' : 'Tarefa concluída.')).catch((e) => toast(e.message, 'erro'))} />
      <div className="min-w-0 flex-1">
        <button type="button" onClick={() => onOpen(task)} className={cn('text-left text-sm font-semibold hover:text-gold', done && 'line-through text-muted')}>{task.title}</button>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className={cn('chip', PRIORITY[task.priority].cls)}>{PRIORITY[task.priority].label}</span>
          {!compact && <span className="chip border-border text-muted">{TASK_STATUS[task.status]}</span>}
          {isPersonalNotion(task) ? <Badge className="border-dashed">Pessoal</Badge> : <InstitutionBadge id={task.institution_id} />}
          {isFromNotion(task) && <NotionBadge />}
          {task.due_date && <span className={cn('chip border-border', late ? 'text-danger border-danger/60' : 'text-muted')}><CalendarClock size={12} aria-hidden />{late ? 'Atrasada · ' : ''}{fmtDate(task.due_date)}</span>}
          {task.checklist.length > 0 && <span className="chip border-border text-muted">{task.checklist.filter((c) => c.done).length}/{task.checklist.length}</span>}
          {task.is_demo && <DemoBadge />}
        </div>
      </div>
      {onMission && !done && (
        <button type="button" onClick={() => onMission(task)} aria-pressed={inMission} aria-label={inMission ? 'Remover da missão do dia' : 'Adicionar à missão do dia'}
          className={cn('rounded-lg p-1.5', inMission ? 'text-gold' : 'text-muted hover:text-gold')}>
          <Star size={18} fill={inMission ? 'currentColor' : 'none'} />
        </button>
      )}
      {onDelete && (
        <button type="button" onClick={() => onDelete(task)} aria-label={`Excluir ${task.title}`} className="rounded-lg p-1.5 text-muted hover:text-danger">
          <Trash2 size={16} />
        </button>
      )}
    </li>
  );
}
