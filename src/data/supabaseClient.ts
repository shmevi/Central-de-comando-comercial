import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { resolveDataConfig } from './config';

export const DATA_CONFIG = resolveDataConfig(import.meta.env as unknown as Record<string, string | undefined>);
/** Somente a chave publicável (anon). A service_role NUNCA deve estar no frontend. */
export const DATA_MODE = DATA_CONFIG.mode;

/**
 * Tipo do link de e-mail que abriu o app (convite ou recuperação de senha), lido ANTES de o
 * supabase-js consumir o hash da URL. Nesses casos o usuário precisa definir uma senha.
 */
export const AUTH_LINK_TYPE: string | null = (() => {
  try { return new URLSearchParams(window.location.hash.slice(1)).get('type'); } catch { return null; }
})();

let client: SupabaseClient | null = null;
export function supabase(): SupabaseClient {
  if (!client) {
    if (DATA_CONFIG.error || !DATA_CONFIG.url || !DATA_CONFIG.key) throw new Error(DATA_CONFIG.error ?? 'Supabase não configurado.');
    client = createClient(DATA_CONFIG.url, DATA_CONFIG.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  }
  return client;
}
