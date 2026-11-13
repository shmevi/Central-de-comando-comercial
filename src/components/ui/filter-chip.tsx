import { X } from 'lucide-react';

/** Filtro ligado, com "x" para tirar. */
export function FilterChip({ children, onClear }: { children: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-gold-300/40 bg-gold-300/[.08] py-0.5 pl-2.5 pr-1 text-xs text-fg">
      {children}
      <button type="button" onClick={onClear} className="grid h-5 w-5 place-items-center rounded-full text-muted hover:bg-surface-3 hover:text-fg" aria-label={`Remover filtro: ${children}`}><X size={12} /></button>
    </span>
  );
}
