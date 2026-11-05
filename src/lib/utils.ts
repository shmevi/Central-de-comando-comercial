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
