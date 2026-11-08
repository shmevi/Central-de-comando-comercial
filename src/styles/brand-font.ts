/**
 * Registra a fonte de identidade "Capture It" se o arquivo estiver em src/assets/fonts/ (ver README ali).
 * import.meta.glob devolve vazio quando o arquivo não existe: o build não quebra e os títulos usam o fallback.
 * A fonte é servida pelo próprio site (font-src 'self'); nenhum link de download é exposto na interface.
 */
const files = import.meta.glob('../assets/fonts/capture-it.{woff2,woff,ttf}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const order = ['woff2', 'woff', 'ttf'];
const url = order.map((ext) => Object.entries(files).find(([k]) => k.endsWith(`.${ext}`))?.[1]).find(Boolean);

export const BRAND_FONT_AVAILABLE = !!url;

if (url && typeof document !== 'undefined' && 'fonts' in document) {
  try {
    const face = new FontFace('Capture It', `url(${url})`, { display: 'swap' });
    document.fonts.add(face);
    face.load().catch(() => { /* sem a fonte, o fallback (Barlow Condensed) continua */ });
  } catch { /* navegador sem FontFace: fallback */ }
}
