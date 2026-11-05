import * as React from 'react';
import { DATA_MODE } from '@/data';
import { supabase } from '@/data/supabaseClient';
import { ensureSeed, resetSeedGuard } from '@/data/seed';
import { resetStore } from '@/data/store';

type AuthState = { status: 'loading' | 'signed_out' | 'ready' | 'error'; email: string | null; error: string | null; mode: typeof DATA_MODE;
  signIn: (e: string, p: string) => Promise<void>; signUp: (e: string, p: string) => Promise<void>; signOut: () => Promise<void> };
const Ctx = React.createContext<AuthState>(null as any);
export const useAuth = () => React.useContext(Ctx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = React.useState<AuthState['status']>('loading');
  const [email, setEmail] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const boot = React.useCallback(async () => {
    try { await ensureSeed(); setStatus('ready'); }
    catch (e) { setError((e as Error).message); setStatus('error'); }
  }, []);

  React.useEffect(() => {
    if (DATA_MODE === 'local') { setEmail(null); boot(); return; }
    const sb = supabase();
    sb.auth.getSession().then(({ data }) => {
      if (data.session) { setEmail(data.session.user.email ?? null); boot(); } else setStatus('signed_out');
    });
    const { data: sub } = sb.auth.onAuthStateChange((_ev, session) => {
      if (!session) { resetStore(); setEmail(null); setStatus('signed_out'); }
    });
    return () => sub.subscription.unsubscribe();
  }, [boot]);

  const value: AuthState = {
    status, email, error, mode: DATA_MODE,
    async signIn(e, p) {
      const { data, error } = await supabase().auth.signInWithPassword({ email: e, password: p });
      if (error) throw new Error(error.message === 'Invalid login credentials' ? 'E-mail ou senha inválidos.' : error.message);
      setEmail(data.user?.email ?? null); setStatus('loading'); resetStore(); resetSeedGuard(); await boot();
    },
    async signUp(e, p) {
      const { data, error } = await supabase().auth.signUp({ email: e, password: p });
      if (error) throw new Error(error.message);
      if (!data.session) throw new Error('Conta criada. Confirme o e-mail recebido e depois entre.');
      setEmail(data.user?.email ?? null); setStatus('loading'); resetStore(); resetSeedGuard(); await boot();
    },
    async signOut() { if (DATA_MODE === 'supabase') await supabase().auth.signOut(); },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
