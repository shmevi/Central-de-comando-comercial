import { toMin, isWeekend } from './time';

export interface Workday { start: string; end: string; break_start: string; break_end: string }
export const DEFAULT_WORKDAY: Workday = { start: '12:12', end: '22:00', break_start: '18:00', break_end: '19:00' };

/** Minutos efetivos de trabalho (descontando intervalo). 12h12–22h − 1h = 528 min (8h48). */
export function effectiveMinutes(w: Workday = DEFAULT_WORKDAY): number {
  return toMin(w.end) - toMin(w.start) - (toMin(w.break_end) - toMin(w.break_start));
}

export type WorkdayStatus = 'sem_expediente' | 'antes' | 'em_expediente' | 'intervalo' | 'encerrado';

export function workdayStatus(date: string, time: string, w: Workday = DEFAULT_WORKDAY): WorkdayStatus {
  if (isWeekend(date)) return 'sem_expediente';
  const t = toMin(time);
  if (t < toMin(w.start)) return 'antes';
  if (t >= toMin(w.end)) return 'encerrado';
  if (t >= toMin(w.break_start) && t < toMin(w.break_end)) return 'intervalo';
  return 'em_expediente';
}

/** Minutos trabalhados até `time` (exclui intervalo). */
export function workedMinutes(date: string, time: string, w: Workday = DEFAULT_WORKDAY): number {
  if (isWeekend(date)) return 0;
  const t = Math.min(toMin(time), toMin(w.end));
  const s = toMin(w.start);
  if (t <= s) return 0;
  let worked = t - s;
  const bs = toMin(w.break_start), be = toMin(w.break_end);
  if (t > bs) worked -= Math.min(t, be) - bs;
  return Math.max(0, worked);
}

export const STATUS_LABEL: Record<WorkdayStatus, string> = {
  sem_expediente: 'Sem expediente hoje',
  antes: 'Expediente ainda não começou',
  em_expediente: 'Em expediente',
  intervalo: 'Intervalo',
  encerrado: 'Expediente encerrado',
};

/** Verifica se um intervalo de horário invade o intervalo de descanso. */
export function hitsBreak(start: string, end: string, w: Workday = DEFAULT_WORKDAY): boolean {
  return toMin(start) < toMin(w.break_end) && toMin(w.break_start) < toMin(end);
}

/** Valida a jornada: início < início do intervalo < fim do intervalo < fim. Retorna a mensagem de erro ou null. */
export function validateWorkday(w: Workday): string | null {
  const re = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (![w.start, w.end, w.break_start, w.break_end].every((t) => re.test(t))) return 'Preencha todos os horários (HH:mm).';
  if (!(toMin(w.start) < toMin(w.break_start) && toMin(w.break_start) < toMin(w.break_end) && toMin(w.break_end) < toMin(w.end)))
    return 'A ordem deve ser: início < início do intervalo < fim do intervalo < fim.';
  return null;
}
