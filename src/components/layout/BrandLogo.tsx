import * as React from 'react';
import { useSettings } from '@/app/hooks';
import { LOGO_HEAVY_BYTES, optimizeStoredLogo, resolveLogo } from '@/data/branding';
import { Monogram } from './Monogram';
import { applyAppIcon } from '@/app/appIcon';

/** data: URL → Blob, sem fetch (a CSP não libera fetch de data:). */
function dataUrlToBlob(u: string): Blob | null {
  const m = /^data:([^;,]+);base64,(.*)$/.exec(u); if (!m) return null;
  const bin = atob(m[2]); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return new Blob([out], { type: m[1] });
}

const tried = new Set<string>();
/** Executa quando o navegador estiver ocioso (não compete com a abertura da tela). */
const whenIdle = (fn: () => void, delay = 2500) => {
  const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  setTimeout(() => (ric ? ric(fn, { timeout: 5000 }) : fn()), delay);
};

/** URL exibível da logo personalizada (ou null → monograma padrão). */
export function useBrandLogo(): string | null {
  const { settings, save } = useSettings();
  const path = settings.logo_path ?? null;
  const [url, setUrl] = React.useState<string | null>(() => (path?.startsWith('data:image/') ? path : null));
  React.useEffect(() => {
    let alive = true;
    resolveLogo(path).then((r) => {
      if (!alive) return;
      setUrl(r?.url ?? null);
      // Logo pesada salva antes da otimização (ex.: PNG de 3,5 MB): troca, uma vez, por uma versão leve.
      // O arquivo original continua no Storage. Feito com o app ocioso.
      const heavy = r?.blob ?? (path?.startsWith('data:') && path.length > LOGO_HEAVY_BYTES * 1.37 ? dataUrlToBlob(path) : null);
      if (path && heavy && heavy.size > LOGO_HEAVY_BYTES && !tried.has(path)) {
        tried.add(path);
        whenIdle(() => { void optimizeStoredLogo(heavy).then((np) => (np ? save({ logo_path: np }) : undefined)).catch(() => { /* tenta de novo na próxima abertura */ }); });
      }
    }).catch(() => { if (alive) setUrl(null); });
    return () => { alive = false; };
  }, [path]); // eslint-disable-line react-hooks/exhaustive-deps
  return url;
}

/** Usa a logo personalizada também como ícone do app (aba e atalho na tela inicial). Chamar uma vez, no layout. */
export function useAppIcon() {
  const url = useBrandLogo();
  // Gerar os ícones (canvas) é trabalho pesado: espera o app ficar ocioso para não atrasar a abertura.
  // Voltar ao ícone padrão é imediato (não processa imagem).
  React.useEffect(() => {
    if (!url) { void applyAppIcon(null); return; }
    let on = true; whenIdle(() => { if (on) void applyAppIcon(url); }, 1200); return () => { on = false; };
  }, [url]);
}

/** Logo da Central: personalizada (Configurações) ou o monograma "CP". */
export function BrandLogo({ size = 40 }: { size?: number }) {
  const url = useBrandLogo();
  if (!url) return <Monogram size={size} />;
  return <img src={url} alt="Logo da Central" width={size} height={size} decoding="async" className="shrink-0 rounded-xl object-contain" style={{ width: size, height: size }} />;
}
