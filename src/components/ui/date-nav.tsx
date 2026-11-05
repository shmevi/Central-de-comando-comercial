import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './button';

/** Navegação anterior / hoje / próximo + seletor de data. */
export function DateNav({ date, onChange, onPrev, onNext, today, children }: {
  date: string; onChange: (d: string) => void; onPrev: () => void; onNext: () => void; today: string; children?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <Button variant="ghost" size="icon" aria-label="Anterior" onClick={onPrev}><ChevronLeft size={18} /></Button>
      <Button variant="secondary" size="sm" onClick={() => onChange(today)}>Hoje</Button>
      <Button variant="ghost" size="icon" aria-label="Próximo" onClick={onNext}><ChevronRight size={18} /></Button>
      <label><span className="sr-only">Escolher data</span><input type="date" className="field h-9 w-auto" value={date} onChange={(e) => e.target.value && onChange(e.target.value)} /></label>
      {children}
    </div>
  );
}
