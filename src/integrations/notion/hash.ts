/**
 * Estado canônico + SHA-256 dos campos sincronizados.
 *
 * Dois estados semanticamente iguais produzem o mesmo hash:
 * - chaves em ordem alfabética (em qualquer nível);
 * - texto com espaços das pontas removidos e em Unicode NFC (acentos digitados de formas diferentes);
 * - `undefined` e string vazia viram `null`;
 * - `-0` vira `0`; número não finito vira `null`;
 * - listas marcadas como conjuntos (ex.: IDs de relação) devem chegar ordenadas — use `sortedIds`.
 * Só entram os campos passados: quem chama escolhe os campos relevantes (ver `taskSyncFields`/`krSyncFields`).
 */
export type Canonical = null | boolean | number | string | Canonical[] | { [k: string]: Canonical };

export function canonicalize(v: unknown): Canonical {
  if (v === undefined || v === null) return null;
  if (typeof v === 'string') { const s = v.normalize('NFC').trim(); return s === '' ? null : s; }
  if (typeof v === 'number') return Number.isFinite(v) ? (Object.is(v, -0) ? 0 : v) : null;
  if (typeof v === 'boolean') return v;
  if (Array.isArray(v)) return v.map(canonicalize);
  if (typeof v === 'object') {
    const out: Record<string, Canonical> = {};
    for (const k of Object.keys(v as object).sort()) out[k] = canonicalize((v as Record<string, unknown>)[k]);
    return out;
  }
  return String(v);
}

export const canonicalJson = (v: unknown) => JSON.stringify(canonicalize(v));
export const sortedIds = (ids: readonly string[] | null | undefined) => [...new Set(ids ?? [])].sort();

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const stateHash = (fields: unknown) => sha256Hex(canonicalJson(fields));
