import * as React from 'react';
import { DATA_MODE } from '@/data';
import { AUTH_LINK_TYPE, DATA_CONFIG, supabase } from '@/data/supabaseClient';
import { ensureSeed, resetSeedGuard } from '@/data/seed';
import { prefetch, resetStore } from '@/data/store';
import { HOME_DATA } from '@/data/prefetch';

/**
 * - loading: iniciando
 * - config_error: variáveis do Supabase ausentes/erradas no build (nunca cai para o modo local em silêncio)
 * - signed_out: tela de login
 * - set_password: chegou por link de convite ou de recuperação de senha → definir nova senha
 * - ready: app liberado
 */
type Status = 'loading' | 'config_error' | 'signed_out' | 'set_password' | 'ready' | 'error';
type AuthState = {
  status: Status; email: string | null; error: string | null; mode: typeof DATA_MODE;
  signIn: (e: string, p: string) => Promise<void>;
  signUp: (e: string, p: string) => Promise<void>;
  sendPasswordReset: (e: string) => Promise<void>;
  updatePassword: (p: string) => Promise<void>;
  signOut: () => Promise<void>;
};
const Ctx = React.createContext<AuthState>(null as unknown as AuthState);
export const useAuth = () => React.useContext(Ctx);

/** Traduz as mensagens mais comuns do Supabase Auth. */
export function authErrorPt(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'E-mail ou senha inválidos.';
  if (m.includes('email not confirmed')) return 'E-mail ainda não confirmado. Abra o link enviado por e-mail ou peça ao administrador para confirmar o usuário.';
  if (m.includes('signups not allowed') || m.includes('signup is disabled')) return 'O cadastro público está desativado. Peça acesso ao administrador.';
  if (m.includes('user already registered')) return 'Este e-mail já tem conta. Use “Entrar” ou “Esqueci minha senha”.';
  if (m.includes('password should be') || m.includes('weak password')) return 'Senha fraca. Use pelo menos 8 caracteres, com letras e números.';
  if (m.includes('should be different')) return 'A nova senha precisa ser diferente da atual.';
  if (m.includes('for security purposes') || m.includes('rate limit')) return 'Muitas tentativas seguidas. Aguarde um minuto e tente de novo.';
  if (m.includes('failed to fetch') || m.includes('network')) return 'Sem conexão com o Supabase. Verifique a internet e a URL configurada.';
  if (m.includes('auth session missing') || m.includes('jwt')) return 'O link expirou ou já foi usado. Peça um novo link.';
  return message;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = React.useState<Status>('loading');
  const [email, setEmail] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const boot = React.useCallback(async () => {
    // Os dados da tela inicial são pedidos JÁ, em paralelo com a checagem do 1º acesso (antes: uma onda
    // esperando a outra). Se for o 1º acesso e o seed criar dados, o cache é zerado e a tela relê tudo.
    void prefetch(HOME_DATA);
    try { if (await ensureSeed()) resetStore(false); setStatus('ready'); }
    catch (e) { setError((e as Error).message); setStatus('error'); }
  }, []);

  React.useEffect(() => {
    if (DATA_CONFIG.error) { setError(DATA_CONFIG.error); setStatus('config_error'); return; }
    if (DATA_MODE === 'local') { setEmail(null); boot(); return; }
    const sb = supabase();
    const needsPassword = AUTH_LINK_TYPE === 'recovery' || AUTH_LINK_TYPE === 'invite';
    sb.auth.getSession().then(({ data, error }) => {
      if (error) { setError(authErrorPt(error.message)); setStatus('signed_out'); return; }
      if (!data.session) { setStatus('signed_out'); return; }
      setEmail(data.session.user.email ?? null);
      if (needsPassword) setStatus('set_password'); else boot();
    }).catch((e) => { setError(authErrorPt((e as Error).message)); setStatus('error'); });
    const { data: sub } = sb.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' && session) { setEmail(session.user.email ?? null); setStatus('set_password'); return; }
      if (!session) { setStatus('signed_out'); setEmail(null); resetStore(false); resetSeedGuard(); }
    });
    return () => sub.subscription.unsubscribe();
  }, [boot]);

  const enter = async (userEmail: string | null) => { setEmail(userEmail); setStatus('loading'); resetStore(false); resetSeedGuard(); await boot(); };

  const value: AuthState = {
    status, email, error, mode: DATA_MODE,
    async signIn(e, p) {
      const { data, error } = await supabase().auth.signInWithPassword({ email: e, password: p });
      if (error) throw new Error(authErrorPt(error.message));
      await enter(data.user?.email ?? null);
    },
    async signUp(e, p) {
      const { data, error } = await supabase().auth.signUp({ email: e, password: p, options: { emailRedirectTo: window.location.origin } });
      if (error) throw new Error(authErrorPt(error.message));
      if (!data.session) throw new Error('Conta criada. Confirme o e-mail recebido e depois entre.');
      await enter(data.user?.email ?? null);
    },
    async sendPasswordReset(e) {
      // O endereço precisa estar em Authentication → URL Configuration → Redirect URLs no Supabase.
      const { error } = await supabase().auth.resetPasswordForEmail(e, { redirectTo: window.location.origin });
      if (error) throw new Error(authErrorPt(error.message));
    },
    async updatePassword(p) {
      const { data, error } = await supabase().auth.updateUser({ password: p });
      if (error) throw new Error(authErrorPt(error.message));
      try { history.replaceState(null, '', window.location.pathname); } catch { /* ignore */ }
      await enter(data.user?.email ?? null);
    },
    async signOut() { if (DATA_MODE === 'supabase') await supabase().auth.signOut(); },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
