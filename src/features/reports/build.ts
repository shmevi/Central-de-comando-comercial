import type { EntityMap } from '@/domain/types';
import { recifeParts, toMin, weekDates, fmtDate, fmtDuration } from '@/lib/time';

export type Row = { section: string; indicator: string; value: number | string | null; note?: string };
type Data = { [K in 'tasks' | 'routine_blocks' | 'interviews' | 'feedbacks' | 'meetings' | 'notes']: EntityMap[K][] };

const dateOfIso = (iso: string | null) => (iso ? recifeParts(new Date(iso)).date : null);

/** Monta as linhas do relatório. `null` = campo não preenchido (diferente de zero). */
export function buildReport(dates: string[], data: Data, today: string, nowTime: string, match: (id: string | null) => boolean): Row[] {
  const inRange = (d: string | null) => !!d && dates.includes(d);
  const rows: Row[] = [];
  const past = dates.filter((d) => d <= today);

  const blocks = data.routine_blocks.filter((b) => inRange(b.date) && !b.is_break && match(b.institution_id));
  const generated = dates.filter((d) => data.routine_blocks.some((b) => b.date === d));
  const elapsed = blocks.filter((b) => b.date < today || (b.date === today && toMin(b.end) <= toMin(nowTime)));
  const unfilled = elapsed.filter((b) => b.status === 'planejado' || b.status === 'em_andamento');
  const doneMin = blocks.filter((b) => b.status === 'concluido').reduce((s, b) => s + toMin(b.end) - toMin(b.start), 0);
  rows.push({ section: 'Rotina', indicator: 'Blocos planejados', value: generated.length ? blocks.length : null, note: generated.length ? undefined : 'Rotina não gerada no período' });
  rows.push({ section: 'Rotina', indicator: 'Blocos concluídos', value: generated.length ? blocks.filter((b) => b.status === 'concluido').length : null });
  rows.push({ section: 'Rotina', indicator: 'Blocos adiados', value: generated.length ? blocks.filter((b) => b.status === 'adiado').length : null });
  rows.push({ section: 'Rotina', indicator: 'Tempo concluído', value: generated.length ? fmtDuration(doneMin) : null });
  rows.push({ section: 'Rotina', indicator: 'Blocos encerrados sem status registrado', value: generated.length ? unfilled.length : null, note: unfilled.length ? 'Status não preenchido — não contar como realizado' : undefined });

  const tasks = data.tasks.filter((t) => match(t.institution_id));
  rows.push({ section: 'Tarefas', indicator: 'Tarefas concluídas', value: tasks.filter((t) => t.status === 'concluida' && inRange(dateOfIso(t.completed_at))).length });
  rows.push({ section: 'Tarefas', indicator: 'Tarefas criadas', value: tasks.filter((t) => inRange(dateOfIso(t.created_at))).length });
  const lastDay = dates[dates.length - 1];
  rows.push({ section: 'Tarefas', indicator: 'Abertas com prazo vencido (fim do período)', value: tasks.filter((t) => !['concluida', 'cancelada'].includes(t.status) && t.due_date && t.due_date < (lastDay < today ? lastDay : today)).length });
  rows.push({ section: 'Tarefas', indicator: 'Tarefas sem instituição', value: tasks.filter((t) => !t.institution_id && !['concluida', 'cancelada'].includes(t.status)).length, note: 'Classifique para não misturar dados' });

  const ivs = data.interviews.filter((i) => inRange(i.date) && match(i.institution_id));
  const ivPast = ivs.filter((i) => past.includes(i.date));
  rows.push({ section: 'Recrutamento', indicator: 'Entrevistas no período', value: ivs.length });
  rows.push({ section: 'Recrutamento', indicator: 'Compareceram', value: ivPast.length ? ivPast.filter((i) => i.attendance === 'compareceu').length : null });
  rows.push({ section: 'Recrutamento', indicator: 'Faltaram', value: ivPast.length ? ivPast.filter((i) => i.attendance === 'faltou').length : null });
  const noReg = ivPast.filter((i) => ['pendente', 'confirmada'].includes(i.attendance)).length;
  rows.push({ section: 'Recrutamento', indicator: 'Presença não registrada', value: ivPast.length ? noReg : null, note: noReg ? 'Campo não preenchido' : undefined });
  rows.push({ section: 'Recrutamento', indicator: 'Decisões registradas', value: ivPast.length ? ivPast.filter((i) => i.decision !== 'pendente').length : null });

  rows.push({ section: 'Equipe', indicator: 'Feedbacks registrados', value: data.feedbacks.filter((f) => inRange(f.date) && match(f.institution_id)).length });
  const ms = data.meetings.filter((m) => inRange(m.date) && match(m.institution_id));
  rows.push({ section: 'Reuniões', indicator: 'Reuniões', value: ms.length });
  const msPast = ms.filter((m) => m.date <= today);
  rows.push({ section: 'Reuniões', indicator: 'Reuniões sem decisões/ata registradas', value: msPast.length ? msPast.filter((m) => !m.decisions.trim() && !m.minutes.trim()).length : null });
  rows.push({ section: 'Reuniões', indicator: 'Encaminhamentos abertos', value: ms.reduce((s, m) => s + m.actions.filter((a) => !a.done).length, 0) });
  rows.push({ section: 'Anotações', indicator: 'Anotações do período', value: data.notes.filter((n) => inRange(n.date)).length });
  return rows;
}

export function weeklySeries(date: string, blocks: EntityMap['routine_blocks'][]) {
  return weekDates(date, 5).map((d) => {
    const bs = blocks.filter((b) => b.date === d && !b.is_break);
    const done = bs.filter((b) => b.status === 'concluido').reduce((s, b) => s + toMin(b.end) - toMin(b.start), 0);
    return { date: d, label: fmtDate(d).slice(0, 5), hours: bs.length ? Math.round((done / 60) * 10) / 10 : null };
  });
}

export const displayValue = (v: Row['value']) => (v == null ? 'Não preenchido' : String(v));

export function toCSV(rows: Row[], title: string): string {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const lines = [[title], ['Seção', 'Indicador', 'Valor', 'Observação'], ...rows.map((r) => [r.section, r.indicator, displayValue(r.value), r.note ?? ''])];
  return '﻿' + lines.map((l) => l.map((c) => esc(String(c))).join(';')).join('\r\n');
}

export function download(name: string, content: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function toPDF(rows: Row[], title: string, subtitle: string, fileName: string) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text(title.toUpperCase(), 40, 50);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(90); doc.text(subtitle, 40, 68);
  autoTable(doc, {
    startY: 84, head: [['Seção', 'Indicador', 'Valor', 'Observação']],
    body: rows.map((r) => [r.section, r.indicator, displayValue(r.value), r.note ?? '']),
    headStyles: { fillColor: [140, 107, 46], textColor: [255, 255, 255] }, styles: { fontSize: 9 },
    didParseCell: (h) => { if (h.section === 'body' && h.column.index === 2 && h.cell.raw === 'Não preenchido') h.cell.styles.textColor = [178, 88, 10]; },
  });
  doc.setFontSize(8); doc.setTextColor(120);
  doc.text('“Não preenchido” indica ausência de registro — não equivale a zero.', 40, doc.internal.pageSize.getHeight() - 30);
  doc.save(fileName);
}
