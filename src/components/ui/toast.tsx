import * as React from 'react';
import { cn } from '@/lib/utils';

type Toast = { id: number; message: string; kind: 'ok' | 'erro' | 'info' };
const Ctx = React.createContext<(m: string, k?: Toast['kind']) => void>(() => {});
export const useToast = () => React.useContext(Ctx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<Toast[]>([]);
  const push = React.useCallback((message: string, kind: Toast['kind'] = 'ok') => {
    const id = Date.now() + Math.random();
    setItems((i) => [...i, { id, message, kind }]);
    setTimeout(() => setItems((i) => i.filter((t) => t.id !== id)), 4000);
  }, []);
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
          <div key={t.id} role={t.kind === 'erro' ? 'alert' : 'status'} className={cn('card pointer-events-auto px-4 py-3 text-sm shadow-xl', t.kind === 'erro' ? 'border-danger/60' : t.kind === 'ok' ? 'border-gold-300/60' : '')}>
            {t.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
