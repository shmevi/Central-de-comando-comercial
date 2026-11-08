import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
export const cn = (...i: ClassValue[]) => twMerge(clsx(i));
export const uid = () =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
export const nowIso = () => new Date().toISOString();

/** Só aceita links http(s). Bloqueia javascript:, data: etc. (dados podem vir de backup importado). */
export function safeHttpUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  try { const url = new URL(u); return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null; } catch { return null; }
}

/** SHA-256 em hexadecimal (Web Crypto). */
export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Executa `fn` em todos os itens com no máximo `limit` ao mesmo tempo (ex.: gravações no banco).
 * Mais rápido que um por vez e sem disparar centenas de requisições de uma vez. Ordem dos resultados preservada.
 * O primeiro erro é relançado depois que as tarefas em andamento terminam.
 */
export async function pool<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0; let failed: unknown = null;
  const worker = async () => {
    while (next < items.length && !failed) {
      const i = next++;
      try { out[i] = await fn(items[i], i); } catch (e) { failed ??= e; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  if (failed) throw failed;
  return out;
}

/** Junta várias alterações do MESMO registro numa só (na ordem em que aparecem). */
export function mergeById<P extends object>(updates: readonly { id: string; patch: P }[]): { id: string; patch: P }[] {
  const m = new Map<string, P>();
  for (const u of updates) m.set(u.id, { ...(m.get(u.id) ?? {}), ...u.patch } as P);
  return [...m].map(([id, patch]) => ({ id, patch }));
}
