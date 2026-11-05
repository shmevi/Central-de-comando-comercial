import * as React from 'react';
import { cn } from '@/lib/utils';

let n = 0;
const useFieldId = (id?: string) => React.useMemo(() => id ?? `f${++n}`, [id]);

interface FieldProps { label: string; error?: string | null; hint?: string; className?: string; required?: boolean }

export function Field({ label, error, hint, className, required, children, id }: FieldProps & { children: (id: string, describedBy?: string) => React.ReactNode; id?: string }) {
  const fid = useFieldId(id);
  const desc = error ? `${fid}-err` : hint ? `${fid}-hint` : undefined;
  return (
    <div className={className}>
      <label htmlFor={fid} className="label">{label}{required && <span className="text-danger" aria-hidden> *</span>}</label>
      {children(fid, desc)}
      {error ? <p id={`${fid}-err`} role="alert" className="mt-1 text-xs text-danger">{error}</p>
        : hint ? <p id={`${fid}-hint`} className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & FieldProps;
export function TextField({ label, error, hint, className, required, ...rest }: InputProps) {
  return (
    <Field label={label} error={error} hint={hint} className={className} required={required} id={rest.id}>
      {(id, d) => <input id={id} aria-describedby={d} aria-invalid={!!error} required={required} className={cn('field', error && 'border-danger')} {...rest} />}
    </Field>
  );
}
type AreaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & FieldProps;
export function TextArea({ label, error, hint, className, required, rows = 3, ...rest }: AreaProps) {
  return (
    <Field label={label} error={error} hint={hint} className={className} required={required} id={rest.id}>
      {(id, d) => <textarea id={id} rows={rows} aria-describedby={d} aria-invalid={!!error} className={cn('field resize-y', error && 'border-danger')} {...rest} />}
    </Field>
  );
}
type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & FieldProps & { options: { value: string; label: string }[]; placeholder?: string };
export function SelectField({ label, error, hint, className, required, options, placeholder, ...rest }: SelectProps) {
  return (
    <Field label={label} error={error} hint={hint} className={className} required={required} id={rest.id}>
      {(id, d) => (
        <select id={id} aria-describedby={d} aria-invalid={!!error} className={cn('field', error && 'border-danger')} {...rest}>
          {placeholder != null && <option value="">{placeholder}</option>}
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}
    </Field>
  );
}
export function Checkbox({ label, checked, onChange, className, disabled }: { label: React.ReactNode; checked: boolean; onChange: (v: boolean) => void; className?: string; disabled?: boolean }) {
  return (
    <label className={cn('inline-flex cursor-pointer items-center gap-2 text-sm', disabled && 'opacity-60', className)}>
      <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--gold-300))]" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}
