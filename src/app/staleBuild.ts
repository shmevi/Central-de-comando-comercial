/**
 * Versão nova publicada com o app aberto: cada tela é um arquivo JS com nome único por versão. Uma aba aberta antes da
 * publicação ainda pede os arquivos ANTIGOS, que não existem mais → "Failed to fetch dynamically imported module".
 * Solução: ao detectar esse erro, recarregar a página uma vez (pega a versão nova). Um intervalo mínimo entre recargas
 * evita ficar recarregando sem parar se o problema for outro (ex.: sem internet).
 * Só recarrega quando a pessoa ABRE a tela: o pré-carregamento em segundo plano falha em silêncio (nunca recarrega
 * a página no meio do uso).
 */
import { lazy, type ComponentType } from 'react';

const CHUNK_ERROR = /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|unable to preload css|chunkloaderror|loading chunk \S+ failed|is not a valid javascript mime type/i;

export function isChunkError(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err ?? '');
  return CHUNK_ERROR.test(msg);
}

const KEY = 'ccc:chunk-reload';
const MIN_INTERVAL_MS = 15_000;

/** Recarrega a página se não recarregou por este motivo nos últimos 15 s. Devolve true se recarregou. */
export function reloadOnce(now = Date.now(), reload: () => void = () => window.location.reload()): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0);
    if (now - last < MIN_INTERVAL_MS) return false;
    sessionStorage.setItem(KEY, String(now));
  } catch { return false; } // sem sessionStorage não há como evitar recarga em loop: mostra o erro com o botão
  reload();
  return true;
}

/** React.lazy que, se o arquivo da tela sumiu por causa de uma versão nova, recarrega a página em vez de mostrar erro. */
export function lazyPage<T extends ComponentType<object>>(load: () => Promise<{ default: T }>) {
  return lazy(() => load().catch((e: unknown) => {
    if (isChunkError(e) && reloadOnce()) return new Promise<{ default: T }>(() => { /* a página está recarregando */ });
    throw e;
  }));
}
