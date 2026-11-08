import * as React from 'react';
import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { actions, useCollection } from '@/data/store';
import { useNow, useSettings } from '@/app/hooks';
import { useScope } from '@/app/scope';
import { PageHeader, Segmented, Loading, EmptyState, Card, DemoBadge } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { useDraft } from '@/components/ui/use-draft';
import { Dialog, useConfirm } from '@/components/ui/dialog';
import { SelectField, TextArea, TextField } from '@/components/ui/form';
import { InstitutionBadge, InstitutionSelect } from '@/components/domain/Institution';
import { useToast } from '@/components/ui/toast';
import { DateNav } from '@/components/ui/date-nav';
import type { AgendaEvent, AgendaKind } from '@/domain/types';
import { addDays, shiftMonth, fmtDate, fmtLongDate, MONTHS, monthGrid, toMin, weekDates, WEEKDAYS_SHORT, weekdayOf, isWeekend } from '@/lib/time';
import { conflictingIds, findConflicts } from '@/lib/conflicts';
import { hitsBreak } from '@/lib/workday';
import { cn } from '@/lib/utils';

const KINDS: Record<AgendaKind, string> = { compromisso: 'Compromisso', reuniao: 'Reunião', entrevista: 'Entrevista', treinamento: 'Treinamento', foco: 'Bloco de foco' };
type Item = { id: string; date: string; start: string; end: string; title: string; kind: string; institution_id: string | null; source: 'evento' | 'reuniao'; ref?: AgendaEvent; is_demo?: boolean; tentative?: boolean };

function useAgendaItems() {
  const events = useCollection('agenda_events');
  const meetings = useCollection('meetings');
  const { matches } = useScope();
  const items: Item[] = [
    ...events.items.map((e) => ({ id: e.id, date: e.date, start: e.start, end: e.end, title: e.title, kind: KINDS[e.kind], institution_id: e.institution_id, source: 'evento' as const, ref: e, is_demo: e.is_demo })),
    ...meetings.items.map((m) => ({ id: m.id, date: m.date, start: m.start, end: m.end, title: m.title, kind: 'Reunião', institution_id: m.institution_id, source: 'reuniao' as const, is_demo: m.is_demo })),
  ].filter((i) => matches(i.institution_id));
  return { items, loading: events.loading || meetings.loading, events };
}

function EventDialog({ open, onOpenChange, event, date, all }: { open: boolean; onOpenChange: (o: boolean) => void; event: AgendaEvent | null; date: string; all: Item[] }) {
  const toast = useToast();
  const { workday } = useSettings();
  const empty = (): Omit<AgendaEvent, 'id' | 'created_at' | 'updated_at'> => ({ title: '', date, start: '', end: '', kind: 'compromisso', institution_id: null, location: '', notes: '', external_synced: false });
  const { d, set, err, setErr } = useDraft(open, () => event ? { ...event } : empty(), [event, date]);
  const valid = d.date && d.start && d.end && toMin(d.end) > toMin(d.start);
  const conflicts = valid ? findConflicts({ id: event?.id ?? '_', date: d.date, start: d.start, end: d.end }, all) : [];
  async function save() {
    const e: Record<string, string> = {};
    if (!d.title.trim()) e.title = 'Informe o título.';
    if (!d.date) e.date = 'Informe a data.';
    if (!d.start || !d.end) e.time = 'Informe início e fim.'; else if (toMin(d.end) <= toMin(d.start)) e.time = 'O fim deve ser depois do início.';
    setErr(e); if (Object.keys(e).length) return;
    try { event ? await actions.update('agenda_events', event.id, d) : await actions.create('agenda_events', d); toast('Evento salvo na agenda interna.'); onOpenChange(false); }
    catch (er) { toast((er as Error).message, 'erro'); }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={event ? 'Editar evento' : 'Novo evento'} description="Agenda interna — nenhum evento é criado em calendários externos."
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={save}>Salvar</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField className="sm:col-span-2" label="Título" required value={d.title} onChange={(e) => set('title', e.target.value)} error={err.title} />
        <TextField label="Data" type="date" required value={d.date} onChange={(e) => set('date', e.target.value)} error={err.date} />
        <SelectField label="Tipo" value={d.kind} onChange={(e) => set('kind', e.target.value)} options={Object.entries(KINDS).map(([value, label]) => ({ value, label }))} />
        <TextField label="Início" type="time" required value={d.start} onChange={(e) => set('start', e.target.value)} error={err.time} />
        <TextField label="Fim" type="time" required value={d.end} onChange={(e) => set('end', e.target.value)} />
        <InstitutionSelect value={d.institution_id} onChange={(v) => set('institution_id', v)} />
        <TextField label="Local" value={d.location} onChange={(e) => set('location', e.target.value)} />
        <TextArea className="sm:col-span-2" label="Observações" value={d.notes} onChange={(e) => set('notes', e.target.value)} />
        {valid && hitsBreak(d.start, d.end, workday) && <p className="sm:col-span-2 text-xs text-orange">Atenção: este horário invade o intervalo ({workday.break_start}–{workday.break_end}).</p>}
        {valid && isWeekend(d.date) && <p className="sm:col-span-2 text-xs text-orange">Atenção: data fora do expediente (fim de semana).</p>}
        {conflicts.length > 0 && (
          <div role="alert" className="sm:col-span-2 rounded-lg border border-danger/50 bg-danger/5 p-3 text-sm">
            <p className="flex items-center gap-2 font-semibold text-danger"><AlertTriangle size={14} />Conflito com:</p>
            <ul className="list-disc pl-5 text-xs">{conflicts.map((c) => <li key={c.id}>{c.title} ({c.start}–{c.end})</li>)}</ul>
          </div>
        )}
      </div>
    </Dialog>
  );
}

