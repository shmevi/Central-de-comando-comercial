/**
 * Ao mudar o intervalo na Jornada, o bloco "Intervalo" do modelo de rotina acompanha (antes era preciso ajustar os dois).
 * Puro: devolve os modelos que mudam e os blocos que passaram a encostar no novo intervalo (para avisar, sem mexer neles).
 */
import type { RoutineTemplate } from '@/domain/types';
import { overlaps } from '@/lib/time';

export function retimeBreak(templates: Pick<RoutineTemplate, 'id' | 'blocks'>[], start: string, end: string) {
  const updates: { id: string; blocks: RoutineTemplate['blocks'] }[] = [];
  const clashes = new Set<string>();
  for (const t of templates) {
    if (!t.blocks.some((b) => b.is_break && (b.start !== start || b.end !== end))) continue;
    const blocks = t.blocks.map((b) => (b.is_break ? { ...b, start, end } : b)).sort((a, b) => a.start.localeCompare(b.start));
    for (const b of blocks) if (!b.is_break && overlaps(b.start, b.end, start, end)) clashes.add(`${b.title} (${b.start}–${b.end})`);
    updates.push({ id: t.id, blocks });
  }
  return { updates, clashes: [...clashes] };
}
