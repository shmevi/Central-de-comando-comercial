import * as React from 'react';
import * as D from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';

export function Dialog({ open, onOpenChange, title, description, children, footer, wide, badge }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string;
  children: React.ReactNode; footer?: React.ReactNode; wide?: boolean; badge?: React.ReactNode;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[3px] data-[state=open]:animate-fade-in" />
        <D.Content
          className={cn('card fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-24px)] w-[calc(100vw-24px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-surface shadow-elev-2 data-[state=open]:animate-pop-in sm:max-h-[calc(100dvh-48px)]', wide ? 'max-w-3xl' : 'max-w-lg')}
        >
          <div className="flex items-start justify-between gap-4 px-5 pb-3 pt-5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <D.Title className="font-sans text-lg font-semibold tracking-normal">{title}</D.Title>
                {badge}
              </div>
              {description ? <D.Description className="mt-0.5 text-sm text-muted">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
            </div>
            <D.Close asChild><Button variant="ghost" size="icon" aria-label="Fechar" className="-mr-2 -mt-1"><X size={18} /></Button></D.Close>
          </div>
          <div className="scrollbar-thin overflow-y-auto border-t border-border/60 px-5 py-5">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-border/60 bg-surface-2/40 px-5 py-3.5">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

/** Seção agrupada de formulário (título curto + campos). */
export function FormSection({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <fieldset className={cn('min-w-0 space-y-3', className)}>
      <legend className="eyebrow mb-3">{title}</legend>
      {children}
    </fieldset>
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
  /** Pergunta "Excluir X?" e executa `action` só se confirmado. */
  const confirmDelete = React.useCallback(async (title: string, what: string, action: () => Promise<unknown>) => {
    if (await confirm({ title, message: `Excluir ${what}? Esta ação não pode ser desfeita.`, danger: true, confirmLabel: 'Excluir' })) await action();
  }, [confirm]);
  return { confirm, confirmDelete, confirmNode: node };
}
