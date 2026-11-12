import * as React from 'react';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

type Col<S extends string> = { value: S; label: string; tone?: string };

/**
 * Kanban genérico.
 * - Computador: arrastar e soltar (a coluna de destino realça; o cartão arrastado fica translúcido).
 * - Celular/tablet: colunas lado a lado com rolagem horizontal DENTRO do quadro (snap por coluna) — a página não rola.
 *   Com `mobileTabs`, abaixo de 1024px vira abas (uma coluna por vez, largura total), sem rolar para o lado.
 * - Teclado, toque e leitores de tela: cada cartão tem um menu "⋯" (seletor nativo "Mover … para").
 */
export function KanbanBoard<T extends { id: string }, S extends string>({ columns, items, columnOf, onMove, itemLabel, renderCard, moveOptions, emptyText, readOnly, mobileTabs }: {
  columns: Col<S>[];
  items: T[];
  columnOf: (item: T) => S;
  onMove: (id: string, to: S) => void;
  itemLabel: (item: T) => string;
  renderCard: (item: T) => React.ReactNode;
  /** Opções do seletor (padrão: as colunas). */
  moveOptions?: Col<S>[];
  emptyText?: string;
  /** Só exibição: sem arrastar e sem o seletor "Mover" (ex.: colunas por Objetivo). */
  readOnly?: boolean;
  /** Abaixo de 1024px, mostra abas com as colunas em vez de rolar para o lado. */
  mobileTabs?: boolean;
}) {
  const [tab, setTab] = React.useState<S | null>(null);
  const active = columns.find((c) => c.value === tab)?.value ?? columns[0]?.value;
  const [drag, setDrag] = React.useState<string | null>(null);
  const [over, setOver] = React.useState<S | null>(null);
  const opts = moveOptions ?? columns;
  const drop = (col: S) => { if (drag && !readOnly) onMove(drag, col); setDrag(null); setOver(null); };
  // Até 4 colunas cabem lado a lado a partir de 1024px; 5 a partir de 1280px; mais que isso, o quadro rola na horizontal.
  const grid = columns.length <= 4 ? 'lg' : columns.length === 5 ? 'xl' : null;
  return (
    <div>
    {mobileTabs && (
      <div className="scrollbar-thin -mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 lg:hidden" role="group" aria-label="Colunas do quadro">
        {columns.map((col) => {
          const n = items.filter((i) => columnOf(i) === col.value).length;
          const on = col.value === active;
          return (
            <button key={col.value} type="button" aria-pressed={on} onClick={() => setTab(col.value)}
              className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition', on ? 'border-gold-300/50 bg-gold-300/10 text-fg' : 'border-border/80 text-muted hover:text-fg')}>
              <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: col.tone ?? 'rgb(var(--muted))' }} />{col.label}
              <span className="tabular-nums text-muted">{n}</span>
            </button>
          );
        })}
      </div>
    )}
    <div className={cn('scrollbar-thin relative pb-3', mobileTabs ? 'lg:overflow-x-auto' : '-mx-4 overflow-x-auto px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0')}>
      <div className={cn('flex gap-4', !mobileTabs && 'snap-x snap-mandatory', grid === 'lg' && 'lg:grid lg:snap-none', grid === 'xl' && 'xl:grid xl:snap-none')} style={grid ? { gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` } : undefined}>
        {columns.map((col) => {
          const list = items.filter((i) => columnOf(i) === col.value);
          const isOver = over === col.value && drag != null;
          return (
            <section key={col.value} aria-label={col.label}
              onDragOver={(e) => { e.preventDefault(); if (over !== col.value) setOver(col.value); }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null); }}
              onDrop={() => drop(col.value)}
              className={cn('flex shrink-0 flex-col rounded-2xl border bg-surface/60 p-3 transition-colors',
                mobileTabs ? cn('w-full lg:w-[300px]', col.value !== active && 'hidden lg:flex') : 'w-[84vw] max-w-[320px] snap-start sm:w-[300px]',
                grid === 'lg' && 'lg:w-auto lg:max-w-none', grid === 'xl' && 'xl:w-auto xl:max-w-none',
                isOver ? 'border-gold-300/50 bg-gold-300/[.04]' : 'border-border/60')}>
              <h2 className={cn('mb-3 items-center justify-between gap-2 px-1 font-display text-sm font-semibold tracking-wide', mobileTabs ? 'hidden lg:flex' : 'flex')}>
                <span className="flex items-center gap-2">
                  <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: col.tone ?? 'rgb(var(--muted))' }} />{col.label}
                </span>
                <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted" aria-label={`${list.length} itens`}>{list.length}</span>
              </h2>
              <ul className="flex min-h-[120px] flex-1 flex-col gap-2.5">
                {list.map((item) => (
                  <li key={item.id} draggable={!readOnly} onDragStart={(e) => { setDrag(item.id); e.dataTransfer.effectAllowed = 'move'; }} onDragEnd={() => { setDrag(null); setOver(null); }}
                    className={cn('group relative rounded-xl border border-border/70 bg-surface-2 p-3 text-sm shadow-elev-1 transition hover:border-border hover:bg-surface-3/70',
                      !readOnly && 'cursor-grab pr-9 active:cursor-grabbing', drag === item.id && 'opacity-40')}>
                    {renderCard(item)}
                    {!readOnly && (
                      // Menu "⋯": um seletor nativo invisível por cima do ícone (funciona com toque, teclado e leitor de tela).
                      <label className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-lg text-muted transition hover:bg-surface-3 hover:text-fg focus-within:outline focus-within:outline-2 focus-within:outline-gold-300/60" title="Mover para…">
                        <span className="sr-only">Mover {itemLabel(item)} para</span>
                        <MoreHorizontal size={16} aria-hidden />
                        <select className="absolute inset-0 cursor-pointer opacity-0" value={columnOf(item)} onChange={(e) => onMove(item.id, e.target.value as S)}>
                          {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </label>
                    )}
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
    </div>
  );
}
