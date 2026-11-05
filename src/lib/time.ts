/** Utilitários de data/hora no fuso America/Recife (UTC-3, sem horário de verão). */
export const TZ = 'America/Recife';

/** Partes da data/hora atual em Recife. */
export function recifeParts(d: Date = new Date()) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short',
  });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
  const hour = p.hour === '24' ? '00' : p.hour;
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${hour}:${p.minute}`, weekday: wd };
}

export const todayISO = () => recifeParts().date;

export function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}
export function fromMin(min: number): string {
  const h = Math.floor(min / 60), m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
export function fmtDuration(min: number): string {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return `${h}h${String(m).padStart(2, '0')}`;
}

/** yyyy-mm-dd → dd/mm/aaaa */
export function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
/** dd/mm/aaaa → yyyy-mm-dd (ou null se inválido) */
export function parseBRDate(br: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(br.trim());
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  return isValidISODate(iso) ? iso : null;
}
export function isValidISODate(iso: string): boolean {
  const d = new Date(`${iso}T12:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}
export function fmtDateTime(iso?: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
}
export const fmtBRL = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

/** Aritmética de datas em yyyy-mm-dd (independente do fuso do navegador). */
export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function weekdayOf(iso: string): number {
  return new Date(`${iso}T12:00:00Z`).getUTCDay();
}
/** Segunda-feira da semana de `iso`. */
export function startOfWeek(iso: string): string {
  const wd = weekdayOf(iso);
  return addDays(iso, wd === 0 ? -6 : 1 - wd);
}
export function weekDates(iso: string, days = 7): string[] {
  const s = startOfWeek(iso);
  return Array.from({ length: days }, (_, i) => addDays(s, i));
}
export function monthGrid(iso: string): string[] {
  const first = `${iso.slice(0, 7)}-01`;
  const s = startOfWeek(first);
  return Array.from({ length: 42 }, (_, i) => addDays(s, i));
}
export const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export function fmtLongDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${WEEKDAYS[weekdayOf(iso)]}, ${d} de ${MONTHS[m - 1]} de ${y}`;
}
export const isWeekend = (iso: string) => [0, 6].includes(weekdayOf(iso));

/** Interseção de intervalos [a1,a2) e [b1,b2) em HH:mm. */
export function overlaps(a1: string, a2: string, b1: string, b2: string): boolean {
  return toMin(a1) < toMin(b2) && toMin(b1) < toMin(a2);
}
