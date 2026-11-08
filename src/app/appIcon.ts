/**
 * Ícone do app (aba do navegador e atalho na tela inicial) = logo enviada em Configurações → Identidade visual.
 *
 * - Sem logo personalizada: ficam os ícones padrão (monograma CP) do index.html e de /manifest.webmanifest.
 * - Com logo: gera ícones quadrados PNG a partir dela (fundo escuro, logo centralizada com margem) e troca:
 *   o favicon, o apple-touch-icon (iPhone/iPad) e o manifesto (Android/Chrome), que passa a ser um manifesto
 *   gerado aqui mesmo (blob:, permitido pela CSP em manifest-src) com os ícones da logo.
 * O celular grava o ícone no momento em que o atalho é criado: para trocar o ícone de um atalho antigo, é preciso
 * remover o atalho e adicionar de novo depois de enviar a logo.
 */
const BG = '#0B0B0D';
const DEFAULT_MANIFEST = '/manifest.webmanifest';

/**
 * Cor de fundo do ícone: se os 4 cantos da logo forem opacos e da mesma cor (logo com fundo próprio, ex.: branco),
 * usa essa cor — assim o ícone não vira "uma caixa dentro de outra". Logo transparente: fundo escuro da Central.
 */
export function backgroundFor(img: HTMLImageElement): string {
  try {
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d', { willReadFrequently: true }); if (!g) return BG;
    g.drawImage(img, 0, 0);
    const pts = [[0, 0], [c.width - 1, 0], [0, c.height - 1], [c.width - 1, c.height - 1]].map(([x, y]) => g.getImageData(x, y, 1, 1).data);
    if (pts.some((d) => d[3] < 240)) return BG;
    const close = pts.every((d) => Math.abs(d[0] - pts[0][0]) + Math.abs(d[1] - pts[0][1]) + Math.abs(d[2] - pts[0][2]) < 30);
    return close ? `rgb(${pts[0][0]}, ${pts[0][1]}, ${pts[0][2]})` : BG;
  } catch { return BG; }
}

/** Desenha a imagem centralizada num quadrado; `pad` = margem (fração do lado). */
function squarePng(img: HTMLImageElement, size: number, pad: number, bg = BG): string {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  if (!g) throw new Error('canvas indisponível');
  g.fillStyle = bg; g.fillRect(0, 0, size, size);
  const box = size * (1 - 2 * pad);
  const k = Math.min(box / img.naturalWidth, box / img.naturalHeight);
  const w = img.naturalWidth * k, h = img.naturalHeight * k;
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
  return c.toDataURL('image/png');
}

const loadImage = (src: string) => new Promise<HTMLImageElement>((res, rej) => {
  const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('logo ilegível')); i.src = src;
});

/** Link <link rel=...> marcado como gerenciado por este módulo (cria se não existir). */
function link(rel: string, attrs: Record<string, string>): HTMLLinkElement {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"][data-app-icon]`);
  if (!el) { el = document.createElement('link'); el.rel = rel; el.dataset.appIcon = ''; document.head.appendChild(el); }
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

let manifestBlob: string | null = null;
let applied: string | null = null;
/** Ícones padrão do index.html, guardados para voltar a eles quando a logo for removida. */
let defaults: HTMLLinkElement[] | null = null;

/** Ícones gerados a partir da logo (exportado para teste). */
export async function buildIcons(src: string) {
  const img = await loadImage(src);
  const bg = backgroundFor(img);
  return {
    favicon: squarePng(img, 64, 0.06, bg),
    apple: squarePng(img, 180, 0.1, bg),
    i192: squarePng(img, 192, 0.1, bg),
    i512: squarePng(img, 512, 0.1, bg),
    maskable: squarePng(img, 512, 0.2, bg), // zona segura do Android (recorte em círculo)
  };
}

/** Aplica a logo como ícone do app; `null` volta ao monograma padrão. Nunca lança erro. */
export async function applyAppIcon(logoUrl: string | null): Promise<void> {
  if (typeof document === 'undefined' || applied === logoUrl) return;
  applied = logoUrl;
  defaults ??= [...document.head.querySelectorAll<HTMLLinkElement>('link[rel="icon"]:not([data-app-icon]), link[rel="apple-touch-icon"]:not([data-app-icon])')];
  const manifest = document.head.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  try {
    if (!logoUrl) throw new Error('padrão');
    const icons = await buildIcons(logoUrl);
    if (applied !== logoUrl) return; // outra troca começou enquanto gerava
    defaults.forEach((l) => l.remove()); // sem concorrência: o navegador só vê os ícones da logo
    link('icon', { type: 'image/png', sizes: '64x64', href: icons.favicon });
    link('apple-touch-icon', { href: icons.apple });
    const res = await fetch(DEFAULT_MANIFEST).then((r) => r.json()).catch(() => ({}));
    const json = { ...res, icons: [
      { src: icons.i192, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: icons.i512, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: icons.maskable, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ], start_url: `${location.origin}/`, scope: `${location.origin}/` };
    const url = URL.createObjectURL(new Blob([JSON.stringify(json)], { type: 'application/manifest+json' }));
    if (manifestBlob) URL.revokeObjectURL(manifestBlob);
    manifestBlob = url;
    if (manifest) manifest.href = url;
  } catch {
    // Sem logo (ou logo ilegível): volta tudo ao padrão.
    document.head.querySelectorAll('link[data-app-icon]').forEach((l) => l.remove());
    defaults?.forEach((l) => { if (!l.isConnected) document.head.appendChild(l); });
    if (manifest) manifest.href = DEFAULT_MANIFEST;
    if (manifestBlob) { URL.revokeObjectURL(manifestBlob); manifestBlob = null; }
  }
}
