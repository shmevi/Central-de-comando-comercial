import * as React from 'react';
import { AlertTriangle, Inbox, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';

export function Card({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) { return <div className={cn('card', className)} {...p} />; }
export function CardHeader({ title, icon, action, subtitle }: { title: string; icon?: React.ReactNode; action?: React.ReactNode; subtitle?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 pt-4">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-lg text-gold">{icon}{title}</h2>
        {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
export function Badge({ className, children, color }: { className?: string; children: React.ReactNode; color?: string }) {
  return <span className={cn('chip border-border text-muted', className)} style={color ? { borderColor: `${color}80`, color, background: `${color}14` } : undefined}>{children}</span>;
}
export function DemoBadge() { return <span className="demo-badge" title="Dado fictício para demonstração">Demonstração</span>; }

export function Loading({ label = 'Carregando…' }: { label?: string }) {
  return <div role="status" className="flex items-center justify-center gap-2 p-8 text-sm text-muted"><Loader2 className="animate-spin" size={18} />{label}</div>;
}
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-xl border border-danger/40 bg-danger/5 p-6 text-center text-sm">
      <AlertTriangle className="text-danger" />
      <p>{message}</p>
      {onRetry && <Button variant="secondary" size="sm" onClick={onRetry}>Tentar novamente</Button>}
    </div>
  );
}
export function EmptyState({ title, description, action, icon }: { title: string; description?: string; action?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border p-8 text-center">
      <div className="text-muted">{icon ?? <Inbox />}</div>
      <p className="font-display text-lg uppercase tracking-wide">{title}</p>
      {description && <p className="max-w-md text-sm text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
export function Progress({ value, label, className }: { value: number; label: string; className?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={cn('h-2.5 w-full overflow-hidden rounded-full bg-surface-2', className)} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v)}>
      <div className="h-full rounded-full bg-gold-gradient transition-all" style={{ width: `${v}%` }} />
    </div>
  );
}
export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-xl border border-border bg-surface p-1">
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={value === o.value} type="button" onClick={() => onChange(o.value)}
          className={cn('rounded-lg px-3 py-1 font-display text-sm font-bold uppercase tracking-wider', value === o.value ? 'bg-gold-gradient on-gold' : 'text-muted hover:text-fg')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-3xl leading-tight sm:text-4xl">{title}</h1>
        {subtitle && <div className="text-sm text-muted">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
