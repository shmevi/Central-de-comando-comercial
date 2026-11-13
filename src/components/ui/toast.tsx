import * as React from 'react';
import { cn } from '@/lib/utils';

/** Ação opcional no aviso (ex.: "Desfazer"). O aviso com ação fica um pouco mais na tela. */
export type ToastAction = { label: string; onClick: () => void };
type Toast = { id: number; message: string; kind: 'ok' | 'erro' | 'info'; action?: ToastAction };
const Ctx = React.createContext<(m: string, k?: Toast['kind'], action?: ToastAction) => void>(() => {});
export const useToast = () => React.useContext(Ctx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<Toast[]>([]);
  const dismiss = React.useCallback((id: number) => setItems((i) => i.filter((t) => t.id !== id)), []);
  const push = React.useCallback((message: string, kind: Toast['kind'] = 'ok', action?: ToastAction) => {
    const id = Date.now() + Math.random();
    setItems((i) => [...i, { id, message, kind, action }]);
    setTimeout(() => dismiss(id), action ? 6000 : 4000);
  }, [dismiss]);
  // Rede de segurança: qualquer falha de gravação não tratada vira um aviso visível em vez de sumir.
  React.useEffect(() => {
    const onRejection = (e: PromiseRejectionEvent) => {
      const msg = e.reason instanceof Error ? e.reason.message : String(e.reason ?? 'Erro desconhecido');
      push(`Não foi possível concluir a ação: ${msg}`, 'erro');
    };
    window.addEventListener('unhandledrejection', onRejection);
    return () => window.removeEventListener('unhandledrejection', onRejection);
  }, [push]);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-20 left-1/2 z-[60] flex w-[calc(100vw-32px)] max-w-sm -translate-x-1/2 flex-col gap-2 lg:bottom-4">
        {items.map((t) => (
          <div key={t.id} role={t.kind === 'erro' ? 'alert' : 'status'} className={cn('card pointer-events-auto animate-slide-up border-l-[3px] bg-surface-2 px-4 py-3 text-sm shadow-elev-2', t.kind === 'erro' ? 'border-l-danger' : t.kind === 'ok' ? 'border-l-success' : 'border-l-info')}>
            {t.action ? (
              <div className="flex items-center justify-between gap-3">
                <span>{t.message}</span>
                <button type="button" className="shrink-0 rounded-lg px-2 py-1 text-sm font-semibold text-gold hover:bg-surface-3"
                  onClick={() => { dismiss(t.id); t.action!.onClick(); }}>{t.action.label}</button>
              </div>
            ) : t.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
