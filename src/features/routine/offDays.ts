/**
 * Dias em que você apagou TODOS os blocos da rotina de propósito: a rotina-base não é recriada sozinha.
 * Ficam em settings.routine_off_dates (migration 0008). Enquanto a coluna não existir no banco (antes de aplicar
 * a 0008), a marca fica só neste navegador — nada quebra.
 */
import { DATA_MODE } from '@/data/supabaseClient';
import { addDays } from '@/lib/time';
import type { Settings } from '@/domain/types';

const LS_KEY = 'ccc:rotina-dias-sem-blocos';
const KEEP_DAYS = 60;


/** A coluna existe (modo local sempre aceita campos novos; no Supabase, só depois da 0008). */
export const hasOffColumn = (s: Settings) => DATA_MODE === 'local' || Array.isArray(s.routine_off_dates);

function readLocal(): string[] {
  try { const v = JSON.parse(localStorage.getItem(LS_KEY) ?? '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; } catch { return []; }
}
function writeLocal(list: string[]) { try { localStorage.setItem(LS_KEY, JSON.stringify(list)); } catch { /* sem armazenamento: segue sem a marca */ } }

/** Junta a lista do banco e a deste navegador. */
export function offDates(s: Settings): Set<string> {
  return new Set([...(s.routine_off_dates ?? []), ...readLocal()]);
}

/** Mantém só os últimos 60 dias, sem repetir, em ordem. */
export function pruneOff(list: string[], today: string): string[] {
  const min = addDays(today, -KEEP_DAYS);
  return [...new Set(list)].filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= min).sort();
}

/** Marca (on=true) ou desmarca um dia. `save` é o useSettings().save. */
export async function setDayOff(s: Settings, save: (p: Partial<Settings>) => Promise<unknown>, date: string, on: boolean, today: string) {
  const apply = (list: string[]) => pruneOff(on ? [...list, date] : list.filter((d) => d !== date), today);
  writeLocal(apply(readLocal()));
  if (hasOffColumn(s)) await save({ routine_off_dates: apply(s.routine_off_dates ?? []) });
}
