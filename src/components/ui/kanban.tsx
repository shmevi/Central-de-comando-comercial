import * as React from 'react';
import { GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

type Col<S extends string> = { value: S; label: string; tone?: string };

/**
 * Kanban genérico.
 * - Computador: arrastar e soltar (a coluna de destino realça; o cartão arrastado fica translúcido).
 * - Celular/tablet: colunas lado a lado com rolagem horizontal DENTRO do quadro (snap por coluna) — a página não rola.
 * - Teclado e leitores de tela: cada cartão tem um seletor "Mover … para".
 */
export function KanbanBoard<T extends { id: string }, S extends string>({ columns, items, columnOf, onMove, itemLabel, renderCard, moveOptions, emptyText }: {
  columns: Col<S>[];
  items: T[];
  columnOf: (item: T) => S;
  onMove: (id: string, to: S) => void;
  itemLabel: (item: T) => string;
  renderCard: (item: T) => React.ReactNode;
  /** Opções do seletor (padrão: as colunas). */
  moveOptions?: Col<S>[];
  emptyText?: string;
}) {
  const [drag, setDrag] = React.useState<string | null>(null);
  const [over, setOver] = React.useState<S | null>(null);
  const opts = moveOptions ?? columns;
  const drop = (col: S) => { if (drag) onMove(drag, col); setDrag(null); setOver(null); };
  return (
    <div className="scrollbar-thin relative -mx-4 overflow-x-auto px-4 pb-3 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
      <div className="flex snap-x snap-mandatory gap-4 lg:grid lg:snap-none" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
        {columns.map((col) => {
          const list = items.filter((i) => columnOf(i) === col.value);
          const isOver = over === col.value && drag != null;
          return (
            <section key={col.value} aria-label={col.label}
              onDragOver={(e) => { e.preventDefault(); if (over !== col.value) setOver(col.value); }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null); }}
              onDrop={() => drop(col.value)}
              className={cn('flex w-[84vw] max-w-[320px] shrink-0 snap-start flex-col rounded-2xl border bg-surface/60 p-3 transition-colors sm:w-[300px] lg:w-auto lg:max-w-none',
                isOver ? 'border-gold-300/50 bg-gold-300/[.04]' : 'border-border/60')}>
              <h2 className="mb-3 flex items-center justify-between gap-2 px-1 font-sans text-sm font-semibold tracking-normal">
                <span className="flex items-center gap-2">
                  <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: col.tone ?? 'rgb(var(--muted))' }} />{col.label}
                </span>
                <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted" aria-label={`${list.length} itens`}>{list.length}</span>
              </h2>
              <ul className="flex min-h-[120px] flex-1 flex-col gap-2.5">
                {list.map((item) => (
                  <li key={item.id} draggable onDragStart={(e) => { setDrag(item.id); e.dataTransfer.effectAllowed = 'move'; }} onDragEnd={() => { setDrag(null); setOver(null); }}
                    className={cn('group relative cursor-grab rounded-xl border border-border/70 bg-surface-2 p-3 text-sm shadow-elev-1 transition hover:border-border hover:bg-surface-3/70 active:cursor-grabbing',
                      drag === item.id && 'opacity-40')}>
                    <GripVertical size={14} aria-hidden className="absolute right-2 top-3 text-muted/40 opacity-0 transition group-hover:opacity-100" />
                    {renderCard(item)}
                    <label className="mt-3 block">
                      <span className="sr-only">Mover {itemLabel(item)} para</span>
                      <select className="field h-7 rounded-lg px-2 py-0 text-[11px] text-muted" value={columnOf(item)} onChange={(e) => onMove(item.id, e.target.value as S)}>
                        {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </label>
                  </li>
                ))}
                {list.length === 0 && emptyText && (
                  <li className={cn('grid flex-1 place-items-center rounded-xl border border-dashed p-4 text-center text-xs text-muted transition-colors', isOver ? 'border-gold-300/50' : 'border-border/70')}>{emptyText}</li>
                )}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
