import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const mode = (import.meta.env.VITE_DATA_MODE as string | undefined) ?? (url && anon ? 'supabase' : 'local');

/** Somente a chave publicável (anon). A service_role NUNCA deve estar no frontend. */
export const DATA_MODE: 'local' | 'supabase' = mode === 'supabase' && url && anon ? 'supabase' : 'local';

let client: SupabaseClient | null = null;
export function supabase(): SupabaseClient {
  if (!client) {
    if (!url || !anon) throw new Error('Supabase não configurado (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).');
    client = createClient(url, anon, { auth: { persistSession: true, autoRefreshToken: true } });
  }
  return client;
}
