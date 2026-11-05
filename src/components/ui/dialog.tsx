import * as React from 'react';
import * as D from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';

export function Dialog({ open, onOpenChange, title, description, children, footer, wide }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string;
  children: React.ReactNode; footer?: React.ReactNode; wide?: boolean;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm" />
        <D.Content
          className={cn('fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-32px)] max-h-[calc(100dvh-32px)] flex flex-col card shadow-2xl', wide ? 'max-w-3xl' : 'max-w-lg')}
          aria-describedby={description ? undefined : undefined}
        >
          <div className="flex items-start justify-between gap-4 border-b border-border p-4">
            <div>
              <D.Title className="font-display text-xl font-bold uppercase tracking-wide">{title}</D.Title>
              {description ? <D.Description className="text-sm text-muted">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
            </div>
            <D.Close asChild><Button variant="ghost" size="icon" aria-label="Fechar"><X size={18} /></Button></D.Close>
          </div>
          <div className="overflow-y-auto p-4">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-border p-4">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

/** Confirmação explícita para ações destrutivas ou externas. */
export function useConfirm() {
  const [state, setState] = React.useState<{ title: string; message: string; confirmLabel?: string; danger?: boolean; resolve: (v: boolean) => void } | null>(null);
  const confirm = React.useCallback((o: { title: string; message: string; confirmLabel?: string; danger?: boolean }) =>
    new Promise<boolean>((resolve) => setState({ ...o, resolve })), []);
  const close = (v: boolean) => { state?.resolve(v); setState(null); };
  const node = (
    <Dialog open={!!state} onOpenChange={(o) => !o && close(false)} title={state?.title ?? ''}
      footer={<>
        <Button variant="ghost" onClick={() => close(false)}>Cancelar</Button>
        <Button variant={state?.danger ? 'danger' : 'primary'} onClick={() => close(true)}>{state?.confirmLabel ?? 'Confirmar'}</Button>
      </>}>
      <p className="text-sm">{state?.message}</p>
    </Dialog>
  );
  return { confirm, confirmNode: node };
}
