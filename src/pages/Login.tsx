import * as React from 'react';
import { useAuth } from '@/app/auth';
import { Monogram } from '@/components/layout/Monogram';
import { TextField } from '@/components/ui/form';
import { Button } from '@/components/ui/button';

/** Cadastro aberto só se explicitamente habilitado. Desative também "Allow new users to sign up" no Supabase. */
const ALLOW_SIGNUP = import.meta.env.VITE_ALLOW_SIGNUP === 'true';
const EMAIL_RE = /^\S+@\S+\.\S+$/;

function AuthCard({ subtitle, children }: { subtitle: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="card w-full max-w-sm space-y-4 p-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <Monogram size={56} />
          <h1 className="text-2xl text-gold">Central de Comando Comercial</h1>
          <p className="text-sm text-muted">{subtitle}</p>
        </div>
        {children}
      </div>
    </div>
  );
}

export function validatePassword(p: string): string | null {
  if (p.length < 8) return 'A senha deve ter ao menos 8 caracteres.';
  if (!/[a-zA-Z]/.test(p) || !/\d/.test(p)) return 'Use letras e números na senha.';
  return null;
}

export default function Login() {
  const { signIn, signUp, sendPasswordReset, error: bootError } = useAuth();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [mode, setMode] = React.useState<'in' | 'up' | 'forgot'>('in');
  const [error, setError] = React.useState<string | null>(bootError);
  const [info, setInfo] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(null); setInfo(null);
    if (!EMAIL_RE.test(email)) return setError('Informe um e-mail válido.');
    if (mode !== 'forgot') {
      const pe = mode === 'up' ? validatePassword(password) : password ? null : 'Informe a senha.';
      if (pe) return setError(pe);
    }
    setBusy(true);
    try {
      if (mode === 'forgot') { await sendPasswordReset(email); setInfo('Se o e-mail estiver cadastrado, você receberá um link para criar uma nova senha.'); }
      else await (mode === 'in' ? signIn(email, password) : signUp(email, password));
    } catch (er) { setError((er as Error).message); } finally { setBusy(false); }
  }

  const subtitle = mode === 'in' ? 'Entre para continuar' : mode === 'up' ? 'Criar conta de acesso' : 'Recuperar senha';
  return (
    <AuthCard subtitle={subtitle}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <TextField label="E-mail" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        {mode !== 'forgot' && (
          <TextField label="Senha" type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} required />
        )}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        {info && <p role="status" className="text-sm text-success">{info}</p>}
        <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Aguarde…' : mode === 'in' ? 'Entrar' : mode === 'up' ? 'Criar conta' : 'Enviar link'}</Button>
      </form>
      <div className="flex flex-col items-center gap-2 text-xs">
        {mode === 'in' && <button type="button" className="text-muted hover:text-gold" onClick={() => { setMode('forgot'); setError(null); }}>Esqueci minha senha</button>}
        {mode !== 'in' && <button type="button" className="text-muted hover:text-gold" onClick={() => { setMode('in'); setError(null); setInfo(null); }}>Voltar para “Entrar”</button>}
        {ALLOW_SIGNUP && mode === 'in' && <button type="button" className="text-muted hover:text-gold" onClick={() => setMode('up')}>Primeiro acesso? Criar conta</button>}
        {!ALLOW_SIGNUP && mode === 'in' && <p className="text-center text-muted">Acesso somente para usuários cadastrados pelo administrador.</p>}
      </div>
    </AuthCard>
  );
}

/** Depois de abrir o link de convite ou de recuperação: definir a senha. */
export function SetPassword() {
  const { updatePassword, email, signOut } = useAuth();
  const [p1, setP1] = React.useState('');
  const [p2, setP2] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(null);
    const pe = validatePassword(p1); if (pe) return setError(pe);
    if (p1 !== p2) return setError('As senhas não conferem.');
    setBusy(true);
    try { await updatePassword(p1); } catch (er) { setError((er as Error).message); } finally { setBusy(false); }
  }
  return (
    <AuthCard subtitle={`Defina sua senha${email ? ` para ${email}` : ''}`}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <TextField label="Nova senha" type="password" autoComplete="new-password" value={p1} onChange={(e) => setP1(e.target.value)} required hint="Mínimo de 8 caracteres, com letras e números." />
        <TextField label="Repita a nova senha" type="password" autoComplete="new-password" value={p2} onChange={(e) => setP2(e.target.value)} required />
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Salvando…' : 'Salvar senha e entrar'}</Button>
      </form>
      <button type="button" className="w-full text-center text-xs text-muted hover:text-gold" onClick={signOut}>Cancelar</button>
    </AuthCard>
  );
}

/** Build publicado sem as variáveis certas: explica o que configurar, sem usar o modo local escondido. */
export function ConfigError({ message }: { message: string }) {
  return (
    <AuthCard subtitle="Configuração incompleta">
      <div role="alert" className="space-y-3 text-sm">
        <p className="text-danger">{message}</p>
        <p className="text-muted">Quem publicou o sistema deve conferir as variáveis de ambiente <code>VITE_SUPABASE_URL</code>, <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> e <code>VITE_DATA_MODE</code> na hospedagem (Vercel/Netlify) e publicar de novo. Os seus dados não foram alterados.</p>
      </div>
    </AuthCard>
  );
}