function ItemChip({ i, conflict, onClick }: { i: Item; conflict: boolean; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={!onClick}
      className={cn('w-full rounded-md border px-2 py-1 text-left text-xs', conflict ? 'border-danger/60 bg-danger/10' : i.source === 'reuniao' ? 'border-orange/50 bg-orange/10' : 'border-gold-300/50 bg-gold-300/10', onClick && 'hover:brightness-125')}>
      <span className="font-mono">{i.tentative ? 'a conf.' : i.start}</span> {i.title}
    </button>
  );
}

export default function Agenda() {
  const now = useNow();
  const { settings } = useSettings();
  const { items, loading } = useAgendaItems();
  const [view, setView] = React.useState<'dia' | 'semana' | 'mes'>('semana');
  const [date, setDate] = React.useState(now.date);
  const [editing, setEditing] = React.useState<AgendaEvent | null>(null);
  const [creating, setCreating] = React.useState<string | null>(null);
  const { confirmDelete, confirmNode } = useConfirm();
  const conflicts = conflictingIds(items.filter((i) => !i.tentative));
  const onItem = (i: Item) => (i.ref ? () => setEditing(i.ref!) : undefined);
  const dayItems = (d: string) => items.filter((i) => i.date === d).sort((a, b) => a.start.localeCompare(b.start));
  const step = view === 'dia' ? 1 : 7;
  const focus = (d: string) => settings.weekly_focus[String(weekdayOf(d))];
  const totalConflicts = items.filter((i) => conflicts.has(i.id)).length;

  return (
    <div>
      <PageHeader title="Agenda Semanal" subtitle={view === 'mes' ? `${MONTHS[Number(date.slice(5, 7)) - 1]} de ${date.slice(0, 4)}` : view === 'semana' ? `Semana de ${fmtDate(weekDates(date)[0])}` : fmtLongDate(date)}
        actions={<><Segmented label="Visão" value={view} onChange={setView} options={[{ value: 'dia', label: 'Dia' }, { value: 'semana', label: 'Semana' }, { value: 'mes', label: 'Mês' }]} />
          <Button onClick={() => setCreating(date)}><Plus size={16} />Evento</Button></>} />
      <DateNav date={date} today={now.date} onChange={setDate}
        onPrev={() => setDate(view === 'mes' ? shiftMonth(date, -1) : addDays(date, -step))}
        onNext={() => setDate(view === 'mes' ? shiftMonth(date, 1) : addDays(date, step))}>
        {totalConflicts > 0 && <span className="chip border-danger/60 text-danger"><AlertTriangle size={12} />{totalConflicts} item(ns) em conflito</span>}
        <span className="ml-auto flex flex-wrap gap-2 text-xs text-muted">
          <span className="chip border-gold-300/50">Evento</span><span className="chip border-orange/50">Reunião</span>
        </span>
      </DateNav>

      {loading ? <Loading /> : view === 'dia' ? (
        <Card className="p-5">
          {focus(date) && <p className="mb-3 text-sm">Foco modelo: <strong className="text-gold">{focus(date)}</strong></p>}
          {dayItems(date).length === 0 ? <EmptyState title="Dia livre" description="Nenhum compromisso nesta data." action={<Button size="sm" onClick={() => setCreating(date)}><Plus size={14} />Evento</Button>} /> : (
            <ul className="space-y-2">
              {dayItems(date).map((i) => (
                <li key={i.id} className={cn('flex items-center gap-3 rounded-lg border p-3', conflicts.has(i.id) ? 'border-danger/60' : 'border-border')}>
                  <span className="w-28 font-mono text-sm">{i.tentative ? 'A confirmar' : `${i.start}–${i.end}`}</span>
                  <div className="min-w-0 flex-1"><div className="font-semibold">{i.title} {i.is_demo && <DemoBadge />}</div><div className="flex gap-1 text-xs text-muted">{i.kind} <InstitutionBadge id={i.institution_id} /></div></div>
                  {conflicts.has(i.id) && <span className="chip border-danger/60 text-danger">Conflito</span>}
                  {i.ref && <Button variant="ghost" size="icon" aria-label={`Excluir ${i.title}`} onClick={() => confirmDelete('Excluir evento', `“${i.title}”`, () => actions.remove('agenda_events', i.id))}><Trash2 size={15} /></Button>}
                  {i.ref && <Button variant="ghost" size="sm" onClick={() => setEditing(i.ref!)}>Editar</Button>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : view === 'semana' ? (
        <div className="relative -mx-4 overflow-x-auto px-4 pb-2">
          <div className="grid min-w-[980px] grid-cols-7 gap-2">
            {weekDates(date).map((d) => (
              <section key={d} className={cn('card flex min-h-[260px] flex-col p-2', d === now.date && 'border-gold-300', isWeekend(d) && 'opacity-70')} aria-label={fmtLongDate(d)}>
                <button type="button" onClick={() => { setDate(d); setView('dia'); }} className="mb-1 text-left">
                  <h2 className="font-sans text-sm font-semibold tracking-normal">{WEEKDAYS_SHORT[weekdayOf(d)]} {fmtDate(d).slice(0, 5)}</h2>
                  <p className="text-[11px] text-muted">{isWeekend(d) ? 'Sem expediente' : focus(d) ?? ''}</p>
                </button>
                <ul className="flex flex-1 flex-col gap-1">{dayItems(d).map((i) => <li key={i.id}><ItemChip i={i} conflict={conflicts.has(i.id)} onClick={onItem(i)} /></li>)}</ul>
                {!isWeekend(d) && <Button variant="ghost" size="sm" className="mt-1" onClick={() => setCreating(d)} aria-label={`Novo evento em ${fmtDate(d)}`}><Plus size={14} /></Button>}
              </section>
            ))}
          </div>
        </div>
      ) : (
        <div className="relative -mx-4 overflow-x-auto px-4">
          <div className="grid min-w-[700px] grid-cols-7 gap-1">
            {WEEKDAYS_SHORT.slice(1).concat('Dom').map((w) => <div key={w} className="p-1 text-center text-xs font-semibold uppercase text-muted">{w}</div>)}
            {monthGrid(date).map((d) => {
              const list = dayItems(d); const other = d.slice(0, 7) !== date.slice(0, 7);
              return (
                <button key={d} type="button" onClick={() => { setDate(d); setView('dia'); }}
                  className={cn('min-h-[86px] rounded-lg border p-1.5 text-left align-top', d === now.date ? 'border-gold-300' : 'border-border', other && 'opacity-40', 'bg-surface hover:bg-surface-2')}
                  aria-label={`${fmtLongDate(d)}: ${list.length} item(ns)`}>
                  <div className="text-xs font-semibold">{Number(d.slice(8))}</div>
                  {list.slice(0, 3).map((i) => <div key={i.id} className={cn('truncate text-[10px]', conflicts.has(i.id) ? 'text-danger' : 'text-muted')}>{i.tentative ? '•' : i.start} {i.title}</div>)}
                  {list.length > 3 && <div className="text-[10px] text-gold">+{list.length - 3}</div>}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <EventDialog open={creating !== null || !!editing} event={editing} date={creating ?? date} all={items} onOpenChange={(o) => { if (!o) { setCreating(null); setEditing(null); } }} />
      {confirmNode}
    </div>
  );
}
