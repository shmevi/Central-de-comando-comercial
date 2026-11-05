import { overlaps } from './time';

export interface Slot { id: string; date: string; start: string; end: string; title?: string }

/** Retorna os itens de `others` que conflitam com `slot` (mesma data e horários sobrepostos). */
export function findConflicts<T extends Slot>(slot: Slot, others: T[]): T[] {
  return others.filter((o) => o.id !== slot.id && o.date === slot.date && overlaps(slot.start, slot.end, o.start, o.end));
}

/** Ids que participam de pelo menos um conflito. */
export function conflictingIds(slots: Slot[]): Set<string> {
  const ids = new Set<string>();
  for (let i = 0; i < slots.length; i++)
    for (let j = i + 1; j < slots.length; j++) {
      const a = slots[i], b = slots[j];
      if (a.date === b.date && overlaps(a.start, a.end, b.start, b.end)) { ids.add(a.id); ids.add(b.id); }
    }
  return ids;
}
