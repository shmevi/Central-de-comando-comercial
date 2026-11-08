import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isChunkError, reloadOnce } from './staleBuild';

describe('versão nova publicada com o app aberto', () => {
  it('reconhece o erro de arquivo de tela que sumiu (Chrome, Firefox, Safari, MIME)', () => {
    expect(isChunkError(new TypeError('Failed to fetch dynamically imported module: https://x.app/assets/Agenda-7OEfS0tk.js'))).toBe(true);
    expect(isChunkError(new TypeError('error loading dynamically imported module'))).toBe(true);
    expect(isChunkError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isChunkError(new Error("Expected a JavaScript module script but the server responded with a MIME type of \"text/html\". 'text/html' is not a valid JavaScript MIME type."))).toBe(true);
    expect(isChunkError(new Error('Unable to preload CSS for /assets/x.css'))).toBe(true);
    expect(isChunkError(new Error('Cannot read properties of undefined'))).toBe(false);
    expect(isChunkError(null)).toBe(false);
  });

  beforeEach(() => {
    const m = new Map<string, string>();
    vi.stubGlobal('sessionStorage', { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => m.set(k, v) });
  });
  it('recarrega uma vez e não entra em loop (intervalo mínimo de 15 s)', () => {
    const reload = vi.fn();
    expect(reloadOnce(1_000_000, reload)).toBe(true);
    expect(reloadOnce(1_005_000, reload)).toBe(false); // logo depois: não recarrega de novo, mostra o erro
    expect(reloadOnce(1_020_000, reload)).toBe(true);  // muito depois (outra publicação): recarrega
    expect(reload).toHaveBeenCalledTimes(2);
  });
  it('sem sessionStorage não recarrega (evita loop): o erro aparece com o botão Atualizar', () => {
    vi.stubGlobal('sessionStorage', undefined);
    const reload = vi.fn();
    expect(reloadOnce(1, reload)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
