import * as React from 'react';
import { AlertTriangle, CalendarClock, CheckCircle2, FileDown, FileSpreadsheet, ListTodo, NotebookPen, Plus, Sparkles, Star, Target, Timer, Trash2, Trophy } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useCollection } from '@/data/store';
import { useNow, useInstitutions } from '@/app/hooks';
import { useScope } from '@/app/scope';
import { PageHeader, Segmented, Loading, Card, CardHeader, Stat, NotionBadge, Progress } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { DateNav } from '@/components/ui/date-nav';
import { addDays, fmtDate, fmtDuration, fmtLongDate } from '@/lib/time';
import {
  buildDaily, buildWeekly, dailyRows, weeklyRows, download, toCSV, toPDF, weeklySeries, DAILY_SECTIONS, WEEKLY_SECTIONS,
} from '@/features/reports/build';
import { isFromNotion } from '@/integrations/notion/mapping';
import type { ReportEntry, ReportEntryKind, Task } from '@/domain/types';
import { cn } from '@/lib/utils';

/** Lista curta de tarefas (com origem Central/Notion). */
function TaskList({ tasks, empty }: { tasks: Task[]; empty: string }) {
  if (!tasks.length) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="space-y-1.5 text-sm">
      {tasks.map((t) => (
        <li key={t.id} className="panel flex flex-wrap items-center gap-2 px-3 py-2">
          <span className="min-w-0 flex-1 break-words">{t.title}</span>
          {isFromNotion(t) ? <NotionBadge /> : <span className="chip border-border/80 text-muted">Central</span>}
          {t.due_date && <span className="chip border-border/80 text-muted"><CalendarClock size={11} aria-hidden />{fmtDate(t.due_date)}</span>}
        </li>
      ))}
    </ul>
  );
}

