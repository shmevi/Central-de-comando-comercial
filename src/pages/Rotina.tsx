import * as React from 'react';
import { Check, Coffee, Lock, MoreHorizontal, Palmtree, Plus, RefreshCw } from 'lucide-react';
import { useCollection, actions } from '@/data/store';
import { useNow, useSettings } from '@/app/hooks';
import { PageHeader, Segmented, Loading, ErrorState, EmptyState, Card, Progress } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { useDraft } from '@/components/ui/use-draft';
import { Dialog, useConfirm } from '@/components/ui/dialog';
import { Checkbox, SelectField, TextArea, TextField } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { DateNav } from '@/components/ui/date-nav';
import { InstitutionSelect } from '@/components/domain/Institution';
import { BLOCK_STATUS } from '@/domain/labels';
import type { BlockStatus, RoutineBlock } from '@/domain/types';
import { addDays, fmtDate, fmtDuration, fmtLongDate, isWeekend, todayISO, toMin, weekDates, WEEKDAYS_SHORT, weekdayOf } from '@/lib/time';
import { hitsBreak, type Workday } from '@/lib/workday';
import { conflictingIds } from '@/lib/conflicts';
import { useDayBlocks, materializeDay } from '@/features/routine/useDayBlocks';
import { setDayOff } from '@/features/routine/offDays';
import { cn } from '@/lib/utils';

type Draft = Omit<RoutineBlock, 'id' | 'created_at' | 'updated_at'>;

function validate(d: Draft, w: Workday): Record<string, string> {
  const e: Record<string, string> = {};
  if (!d.title.trim()) e.title = 'Informe o título.';
  if (!d.start || !d.end) e.time = 'Informe início e fim.';
  else if (toMin(d.end) <= toMin(d.start)) e.time = 'O fim deve ser depois do início.';
  if (!d.is_break && d.start && d.end && hitsBreak(d.start, d.end, w) && !d.break_exception)
    e.break = `Este horário invade o intervalo (${w.break_start}–${w.break_end}). Marque a exceção explícita para continuar.`;
  if (d.break_exception && !d.break_exception_reason.trim()) e.reason = 'Justifique a exceção ao intervalo.';
  return e;
}

function BlockDialog({ open, onOpenChange, block, date, workday }: { open: boolean; onOpenChange: (o: boolean) => void; block: RoutineBlock | null; date: string; workday: Workday }) {
  const { settings, save: saveSettings } = useSettings();
  const toast = useToast();
  const empty: Draft = { date, start: '', end: '', title: '', category: 'Geral', status: 'planejado', notes: '', is_break: false, break_exception: false, break_exception_reason: '', institution_id: null };
  const { d, set, err, setErr } = useDraft(open, () => block ? { ...block } : empty, [block]);
  const needsException = !d.is_break && d.start && d.end && hitsBreak(d.start, d.end, workday);
  async function save() {
    const e = validate(d, workday); setErr(e); if (Object.keys(e).length) return;
    try {
      if (block) await actions.update('routine_blocks', block.id, d);
      else { await actions.create('routine_blocks', d); await setDayOff(settings, saveSettings, date, false, todayISO()).catch(() => {}); }
      toast('Bloco salvo.'); onOpenChange(false);
    } catch (er) { toast((er as Error).message, 'erro'); }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={block ? 'Editar bloco' : 'Novo bloco'} description={fmtLongDate(date)}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={save}>Salvar</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField className="sm:col-span-2" label="Título" required value={d.title} onChange={(e) => set('title', e.target.value)} error={err.title} />
        <TextField label="Início" type="time" required value={d.start} onChange={(e) => set('start', e.target.value)} error={err.time} />
        <TextField label="Fim" type="time" required value={d.end} onChange={(e) => set('end', e.target.value)} />
        <SelectField label="Categoria" value={d.category} onChange={(e) => set('category', e.target.value)} options={[...new Set([...settings.categories, d.category])].map((c) => ({ value: c, label: c }))} />
        <SelectField label="Status" value={d.status} onChange={(e) => set('status', e.target.value as BlockStatus)} options={Object.entries(BLOCK_STATUS).map(([v, s]) => ({ value: v, label: s.label }))} />
        <InstitutionSelect value={d.institution_id} onChange={(v) => set('institution_id', v)} />
        <TextArea className="sm:col-span-2" label="Observações" value={d.notes} onChange={(e) => set('notes', e.target.value)} />
        {(needsException || d.break_exception) && (
          <div className="sm:col-span-2 space-y-2 rounded-lg border border-orange/50 bg-orange/5 p-3">
            <p className="flex items-center gap-2 text-sm text-orange"><Lock size={14} />O intervalo é protegido.</p>
            {err.break && <p role="alert" className="text-xs text-danger">{err.break}</p>}
            <Checkbox label="Autorizo explicitamente o uso do intervalo neste dia" checked={d.break_exception} onChange={(v) => set('break_exception', v)} />
            {d.break_exception && <TextField label="Motivo da exceção" required value={d.break_exception_reason} onChange={(e) => set('break_exception_reason', e.target.value)} error={err.reason} />}
          </div>
        )}
      </div>
    </Dialog>
  );
}

