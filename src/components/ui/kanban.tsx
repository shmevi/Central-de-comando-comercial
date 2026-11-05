import * as React from 'react';
import { cn } from '@/lib/utils';

type Col<S extends string> = { value: S; label: string };

/**
 * Kanban genérico. Arrastar e soltar no computador; no celular e pelo teclado,
 * cada cartão tem um seletor "Mover … para".
 */
export function KanbanBoard<T extends { id: string }, S extends string>({ columns, items, columnOf, onMove, itemLabel, renderCard, moveOptions, minWidth, emptyText, compactTitle }: {
  columns: Col<S>[];
  items: T[];
  columnOf: (item: T) => S;
  onMove: (id: string, to: S) => void;
  itemLabel: (item: T) => string;
  renderCard: (item: T) => React.ReactNode;
  /** Opções do seletor (padrão: as colunas). */
  moveOptions?: Col<S>[];
  /** Largura mínima da grade em px (rola dentro do quadro, nunca a página). */
  minWidth: number;
  emptyText?: string;
  compactTitle?: boolean;
}) {
  const [drag, setDrag] = React.useState<string | null>(null);
  const opts = moveOptions ?? columns;
  return (
    <div className="relative -mx-4 overflow-x-auto px-4 pb-2">
      <div className="grid gap-3" style={{ minWidth, gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
        {columns.map((col) => {
          const list = items.filter((i) => columnOf(i) === col.value);
          return (
            <section key={col.value} aria-label={col.label} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (drag) onMove(drag, col.value); setDrag(null); }}
              className="card flex min-h-[220px] flex-col p-3">
              <h2 className={cn('mb-2 flex items-center justify-between text-gold', compactTitle ? 'text-sm' : 'text-base')}>{col.label}<span className="text-xs text-muted">{list.length}</span></h2>
              <ul className="flex flex-1 flex-col gap-2">
                {list.map((item) => (
                  <li key={item.id} draggable onDragStart={() => setDrag(item.id)} className="cursor-grab rounded-lg border border-border bg-surface-2 p-2.5 text-sm">
                    {renderCard(item)}
                    <label className="mt-2 block">
                      <span className="sr-only">Mover {itemLabel(item)} para</span>
                      <select className="field h-7 py-0 text-xs" value={columnOf(item)} onChange={(e) => onMove(item.id, e.target.value as S)}>
                        {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </label>
                  </li>
                ))}
                {list.length === 0 && emptyText && <li className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted">{emptyText}</li>}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
