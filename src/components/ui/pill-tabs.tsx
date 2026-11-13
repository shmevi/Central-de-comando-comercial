import { cn } from '@/lib/utils';

/** Abas em pílulas (rolam para o lado no celular). `count` aparece ao lado do rótulo quando > 0. */
export function PillTabs<T extends string>({ value, onChange, options, label, className }: {
  value: T; onChange: (v: T) => void; options: readonly { value: T; label: string; count?: number; tone?: 'danger' }[]; label: string; className?: string;
}) {
  return (
    <div className={cn('scrollbar-thin -mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0', className)} role="group" aria-label={label}>
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button key={o.value} type="button" aria-pressed={on} onClick={() => onChange(o.value)}
            className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition', on ? 'border-gold-300/50 bg-gold-300/10 font-semibold text-fg' : 'border-border/80 text-muted hover:text-fg')}>
            {o.label}
            {!!o.count && <span className={cn('rounded-full px-1.5 text-xs tabular-nums', o.tone === 'danger' ? 'bg-danger/15 text-danger' : 'bg-surface-3 text-muted')}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
