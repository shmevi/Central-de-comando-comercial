import * as React from 'react';
import { AlertTriangle, Inbox, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';

export function Card({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) { return <div className={cn('card', className)} {...p} />; }

/** Cabeçalho de cartão: título neutro (sem excesso de dourado), ícone em pastilha discreta. */
export function CardHeader({ title, icon, action, subtitle }: { title: string; icon?: React.ReactNode; action?: React.ReactNode; subtitle?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pt-5">
      <div className="flex min-w-0 items-center gap-3">
        {icon && <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border/70 bg-surface-2 text-gold" aria-hidden>{icon}</span>}
        <div className="min-w-0">
          <h2 className="text-base font-semibold normal-case tracking-normal font-sans">{title}</h2>
          {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}
export function Badge({ className, children, color }: { className?: string; children: React.ReactNode; color?: string }) {
  return <span className={cn('chip border-border/80 text-muted', className)} style={color ? { borderColor: `${color}55`, color, background: `${color}12` } : undefined}>{children}</span>;
}
/** Selo discreto de item sincronizado do Notion. */
export function NotionBadge() {
  return (
    <span className="chip border-border/80 bg-surface-2 text-muted" title="Sincronizado do Notion">
      <span aria-hidden className="grid h-3 w-3 place-items-center rounded-[3px] border border-current text-[8px] font-bold leading-none">N</span>Notion
    </span>
  );
}
export function DemoBadge() { return <span className="demo-badge" title="Dado fictício para demonstração">Demonstração</span>; }

export function Loading({ label = 'Carregando…' }: { label?: string }) {
  return <div role="status" className="flex items-center justify-center gap-2 p-8 text-sm text-muted"><Loader2 className="animate-spin" size={18} />{label}</div>;
}
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-danger/30 bg-danger/5 p-6 text-center text-sm">
      <AlertTriangle className="text-danger" />
      <p>{message}</p>
      {onRetry && <Button variant="secondary" size="sm" onClick={onRetry}>Tentar novamente</Button>}
    </div>
  );
}
export function EmptyState({ title, description, action, icon }: { title: string; description?: string; action?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border/80 bg-surface/40 px-6 py-10 text-center">
      <div className="mb-1 grid h-11 w-11 place-items-center rounded-xl bg-surface-2 text-muted">{icon ?? <Inbox size={20} />}</div>
      <p className="text-base font-semibold">{title}</p>
      {description && <p className="max-w-md text-sm text-muted">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
export function Progress({ value, label, className }: { value: number; label: string; className?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-surface-3', className)} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v)}>
      <div className="h-full rounded-full bg-gold-gradient transition-[width] duration-500" style={{ width: `${v}%` }} />
    </div>
  );
}
/** Abas segmentadas. Selecionado: realce neutro com detalhe dourado (sem bloco dourado). */
export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; count?: number }[]; label: string }) {
  return (
    // flex-wrap + max-w-full: em tela estreita as abas passam para uma segunda linha em vez de estourar a página.
    <div role="radiogroup" aria-label={label} className="inline-flex max-w-full flex-wrap gap-0.5 rounded-xl border border-border/70 bg-surface p-1">
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button key={o.value} role="radio" aria-checked={on} type="button" onClick={() => onChange(o.value)}
            className={cn('inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition',
              on ? 'bg-surface-3 text-fg shadow-[inset_0_-2px_0_rgb(var(--gold-300))]' : 'text-muted hover:bg-surface-2 hover:text-fg')}>
            {o.label}
            {o.count != null && <span className={cn('rounded-full px-1.5 text-[10px] tabular-nums', on ? 'bg-gold-300/15 text-gold' : 'bg-surface-2 text-muted')} aria-label={`${o.count} itens`}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
export function PageHeader({ title, subtitle, actions, eyebrow }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
        <h1 className="brand-title text-[28px] leading-none sm:text-[34px]">{title}</h1>
        {subtitle && <div className="mt-1.5 text-sm text-muted">{subtitle}</div>}
      </div>
      {actions && <div className="flex max-w-full flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
/** Barra de filtros padronizada. */
export function FilterBar({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('card mb-5 flex flex-col gap-3 p-3 sm:p-4', className)}>{children}</div>;
}
/** Indicador numérico (KPI). */
export function Stat({ label, value, icon, tone = 'neutral', hint }: { label: string; value: React.ReactNode; icon?: React.ReactNode; tone?: 'neutral' | 'gold' | 'danger' | 'orange' | 'success'; hint?: string }) {
  const toneCls = { neutral: 'text-fg', gold: 'text-gold', danger: 'text-danger', orange: 'text-orange', success: 'text-success' }[tone];
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between text-xs font-medium text-muted">{label}<span className={cn('opacity-80', toneCls)} aria-hidden>{icon}</span></div>
      <div className={cn('mt-2 font-display text-[34px] font-bold leading-none tabular-nums', toneCls)}>{value}</div>
      {hint && <p className="mt-1 text-[11px] text-muted">{hint}</p>}
    </div>
  );
}
