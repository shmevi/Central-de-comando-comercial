import * as React from 'react';
import { useSettings } from '@/app/hooks';
import { resolveLogoUrl } from '@/data/branding';
import { Monogram } from './Monogram';

/** URL exibível da logo personalizada (ou null → monograma padrão). */
export function useBrandLogo(): string | null {
  const { settings } = useSettings();
  const path = settings.logo_path ?? null;
  const [url, setUrl] = React.useState<string | null>(() => (path?.startsWith('data:image/') ? path : null));
  React.useEffect(() => {
    let alive = true;
    resolveLogoUrl(path).then((u) => { if (alive) setUrl(u); }).catch(() => { if (alive) setUrl(null); });
    return () => { alive = false; };
  }, [path]);
  return url;
}

/** Logo da Central: personalizada (Configurações) ou o monograma "CP". */
export function BrandLogo({ size = 40 }: { size?: number }) {
  const url = useBrandLogo();
  if (!url) return <Monogram size={size} />;
  return <img src={url} alt="Logo da Central" width={size} height={size} className="shrink-0 rounded-xl object-contain" style={{ width: size, height: size }} />;
}
