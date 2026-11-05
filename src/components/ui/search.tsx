import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export function SearchInput({ id, value, onChange, placeholder = 'Buscar…', label = 'Buscar', visibleLabel, className }: {
  id: string; value: string; onChange: (v: string) => void; placeholder?: string; label?: string; visibleLabel?: boolean; className?: string;
}) {
  return (
    <div className={cn('relative', className)}>
      <label htmlFor={id} className={visibleLabel ? 'label' : 'sr-only'}>{label}</label>
      <Search size={16} className="pointer-events-none absolute bottom-2.5 left-3 text-muted" aria-hidden />
      <input id={id} type="search" className="field pl-9" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
