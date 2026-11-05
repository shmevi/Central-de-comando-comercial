import { useEffect, useMemo } from 'react';
import { useCollection, actions } from '@/data/store';
import { isWeekend } from '@/lib/time';
import type { RoutineBlock } from '@/domain/types';

const generating = new Set<string>();

/** Gera os blocos de um dia a partir do modelo (dia específico > padrão). */
export async function materializeDay(date: string, templates: ReturnType<typeof useCollection<'routine_templates'>>['items']) {
  if (generating.has(date)) return;
  generating.add(date);
  try {
    const wd = new Date(`${date}T12:00:00Z`).getUTCDay();
    const tpl = templates.find((t) => t.weekday === wd) ?? templates.find((t) => t.is_default) ?? templates[0];
    if (!tpl) return;
    for (const b of tpl.blocks) {
      await actions.create('routine_blocks', {
        date, start: b.start, end: b.end, title: b.title, category: b.category, status: 'planejado', notes: '',
        is_break: !!b.is_break, break_exception: false, break_exception_reason: '', institution_id: null,
      } satisfies Omit<RoutineBlock, 'id' | 'created_at' | 'updated_at'>);
    }
  } finally { generating.delete(date); }
}

export function useDayBlocks(date: string, autoGenerate = false) {
  const blocks = useCollection('routine_blocks');
  const templates = useCollection('routine_templates');
  const day = useMemo(() => blocks.items.filter((b) => b.date === date).sort((a, b) => a.start.localeCompare(b.start)), [blocks.items, date]);
  const ready = blocks.loaded && templates.loaded;
  useEffect(() => {
    if (autoGenerate && ready && !blocks.error && day.length === 0 && !isWeekend(date)) materializeDay(date, templates.items);
  }, [autoGenerate, ready, day.length, date, templates.items, blocks.error]);
  return { day, blocks, templates, ready, generate: () => materializeDay(date, templates.items) };
}
