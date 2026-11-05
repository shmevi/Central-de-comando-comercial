/**
 * Decide onde os dados ficam, a partir das variáveis VITE_*.
 * - VITE_DATA_MODE=local     → navegador (localStorage)
 * - VITE_DATA_MODE=supabase  → Supabase; URL e chave são OBRIGATÓRIAS (sem queda silenciosa para o modo local)
 * - vazio                    → Supabase se URL e chave existirem; senão, local
 * Também recusa chaves secretas (service_role / sb_secret_), que nunca podem ir para o navegador.
 */
export interface DataConfig { mode: 'local' | 'supabase'; url?: string; key?: string; error?: string }

function jwtRole(key: string): string | null {
  const parts = key.split('.');
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '='));
    return JSON.parse(json).role ?? null;
  } catch { return null; }
}

export function resolveDataConfig(env: Record<string, string | undefined>): DataConfig {
  const url = env.VITE_SUPABASE_URL?.trim() || undefined;
  // Nome novo (publishable) ou legado (anon): os dois são chaves públicas.
  const key = (env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_ANON_KEY)?.trim() || undefined;
  const wanted = env.VITE_DATA_MODE?.trim().toLowerCase() || (url && key ? 'supabase' : 'local');
  if (wanted === 'local') return { mode: 'local' };
  if (wanted !== 'supabase') return { mode: 'local', error: `VITE_DATA_MODE inválido: "${env.VITE_DATA_MODE}". Use "local" ou "supabase".` };
  if (!url || !key) return { mode: 'supabase', error: 'Modo Supabase ativado, mas VITE_SUPABASE_URL ou VITE_SUPABASE_PUBLISHABLE_KEY não foram definidas no build.' };
  if (!/^https:\/\/[^/]+$/.test(url.replace(/\/+$/, '')) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url.replace(/\/+$/, '')))
    return { mode: 'supabase', error: 'VITE_SUPABASE_URL deve ser o endereço do projeto, ex.: https://abcdefgh.supabase.co (sem /rest/v1).' };
  if (key.startsWith('sb_secret_') || jwtRole(key) === 'service_role')
    return { mode: 'supabase', error: 'A chave configurada é SECRETA (service_role / sb_secret_). Troque já pela chave publicável (anon / sb_publishable_) e gere uma nova chave secreta no Supabase.' };
  return { mode: 'supabase', url: url.replace(/\/+$/, ''), key };
}