/** Entradas manuais (conquistas, destaques, pendências, prioridades), gravadas em report_entries. */
function EntryList({ entries, kind, date, label, placeholder, readOnlyDates }: {
  entries: ReportEntry[]; kind: ReportEntryKind; date: string; label: string; placeholder: string; readOnlyDates?: boolean;
}) {
  const col = useCollection('report_entries');
  const toast = useToast();
  const [text, setText] = React.useState('');
  const id = `entrada-${kind}`;
  async function add(e: React.FormEvent) {
    e.preventDefault();
    const v = text.trim(); if (!v) return;
    try { await col.create({ date, kind, text: v, institution_id: null }); setText(''); toast('Registrado.'); } catch (er) { toast((er as Error).message, 'erro'); }
  }
  return (
    <div className="space-y-2">
      {entries.length > 0 && (
        <ul className="space-y-1.5 text-sm">
          {entries.map((en) => (
            <li key={en.id} className="panel flex items-start gap-2 px-3 py-2">
              <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{en.text}</span>
              {readOnlyDates && <span className="text-xs text-muted">{fmtDate(en.date)}</span>}
              <button type="button" className="text-muted hover:text-danger" aria-label={`Excluir: ${en.text}`} onClick={() => col.remove(en.id).catch((er) => toast(er.message, 'erro'))}><Trash2 size={14} /></button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="flex gap-2">
        <label htmlFor={id} className="sr-only">{label}</label>
        <input id={id} className="field" value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} maxLength={4000} />
        <Button type="submit" variant="secondary" size="icon" className="h-10 w-10 shrink-0" aria-label={label}><Plus size={16} /></Button>
      </form>
    </div>
  );
}

/** Anotação final do dia: um texto por dia (cria, atualiza ou apaga se ficar vazio). */
function FinalNote({ date, current }: { date: string; current: ReportEntry | null }) {
  const col = useCollection('report_entries');
  const toast = useToast();
  const [text, setText] = React.useState(current?.text ?? '');
  React.useEffect(() => { setText(current?.text ?? ''); }, [current?.id, current?.text, date]);
  const dirty = text.trim() !== (current?.text ?? '');
  async function save() {
    const v = text.trim();
    try {
      if (current && !v) await col.remove(current.id);
      else if (current) await col.update(current.id, { text: v });
      else if (v) await col.create({ date, kind: 'anotacao', text: v, institution_id: null });
      toast('Anotação final salva.');
    } catch (er) { toast((er as Error).message, 'erro'); }
  }
  return (
    <div className="space-y-2">
      <label htmlFor="anotacao-final" className="sr-only">Anotação final do dia</label>
      <textarea id="anotacao-final" className="field min-h-[96px]" value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} placeholder="Como foi o dia? Aprendizados, contexto para amanhã…" />
      <div className="flex justify-end"><Button size="sm" variant="secondary" disabled={!dirty} onClick={save}>Salvar anotação</Button></div>
    </div>
  );
}

function Section({ title, icon, children, subtitle, className }: { title: string; icon: React.ReactNode; children: React.ReactNode; subtitle?: string; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader title={title} icon={icon} subtitle={subtitle} />
      <div className="p-5 pt-4">{children}</div>
    </Card>
  );
}

function RoutineChart({ date, blocks }: { date: string; blocks: Parameters<typeof weeklySeries>[1] }) {
  const series = weeklySeries(date, blocks);
  return (
    <Section title="Horas de rotina concluídas" icon={<Timer size={16} />} subtitle="Dias sem rotina gerada aparecem como “não preenchido”">
      <div className="h-48" role="img" aria-label={`Horas concluídas por dia: ${series.map((s) => `${s.label} ${s.hours ?? 'não preenchido'}`).join(', ')}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={series} margin={{ top: 8, right: 4, left: -20, bottom: 0 }} barCategoryGap="30%">
            <CartesianGrid vertical={false} stroke="rgb(var(--border))" strokeDasharray="0" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: 'rgb(var(--muted))', fontSize: 12 }} />
            <YAxis tickLine={false} axisLine={false} tick={{ fill: 'rgb(var(--muted))', fontSize: 12 }} allowDecimals={false} domain={[0, 9]} />
            <Tooltip cursor={{ fill: 'rgb(var(--surface-2))' }} contentStyle={{ background: 'rgb(var(--surface-2))', border: '1px solid rgb(var(--border))', borderRadius: 10, color: 'rgb(var(--fg))', fontSize: 12 }}
              formatter={(v: unknown) => [v == null ? 'Não preenchido' : `${String(v).replace('.', ',')} h`, 'Concluído']} labelFormatter={(l) => `Dia ${l}`} />
            <Bar dataKey="hours" fill="rgb(var(--chart-1))" radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="mt-3 w-full text-xs">
        <caption className="sr-only">Tabela de horas concluídas</caption>
        <thead><tr className="text-muted"><th className="text-left font-normal">Dia</th><th className="text-right font-normal">Horas</th></tr></thead>
        <tbody>{series.map((s) => <tr key={s.date}><td>{s.label}</td><td className={cn('text-right tabular-nums', s.hours == null && 'italic text-orange')}>{s.hours == null ? 'Não preenchido' : `${String(s.hours).replace('.', ',')} h`}</td></tr>)}</tbody>
      </table>
    </Section>
  );
}

export default function Relatorios() {
  const now = useNow();
  const { matches, matchesItem, scope } = useScope();
  const { byId } = useInstitutions();
  const toast = useToast();
  const [kind, setKind] = React.useState<'diario' | 'semanal'>('diario');
  const [date, setDate] = React.useState(now.date);
  const tasks = useCollection('tasks'); const routine = useCollection('routine_blocks'); const notes = useCollection('notes');
  const entries = useCollection('report_entries'); const objectives = useCollection('objectives');
  const loading = [tasks, routine, notes, entries, objectives].some((c) => !c.loaded);
  const data = { tasks: tasks.items, routine_blocks: routine.items, notes: notes.items, report_entries: entries.error ? [] : entries.items, objectives: objectives.items };
  const match = (id: string | null) => matches(id);
  const daily = loading ? null : buildDaily(date, data, now.date, now.time, match);
  const weekly = loading ? null : buildWeekly(date, data, now.date, match, (o) => matchesItem(o));
  const rows = kind === 'diario' ? (daily ? dailyRows(daily) : []) : (weekly ? weeklyRows(weekly) : []);
  const scopeLabel = scope === 'all' ? 'Todas as instituições' : scope === 'none' ? 'Sem instituição' : byId[scope]?.name ?? '';
  const period = kind === 'diario' ? fmtDate(date) : weekly ? `${fmtDate(weekly.start)} a ${fmtDate(weekly.end)}` : '';
  const title = `Relatório ${kind === 'diario' ? 'diário' : 'semanal'} — Central de Comando Comercial`;
  const fileBase = `relatorio-${kind}-${kind === 'diario' ? date : weekly?.start ?? date}`;
  // Conquistas da semana são registradas no dia selecionado (sem passar de hoje).
  const weeklyEntryDate = weekly ? (now.date < weekly.end ? (now.date > weekly.start ? now.date : weekly.start) : weekly.end) : date;

  return (
    <div>
      <PageHeader title="Relatórios" eyebrow="Estratégia" subtitle={`${period} · ${scopeLabel}`}
        actions={<>
          <Segmented label="Tipo" value={kind} onChange={setKind} options={[{ value: 'diario', label: 'Diário' }, { value: 'semanal', label: 'Semanal' }]} />
          <Button variant="secondary" disabled={loading} onClick={() => { download(`${fileBase}.csv`, toCSV(rows, `${title} · ${period} · ${scopeLabel}`), 'text/csv;charset=utf-8'); toast('CSV exportado.'); }}><FileSpreadsheet size={16} />CSV</Button>
          <Button disabled={loading} onClick={() => toPDF(rows, title, `${period} · ${scopeLabel} · gerado em ${fmtDate(now.date)} ${now.time}`, `${fileBase}.pdf`, kind === 'diario' ? DAILY_SECTIONS : WEEKLY_SECTIONS).then(() => toast('PDF exportado.')).catch((e) => toast(e.message, 'erro'))}><FileDown size={16} />PDF</Button>
        </>} />
      <DateNav date={date} today={now.date} onChange={setDate} onPrev={() => setDate(addDays(date, kind === 'diario' ? -1 : -7))} onNext={() => setDate(addDays(date, kind === 'diario' ? 1 : 7))}>
        <span className="text-xs text-muted">{kind === 'diario' && fmtLongDate(date)}</span>
      </DateNav>
      {entries.error && (
        <p role="alert" className="mb-5 flex items-start gap-2 rounded-xl border border-orange/30 bg-orange/5 p-3 text-xs">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-orange" />
          <span>Conquistas, destaques e anotações manuais indisponíveis: {entries.error}</span>
        </p>
      )}

      {loading || !daily || !weekly ? <Loading /> : kind === 'diario' ? (
        <div className="space-y-6">
          <section aria-label="Resumo do dia" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Tarefas concluídas" value={daily.summary.concluidas} icon={<CheckCircle2 size={16} />} tone={daily.summary.concluidas ? 'success' : 'neutral'} hint={`Central ${daily.summary.central} · Notion ${daily.summary.notion}`} />
            <Stat label="Abertas" value={daily.summary.abertas} icon={<ListTodo size={16} />} />
            <Stat label="Atrasadas" value={daily.summary.atrasadas} icon={<AlertTriangle size={16} />} tone={daily.summary.atrasadas ? 'danger' : 'neutral'} />
            <Stat label="Rotina concluída" value={daily.summary.rotinaConcluidaMin == null ? <span className="text-base font-medium italic text-orange">Não preenchido</span> : fmtDuration(daily.summary.rotinaConcluidaMin)}
              icon={<Timer size={16} />} hint={daily.summary.rotinaPlanejadaMin == null ? 'Rotina não gerada' : `de ${fmtDuration(daily.summary.rotinaPlanejadaMin)} planejadas`} />
          </section>
          <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
            <Section title="Concluídas — Central" icon={<CheckCircle2 size={16} />} subtitle="Rotina e tarefas criadas na Central">
              <TaskList tasks={daily.doneCentral} empty="Nenhuma tarefa da Central concluída neste dia." />
            </Section>
            <Section title="Concluídas — Notion" icon={<CheckCircle2 size={16} />} subtitle="Tarefas sincronizadas do Notion">
              <TaskList tasks={daily.doneNotion} empty="Nenhuma tarefa do Notion concluída neste dia." />
            </Section>
            <Section title="Conquistas do dia" icon={<Trophy size={16} />} subtitle="Registre resultados que merecem ficar no histórico">
              <EntryList entries={daily.conquistas} kind="conquista" date={date} label="Registrar conquista" placeholder="Ex.: 5 matrículas fechadas na UNICIVE" />
            </Section>
            <Section title="Destaques" icon={<Star size={16} />} subtitle="Automáticos: missão do dia e prioridade alta/urgente concluídas">
              <TaskList tasks={daily.destaquesAuto} empty="Nenhum destaque automático." />
              <div className="mt-3"><EntryList entries={daily.destaquesManuais} kind="destaque" date={date} label="Registrar destaque" placeholder="Outro destaque do dia…" /></div>
            </Section>
            <Section title="Pendências para amanhã" icon={<CalendarClock size={16} />} subtitle="Atrasadas, que vencem até amanhã e missão não concluída">
              <TaskList tasks={daily.pendenciasAuto} empty="Nada pendente para amanhã." />
              <div className="mt-3"><EntryList entries={daily.pendenciasManuais} kind="pendencia" date={date} label="Registrar pendência" placeholder="Outra pendência para amanhã…" /></div>
            </Section>
            <Section title="Anotação final" icon={<NotebookPen size={16} />} subtitle={daily.notasRapidas.length ? `${daily.notasRapidas.length} anotação(ões) rápida(s) neste dia` : undefined}>
              <FinalNote date={date} current={daily.anotacao} />
            </Section>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <section aria-label="Resumo da semana" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Tarefas concluídas" value={weekly.summary.concluidas} icon={<CheckCircle2 size={16} />} tone={weekly.summary.concluidas ? 'success' : 'neutral'} hint={`Central ${weekly.summary.central} · Notion ${weekly.summary.notion}`} />
            <Stat label="Conquistas" value={weekly.summary.conquistas} icon={<Trophy size={16} />} tone={weekly.summary.conquistas ? 'gold' : 'neutral'} />
            <Stat label="Pendências" value={weekly.summary.pendencias} icon={<AlertTriangle size={16} />} tone={weekly.summary.pendencias ? 'orange' : 'neutral'} />
            <Stat label="OKRs acompanhados" value={weekly.okrs.length} icon={<Target size={16} />} />
          </section>
          <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
            <Section title="Principais tarefas concluídas" icon={<CheckCircle2 size={16} />} subtitle="Até 10, por prioridade">
              <TaskList tasks={weekly.principais} empty="Nenhuma tarefa concluída nesta semana." />
            </Section>
            <Section title="Conquistas" icon={<Trophy size={16} />} subtitle={`Novas entradas são registradas em ${fmtDate(weeklyEntryDate)}`}>
              <EntryList entries={weekly.conquistas} kind="conquista" date={weeklyEntryDate} label="Registrar conquista da semana" placeholder="Conquista da semana…" readOnlyDates />
            </Section>
            <Section title="Evolução de OKRs" icon={<Target size={16} />} subtitle="Progresso atual — só com meta válida">
              {weekly.okrs.length === 0 ? <p className="text-sm text-muted">Nenhum OKR no filtro atual.</p> : (
                <ul className="space-y-4">
                  {weekly.okrs.map(({ objective, progress, krs }) => (
                    <li key={objective.id}>
                      <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                        <span className="min-w-0 truncate font-medium">{objective.title}</span>
                        <span className={cn('shrink-0 text-xs tabular-nums', progress == null ? 'italic text-orange' : 'text-gold')}>{progress == null ? 'Sem meta válida' : `${progress}%`}</span>
                      </div>
                      {progress != null && <Progress value={progress} label={`Progresso de ${objective.title}`} />}
                      {krs.length > 0 && (
                        <ul className="mt-2 space-y-1 border-l border-border pl-3 text-xs text-muted">
                          {krs.map(({ kr, progress: p }) => (
                            <li key={kr.id} className="flex justify-between gap-2"><span className="min-w-0 truncate">{kr.title}</span>
                              <span className="shrink-0 tabular-nums">{p != null ? `${p}%` : kr.notion_progress != null ? `${kr.notion_progress}% (Notion)` : '—'}</span></li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Section>
            <Section title="Pendências" icon={<AlertTriangle size={16} />} subtitle="Abertas, atrasadas ou com prazo nesta semana">
              <TaskList tasks={weekly.pendencias} empty="Nenhuma pendência." />
            </Section>
            <Section title="Prioridades da próxima semana" icon={<Sparkles size={16} />} subtitle={`Semana de ${fmtDate(weekly.nextMonday)}`}>
              <EntryList entries={weekly.prioridades} kind="prioridade" date={weekly.nextMonday} label="Registrar prioridade da próxima semana" placeholder="Prioridade para a próxima semana…" />
              {weekly.proximaSemana.length > 0 && <div className="mt-4"><p className="eyebrow mb-2">Já com prazo na próxima semana</p><TaskList tasks={weekly.proximaSemana} empty="" /></div>}
            </Section>
            <RoutineChart date={date} blocks={routine.items} />
          </div>
        </div>
      )}
    </div>
  );
}
