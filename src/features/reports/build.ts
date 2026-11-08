import type { EntityMap, KeyResult, Objective, ReportEntry, ReportEntryKind, Task } from '@/domain/types';
import { isFromNotion, isPersonalNotion } from '@/integrations/notion/mapping';
import { krProgress, objectiveProgress } from '@/lib/okr';
import { addDays, fmtDate, fmtDuration, recifeParts, startOfWeek, toMin, weekDates } from '@/lib/time';
import { PRIORITY } from '@/domain/labels';

/** Linha para exportação (CSV/PDF), agrupada por seção. `value: null` = campo não preenchido (≠ zero). */
export type Row = { section: string; item: string; detail?: string; value?: number | string | null };

type Data = {
  tasks: EntityMap['tasks'][]; routine_blocks: EntityMap['routine_blocks'][]; notes: EntityMap['notes'][];
  report_entries: ReportEntry[]; objectives?: Objective[];
};
type Match = (id: string | null) => boolean;

const dateOfIso = (iso: string | null) => (iso ? recifeParts(new Date(iso)).date : null);
const isOpenTask = (t: Task) => t.status !== 'concluida' && t.status !== 'cancelada';
const byPriority = (a: Task, b: Task) => PRIORITY[a.priority].rank - PRIORITY[b.priority].rank || (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999');
/** Tarefas visíveis no escopo: pessoais do Notion entram em qualquer escopo (mesma regra do filtro global). */
const scopedTasks = (tasks: Task[], match: Match) => tasks.filter((t) => isPersonalNotion(t) || match(t.institution_id));
const entriesOf = (entries: ReportEntry[], kind: ReportEntryKind, inDates: (d: string) => boolean, match: Match) =>
  entries.filter((e) => e.kind === kind && inDates(e.date) && (!e.institution_id || match(e.institution_id)))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

export interface DailyReport {
  date: string;
  summary: {
    concluidas: number; central: number; notion: number; abertas: number; atrasadas: number;
    /** null = rotina não gerada no dia (não preenchido, diferente de zero) */
    rotinaConcluidaMin: number | null; rotinaPlanejadaMin: number | null; blocosSemStatus: number | null;
  };
  doneCentral: Task[]; doneNotion: Task[];
  conquistas: ReportEntry[];
  destaquesAuto: Task[]; destaquesManuais: ReportEntry[];
  pendenciasAuto: Task[]; pendenciasManuais: ReportEntry[];
  anotacao: ReportEntry | null;
  notasRapidas: EntityMap['notes'][];
}

export function buildDaily(date: string, data: Data, today: string, nowTime: string, match: Match): DailyReport {
  const tasks = scopedTasks(data.tasks, match);
  const done = tasks.filter((t) => t.status === 'concluida' && dateOfIso(t.completed_at) === date).sort(byPriority);
  const open = tasks.filter(isOpenTask);
  const tomorrow = addDays(date, 1);
  // Rotina é pessoal: não filtrada por instituição.
  const blocks = data.routine_blocks.filter((b) => b.date === date && !b.is_break);
  const generated = data.routine_blocks.some((b) => b.date === date);
  const elapsed = blocks.filter((b) => b.date < today || (b.date === today && toMin(b.end) <= toMin(nowTime)));
  const mins = (bs: typeof blocks) => bs.reduce((s, b) => s + toMin(b.end) - toMin(b.start), 0);
  const inDay = (d: string) => d === date;
  const anot = entriesOf(data.report_entries, 'anotacao', inDay, match);
  return {
    date,
    summary: {
      concluidas: done.length, central: done.filter((t) => !isFromNotion(t)).length, notion: done.filter(isFromNotion).length,
      abertas: open.length, atrasadas: open.filter((t) => t.due_date && t.due_date < (date < today ? date : today)).length,
      rotinaConcluidaMin: generated ? mins(blocks.filter((b) => b.status === 'concluido')) : null,
      rotinaPlanejadaMin: generated ? mins(blocks) : null,
      blocosSemStatus: generated ? elapsed.filter((b) => b.status === 'planejado' || b.status === 'em_andamento').length : null,
    },
    doneCentral: done.filter((t) => !isFromNotion(t)),
    doneNotion: done.filter(isFromNotion),
    conquistas: entriesOf(data.report_entries, 'conquista', inDay, match),
    // Destaque automático: concluída que estava na missão do dia ou com prioridade alta/urgente.
    destaquesAuto: done.filter((t) => (t.is_mission && t.mission_date === date) || t.priority === 'urgente' || t.priority === 'alta'),
    destaquesManuais: entriesOf(data.report_entries, 'destaque', inDay, match),
    // Pendências para amanhã: abertas vencidas ou que vencem até amanhã, mais missão do dia não concluída.
    pendenciasAuto: open.filter((t) => (t.due_date && t.due_date <= tomorrow) || (t.is_mission && t.mission_date === date)).sort(byPriority),
    pendenciasManuais: entriesOf(data.report_entries, 'pendencia', inDay, match),
    anotacao: anot.length ? anot[anot.length - 1] : null,
    notasRapidas: data.notes.filter((n) => n.date === date),
  };
}

export interface OkrLine { objective: Objective; progress: number | null; krs: { kr: KeyResult; progress: number | null }[] }
export interface WeeklyReport {
  start: string; end: string; nextMonday: string;
  summary: { concluidas: number; central: number; notion: number; conquistas: number; pendencias: number };
  principais: Task[]; conquistas: ReportEntry[]; okrs: OkrLine[];
  pendencias: Task[]; proximaSemana: Task[]; prioridades: ReportEntry[];
}

export function buildWeekly(date: string, data: Data, today: string, match: Match, matchItem?: (o: Objective) => boolean): WeeklyReport {
  const days = weekDates(date, 7); // seg–dom: conclusões no fim de semana também contam
  const start = days[0], end = days[6];
  const nextMonday = addDays(startOfWeek(date), 7);
  const nextEnd = addDays(nextMonday, 6);
  const inWeek = (d: string | null) => !!d && d >= start && d <= end;
  const tasks = scopedTasks(data.tasks, match);
  const done = tasks.filter((t) => t.status === 'concluida' && inWeek(dateOfIso(t.completed_at))).sort(byPriority);
  const open = tasks.filter(isOpenTask);
  const limit = end < today ? end : today;
  const pend = open.filter((t) => t.due_date && t.due_date <= end && (t.due_date < limit || inWeek(t.due_date))).sort(byPriority);
  const objectives = (data.objectives ?? []).filter((o) => (matchItem ? matchItem(o) : isPersonalNotion(o) || match(o.institution_id)));
  return {
    start, end, nextMonday,
    summary: {
      concluidas: done.length, central: done.filter((t) => !isFromNotion(t)).length, notion: done.filter(isFromNotion).length,
      conquistas: entriesOf(data.report_entries, 'conquista', (d) => inWeek(d), match).length, pendencias: pend.length,
    },
    principais: done.slice(0, 10),
    conquistas: entriesOf(data.report_entries, 'conquista', (d) => inWeek(d), match),
    okrs: objectives.map((o) => ({ objective: o, progress: objectiveProgress(o.key_results), krs: o.key_results.map((kr) => ({ kr, progress: krProgress(kr) })) }))
      .sort((a, b) => (b.progress ?? -1) - (a.progress ?? -1)),
    pendencias: pend,
    proximaSemana: open.filter((t) => t.due_date && t.due_date >= nextMonday && t.due_date <= nextEnd).sort(byPriority),
    prioridades: entriesOf(data.report_entries, 'prioridade', (d) => d === nextMonday, match),
  };
}

const origem = (t: Task) => (isFromNotion(t) ? 'Notion' : 'Central');
const taskDetail = (t: Task) => [origem(t), t.due_date ? `prazo ${fmtDate(t.due_date)}` : null, PRIORITY[t.priority].label].filter(Boolean).join(' · ');
const durOrNull = (m: number | null) => (m == null ? null : fmtDuration(m));

export function dailyRows(r: DailyReport): Row[] {
  const rows: Row[] = [];
  const s = r.summary;
  rows.push({ section: 'Resumo do dia', item: 'Tarefas concluídas', value: s.concluidas, detail: `Central ${s.central} · Notion ${s.notion}` });
  rows.push({ section: 'Resumo do dia', item: 'Tarefas abertas', value: s.abertas });
  rows.push({ section: 'Resumo do dia', item: 'Atrasadas', value: s.atrasadas });
  rows.push({ section: 'Resumo do dia', item: 'Rotina concluída', value: durOrNull(s.rotinaConcluidaMin), detail: s.rotinaPlanejadaMin == null ? 'Rotina não gerada' : `de ${fmtDuration(s.rotinaPlanejadaMin)} planejadas` });
  rows.push({ section: 'Resumo do dia', item: 'Blocos encerrados sem status', value: s.blocosSemStatus });
  r.doneCentral.forEach((t) => rows.push({ section: 'Concluídas — Central', item: t.title, detail: taskDetail(t) }));
  r.doneNotion.forEach((t) => rows.push({ section: 'Concluídas — Notion', item: t.title, detail: taskDetail(t) }));
  r.conquistas.forEach((e) => rows.push({ section: 'Conquistas do dia', item: e.text }));
  r.destaquesAuto.forEach((t) => rows.push({ section: 'Destaques', item: t.title, detail: `Automático · ${taskDetail(t)}` }));
  r.destaquesManuais.forEach((e) => rows.push({ section: 'Destaques', item: e.text, detail: 'Registrado manualmente' }));
  r.pendenciasAuto.forEach((t) => rows.push({ section: 'Pendências para amanhã', item: t.title, detail: taskDetail(t) }));
  r.pendenciasManuais.forEach((e) => rows.push({ section: 'Pendências para amanhã', item: e.text, detail: 'Registrado manualmente' }));
  rows.push({ section: 'Anotação final', item: 'Anotação', value: r.anotacao?.text ?? null });
  return rows;
}

export function weeklyRows(r: WeeklyReport): Row[] {
  const rows: Row[] = [];
  const s = r.summary;
  rows.push({ section: 'Resumo da semana', item: 'Tarefas concluídas', value: s.concluidas, detail: `Central ${s.central} · Notion ${s.notion}` });
  rows.push({ section: 'Resumo da semana', item: 'Conquistas registradas', value: s.conquistas });
  rows.push({ section: 'Resumo da semana', item: 'Pendências', value: s.pendencias });
  r.principais.forEach((t) => rows.push({ section: 'Principais tarefas concluídas', item: t.title, detail: taskDetail(t) }));
  r.conquistas.forEach((e) => rows.push({ section: 'Conquistas', item: e.text, detail: fmtDate(e.date) }));
  r.okrs.forEach((o) => {
    rows.push({ section: 'Evolução de OKRs', item: o.objective.title, value: o.progress == null ? null : `${o.progress}%`, detail: o.objective.cycle });
    o.krs.forEach(({ kr, progress }) => rows.push({ section: 'Evolução de OKRs', item: `↳ ${kr.title}`, value: progress == null ? (kr.notion_progress != null ? `${kr.notion_progress}% (Notion)` : null) : `${progress}%` }));
  });
  r.pendencias.forEach((t) => rows.push({ section: 'Pendências', item: t.title, detail: taskDetail(t) }));
  r.prioridades.forEach((e) => rows.push({ section: 'Prioridades da próxima semana', item: e.text, detail: 'Definida manualmente' }));
  r.proximaSemana.forEach((t) => rows.push({ section: 'Prioridades da próxima semana', item: t.title, detail: `Vence na próxima semana · ${taskDetail(t)}` }));
  return rows;
}

export function weeklySeries(date: string, blocks: EntityMap['routine_blocks'][]) {
  return weekDates(date, 5).map((d) => {
    const bs = blocks.filter((b) => b.date === d && !b.is_break);
    const done = bs.filter((b) => b.status === 'concluido').reduce((s, b) => s + toMin(b.end) - toMin(b.start), 0);
    return { date: d, label: fmtDate(d).slice(0, 5), hours: bs.length ? Math.round((done / 60) * 10) / 10 : null };
  });
}

export const displayValue = (v: Row['value']) => (v === undefined ? '' : v == null ? 'Não preenchido' : String(v));

/** Evita injeção de fórmula ao abrir no Excel/Sheets (célula começando com = + - @ tab ou CR). */
export const csvSafe = (s: string) => (/^[=+\-@\t\r]/.test(s) ? `'${s}` : s);

export function toCSV(rows: Row[], title: string): string {
  const esc = (s: string) => `"${csvSafe(s).replace(/"/g, '""')}"`;
  const lines = [[title], ['Seção', 'Item', 'Valor', 'Detalhe'], ...rows.map((r) => [r.section, r.item, displayValue(r.value), r.detail ?? ''])];
  return '﻿' + lines.map((l) => l.map((c) => esc(String(c))).join(';')).join('\r\n');
}

export function download(name: string, content: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** PDF organizado: uma tabela por seção, com título da seção. Seções vazias aparecem como "Nada registrado". */
export async function toPDF(rows: Row[], title: string, subtitle: string, fileName: string, sectionOrder: string[]) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(20); doc.text(title.toUpperCase(), 40, 50);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(90); doc.text(subtitle, 40, 68);
  let y = 92;
  for (const section of sectionOrder) {
    const rs = rows.filter((r) => r.section === section);
    if (y > doc.internal.pageSize.getHeight() - 80) { doc.addPage(); y = 50; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(140, 107, 46); doc.text(section, 40, y);
    autoTable(doc, {
      startY: y + 6, head: [['Item', 'Valor', 'Detalhe']],
      body: rs.length ? rs.map((r) => [r.item, displayValue(r.value), r.detail ?? '']) : [['Nada registrado', '', '']],
      headStyles: { fillColor: [36, 36, 41], textColor: [243, 239, 230] }, styles: { fontSize: 9, cellPadding: 4 },
      columnStyles: { 0: { cellWidth: 250 }, 1: { cellWidth: 90 } }, margin: { left: 40, right: 40 },
      didParseCell: (h) => { if (h.section === 'body' && h.column.index === 1 && h.cell.raw === 'Não preenchido') h.cell.styles.textColor = [178, 88, 10]; },
    });
    y = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY) + 24;
  }
  doc.setFontSize(8); doc.setTextColor(120);
  doc.text('“Não preenchido” indica ausência de registro — não equivale a zero.', 40, doc.internal.pageSize.getHeight() - 30);
  doc.save(fileName);
}

export const DAILY_SECTIONS = ['Resumo do dia', 'Concluídas — Central', 'Concluídas — Notion', 'Conquistas do dia', 'Destaques', 'Pendências para amanhã', 'Anotação final'];
export const WEEKLY_SECTIONS = ['Resumo da semana', 'Principais tarefas concluídas', 'Conquistas', 'Evolução de OKRs', 'Pendências', 'Prioridades da próxima semana'];