function DayView({ date, workday, nowTime, isToday }: { date: string; workday: Workday; nowTime: string; isToday: boolean }) {
  const { day, blocks, ready, off, generate } = useDayBlocks(date, false);
  const { settings, save } = useSettings();
  const [editing, setEditing] = React.useState<RoutineBlock | null>(null);
  const [creating, setCreating] = React.useState(false);
  const { confirm, confirmNode } = useConfirm();
  const toast = useToast();
  const conflicts = conflictingIds(day);
  const workBlocks = day.filter((b) => !b.is_break);
  const doneMin = workBlocks.filter((b) => b.status === 'concluido').reduce((s, b) => s + toMin(b.end) - toMin(b.start), 0);
  const planMin = workBlocks.reduce((s, b) => s + toMin(b.end) - toMin(b.start), 0);
  const markOff = (on: boolean) => setDayOff(settings, save, date, on, todayISO()).catch(() => { /* a marca é um extra: não bloqueia */ });

  async function setStatus(b: RoutineBlock, s: BlockStatus) { try { await actions.update('routine_blocks', b.id, { status: s }); } catch (e) { toast((e as Error).message, 'erro'); } }
  async function del(b: RoutineBlock) {
    if (b.is_break) return toast('O intervalo não pode ser excluído.', 'erro');
    if (!(await confirm({ title: 'Excluir bloco', message: `Excluir “${b.title}” (${b.start}–${b.end})?`, danger: true, confirmLabel: 'Excluir' }))) return;
    await actions.remove('routine_blocks', b.id);
    // Esvaziou o dia de propósito: a rotina-base não volta sozinha ao abrir a tela Hoje.
    if (day.filter((x) => x.id !== b.id).length === 0) { await markOff(true); toast('Dia sem rotina. Ela não será recriada sozinha — use “Gerar rotina do dia” se quiser.', 'info'); }
  }
  async function regenerate() {
    if (!(await confirm({ title: 'Restaurar rotina-base', message: 'Os blocos deste dia serão substituídos pela rotina-base. Continuar?', confirmLabel: 'Restaurar' }))) return;
    for (const b of day) await actions.remove('routine_blocks', b.id);
    await generate(); await markOff(false); toast('Rotina restaurada.');
  }
  /** Folga/feriado: apaga todos os blocos do dia (inclusive o intervalo) e a rotina-base não volta sozinha. */
  async function dayOff() {
    if (!(await confirm({ title: 'Dia de folga', message: `Apagar todos os blocos de ${fmtLongDate(date)}? A rotina-base não será recriada sozinha — você pode gerar de novo quando quiser.`, danger: true, confirmLabel: 'Marcar folga' }))) return;
    for (const b of day) await actions.remove('routine_blocks', b.id);
    await markOff(true); toast('Dia de folga marcado.');
  }
  async function onMenu(b: RoutineBlock, v: string) {
    if (v === 'editar') setEditing(b);
    else if (v === 'excluir') await del(b);
    else if (v.startsWith('st:')) await setStatus(b, v.slice(3) as BlockStatus);
  }

  if (blocks.error) return <ErrorState message={blocks.error} onRetry={blocks.reload} />;
  if (!ready) return <Loading />;
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">Concluído <strong className="font-semibold text-fg">{fmtDuration(doneMin)}</strong> de {fmtDuration(planMin)}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => setCreating(true)}><Plus size={14} />Bloco</Button>
            {day.length > 0 && <Button size="sm" variant="ghost" onClick={regenerate}><RefreshCw size={14} />Restaurar base</Button>}
            {day.length > 0 && <Button size="sm" variant="ghost" onClick={dayOff}><Palmtree size={14} />Dia de folga</Button>}
          </div>
        </div>
        <Progress className="mt-3 h-1.5" value={planMin ? (doneMin / planMin) * 100 : 0} label="Progresso da rotina do dia" />
      </Card>
      {day.length === 0 ? (
        <EmptyState title={off ? 'Dia de folga' : isWeekend(date) ? 'Sem expediente' : 'Rotina não gerada'}
          description={off ? 'Este dia está sem rotina de propósito: a rotina-base não é recriada sozinha.' : isWeekend(date) ? 'Fins de semana não têm expediente. Você pode gerar a rotina se precisar.' : 'Gere os blocos a partir da rotina-base.'}
          action={<Button onClick={async () => { await generate(); await markOff(false); }}>Gerar rotina do dia</Button>} />
      ) : (
        <ol className="space-y-1.5">
          {day.map((b) => {
            const cur = isToday && toMin(b.start) <= toMin(nowTime) && toMin(nowTime) < toMin(b.end);
            const done = b.status === 'concluido';
            const special = b.status === 'em_andamento' || b.status === 'adiado';
            return (
              <li key={b.id} className={cn('flex items-center gap-3 rounded-xl border px-3 py-2.5 transition', cur ? 'border-gold-300/60 bg-gold-300/[.06]' : 'border-border/70 bg-surface/60', b.is_break && 'bg-surface-2/40')}>
                {b.is_break ? <span className="grid h-7 w-7 shrink-0 place-items-center text-orange" aria-hidden><Coffee size={16} /></span> : (
                  <button type="button" onClick={() => setStatus(b, done ? 'planejado' : 'concluido')} aria-pressed={done} aria-label={done ? `Desmarcar ${b.title}` : `Concluir ${b.title}`}
                    className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 transition', done ? 'border-success bg-success/20 text-success' : 'border-border hover:border-gold-300')}>
                    {done && <Check size={14} strokeWidth={3} />}
                  </button>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    {b.is_break ? <span className={cn('text-sm font-medium', done && 'text-muted')}>{b.title}</span>
                      : <button type="button" onClick={() => setEditing(b)} className={cn('text-left text-sm font-medium [overflow-wrap:anywhere] hover:text-gold', done && 'text-muted line-through')}>{b.title}</button>}
                    {cur && <span className="chip border-gold-300/60 text-gold">Agora</span>}
                    {conflicts.has(b.id) && <span className="chip border-danger/60 text-danger">Conflito de horário</span>}
                    {b.break_exception && <span className="chip border-orange/60 text-orange" title={b.break_exception_reason}>Exceção ao intervalo</span>}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                    <span className="tabular-nums">{b.start}–{b.end} · {fmtDuration(toMin(b.end) - toMin(b.start))}</span>
                    {!b.is_break && <span>{b.category}</span>}
                    {special && <span className={cn('chip', BLOCK_STATUS[b.status].cls)}>{BLOCK_STATUS[b.status].label}</span>}
                    {b.is_break && <span className="inline-flex items-center gap-1 text-orange"><Lock size={11} aria-hidden />Protegido</span>}
                  </div>
                </div>
                {!b.is_break && (
                  <label className="relative grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-surface-3 hover:text-fg focus-within:outline focus-within:outline-2 focus-within:outline-gold-300/60" title="Mais ações">
                    <span className="sr-only">Ações de {b.title}</span>
                    <MoreHorizontal size={16} aria-hidden />
                    <select className="absolute inset-0 cursor-pointer opacity-0" value="" onChange={(e) => onMenu(b, e.target.value)}>
                      <option value="" disabled>Ações</option>
                      <optgroup label="Status">
                        {(Object.keys(BLOCK_STATUS) as BlockStatus[]).map((k) => <option key={k} value={`st:${k}`}>{k === b.status ? '✓ ' : ''}{BLOCK_STATUS[k].label}</option>)}
                      </optgroup>
                      <option value="editar">Editar…</option>
                      <option value="excluir">Excluir…</option>
                    </select>
                  </label>
                )}
              </li>
            );
          })}
        </ol>
      )}
      <BlockDialog open={creating || !!editing} block={editing} date={date} workday={workday} onOpenChange={(o) => { if (!o) { setEditing(null); setCreating(false); } }} />
      {confirmNode}
    </div>
  );
}

function WeekView({ date, onPick }: { date: string; onPick: (d: string) => void }) {
  const blocks = useCollection('routine_blocks');
  const templates = useCollection('routine_templates');
  const days = weekDates(date, 5);
  if (blocks.loading || !blocks.loaded) return <Loading />;
  return (
    <div className="relative sm:-mx-4 sm:overflow-x-auto sm:px-4 lg:mx-0 lg:px-0">
      <div className="grid gap-3 sm:min-w-[760px] sm:grid-cols-5">
        {days.map((d) => {
          const list = blocks.items.filter((b) => b.date === d).sort((a, b) => a.start.localeCompare(b.start));
          const done = list.filter((b) => b.status === 'concluido').length;
          return (
            <section key={d} className="card p-3" aria-label={fmtDate(d)}>
              <button type="button" onClick={() => onPick(d)} className="mb-2 w-full text-left">
                <h2 className="font-display text-sm font-semibold tracking-wide">{WEEKDAYS_SHORT[weekdayOf(d)]} {fmtDate(d).slice(0, 5)}</h2>
                <p className="text-xs text-muted">{list.length ? `${done}/${list.filter((b) => !b.is_break).length} concluídos` : 'Não gerada'}</p>
              </button>
              {list.length === 0 ? <Button size="sm" variant="secondary" className="w-full" onClick={() => materializeDay(d, templates.items)}>Gerar</Button> : (
                <ul className="space-y-1">
                  {list.map((b) => (
                    <li key={b.id} className={cn('rounded-md border px-2 py-1 text-xs', BLOCK_STATUS[b.status].cls, b.is_break && 'opacity-60')}>
                      <span className="font-mono">{b.start}</span> {b.title}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

export default function Rotina() {
  const now = useNow();
  const { workday } = useSettings();
  const [date, setDate] = React.useState(now.date);
  const [view, setView] = React.useState<'dia' | 'semana'>('dia');
  const step = view === 'dia' ? 1 : 7;
  return (
    <div>
      <PageHeader title="Minha Rotina" subtitle={view === 'dia' ? fmtLongDate(date) : `Semana de ${fmtDate(weekDates(date)[0])}`}
        actions={<Segmented label="Visão" value={view} onChange={setView} options={[{ value: 'dia', label: 'Dia' }, { value: 'semana', label: 'Semana' }]} />} />
      <DateNav date={date} today={now.date} onChange={setDate} onPrev={() => setDate(addDays(date, -step))} onNext={() => setDate(addDays(date, step))} />
      {view === 'dia' ? <DayView key={date} date={date} workday={workday} nowTime={now.time} isToday={date === now.date} />
        : <WeekView date={date} onPick={(d) => { setDate(d); setView('dia'); }} />}
    </div>
  );
}
