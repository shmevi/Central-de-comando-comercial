import * as React from 'react';
import { useAuth } from '@/app/auth';
import { Monogram } from '@/components/layout/Monogram';
import { TextField } from '@/components/ui/form';
import { Button } from '@/components/ui/button';

/** Cadastro aberto só se explicitamente habilitado. Desative também "Allow new users to sign up" no Supabase. */
const ALLOW_SIGNUP = import.meta.env.VITE_ALLOW_SIGNUP === 'true';

export default function Login() {
  const { signIn, signUp } = useAuth();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [mode, setMode] = React.useState<'in' | 'up'>('in');
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError('Informe um e-mail válido.');
    if (password.length < 8) return setError('A senha deve ter ao menos 8 caracteres.');
    setBusy(true);
    try { await (mode === 'in' ? signIn(email, password) : signUp(email, password)); } catch (er) { setError((er as Error).message); } finally { setBusy(false); }
  }
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4 p-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <Monogram size={56} />
          <h1 className="text-2xl text-gold">Central de Comando Comercial</h1>
          <p className="text-sm text-muted">{mode === 'in' ? 'Entre para continuar' : 'Criar conta de acesso'}</p>
        </div>
        <TextField label="E-mail" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <TextField label="Senha" type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Aguarde…' : mode === 'in' ? 'Entrar' : 'Criar conta'}</Button>
        {ALLOW_SIGNUP ? (
          <button type="button" className="w-full text-center text-xs text-muted hover:text-gold" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>
            {mode === 'in' ? 'Primeiro acesso? Criar conta' : 'Já tenho conta'}
          </button>
        ) : <p className="text-center text-xs text-muted">Acesso somente para usuários cadastrados pelo administrador.</p>}
      </form>
    </div>
  );
}
