/**
 * Logo personalizada da Central.
 * - Modo Supabase: arquivo no bucket privado "branding" (Storage), na pasta do próprio usuário (<user_id>/...).
 *   O caminho fica em settings.logo_path → persiste entre sessões e dispositivos. RLS do Storage restringe ao dono.
 * - Modo local: a imagem fica em settings.logo_path como data URL (só neste navegador).
 * A UI usa apenas estas funções; nunca chama o Storage diretamente.
 */
import { DATA_MODE } from './index';
import { supabase } from './supabaseClient';

export const LOGO_BUCKET = 'branding';
export const LOGO_MIME = ['image/png', 'image/jpeg', 'image/webp'] as const;
export const LOGO_ACCEPT = '.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp';
export const LOGO_MAX_BYTES = 5 * 1024 * 1024;          // igual ao limite do bucket (migration 0004)
export const LOGO_MAX_BYTES_LOCAL = 1024 * 1024;         // localStorage tem pouco espaço (~5 MB no total)
/** "5 MB", "1 MB"… para mostrar na tela. */
export const fmtLimit = (bytes: number) => (bytes >= 1024 * 1024 ? `${Math.round(bytes / (1024 * 1024))} MB` : `${Math.round(bytes / 1024)} KB`);
const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

/** Confere o tipo pelos primeiros bytes (não confia só na extensão/MIME informado pelo navegador). */
export function sniffImageType(b: Uint8Array): (typeof LOGO_MIME)[number] | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP') return 'image/webp';
  return null;
}

export async function validateLogo(file: File, mode = DATA_MODE): Promise<{ ok: true; type: (typeof LOGO_MIME)[number] } | { ok: false; error: string }> {
  const max = mode === 'supabase' ? LOGO_MAX_BYTES : LOGO_MAX_BYTES_LOCAL;
  if (file.size === 0) return { ok: false, error: 'Arquivo vazio.' };
  if (file.size > max) return { ok: false, error: `Imagem grande demais (máx. ${fmtLimit(max)}).` };
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const type = sniffImageType(head);
  if (!type) return { ok: false, error: 'Formato não aceito. Use PNG, JPG/JPEG ou WEBP.' };
  return { ok: true, type };
}

const readDataUrl = (file: Blob) => new Promise<string>((res, rej) => {
  const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error('Não foi possível ler a imagem.')); r.readAsDataURL(file);
});

// ------------------------------------------------------------------ otimização (desempenho)
/** Lado máximo da logo guardada: suficiente para a barra lateral e para o ícone do app (512 px). */
export const LOGO_MAX_SIDE = 512;
/** Acima disto a logo é considerada pesada e é otimizada (inclusive a que já estava salva). */
export const LOGO_HEAVY_BYTES = 300 * 1024;

/** Tamanho que cabe em `max`×`max` mantendo a proporção (nunca aumenta). */
export function fitWithin(w: number, h: number, max = LOGO_MAX_SIDE): { w: number; h: number } {
  const k = Math.min(1, max / Math.max(w, h, 1));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/**
 * Reduz a logo para no máximo 512 px e WebP (com transparência). Ex.: PNG de 3,5 MB → ~50 KB.
 * Se o navegador não conseguir (ou o resultado não ficar menor), devolve o arquivo original.
 */
export async function optimizeLogo(input: Blob): Promise<Blob> {
  try {
    if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return input;
    const bmp = await createImageBitmap(input);
    const { w, h } = fitWithin(bmp.width, bmp.height);
    if (w === bmp.width && h === bmp.height && input.size <= LOGO_HEAVY_BYTES) { bmp.close?.(); return input; }
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); if (!g) return input;
    g.imageSmoothingQuality = 'high'; g.drawImage(bmp, 0, 0, w, h); bmp.close?.();
    const out = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/webp', 0.9));
    const best = out && LOGO_MIME.includes(out.type as (typeof LOGO_MIME)[number]) ? out
      : await new Promise<Blob | null>((res) => c.toBlob(res, 'image/png')); // navegador sem WebP
    return best && best.size < input.size ? best : input;
  } catch { return input; }
}

/** Envia um arquivo (já validado) ao Storage, na pasta do usuário, e devolve o caminho. */
async function storeLogo(blob: Blob, type: (typeof LOGO_MIME)[number]): Promise<string> {
  const sb = supabase();
  const uid = (await sb.auth.getSession()).data.session?.user.id;
  if (!uid) throw new Error('Sessão expirada. Entre novamente para trocar a logo.');
  const path = `${uid}/logo-${Date.now()}.${EXT[type]}`;
  // Caminho novo a cada troca → o arquivo nunca muda: pode ficar em cache por 1 ano
  const { error } = await sb.storage.from(LOGO_BUCKET).upload(path, blob, { contentType: type, upsert: false, cacheControl: '31536000' });
  if (error) throw new Error(error.message.includes('Bucket not found')
    ? 'Armazenamento da logo não configurado: aplique a migration 0003 no Supabase.'
    : `Falha ao enviar a logo: ${error.message}`);
  return path;
}

/** Envia a imagem (otimizada) e devolve o valor a gravar em settings.logo_path. */
export async function uploadLogo(file: File): Promise<string> {
  const v = await validateLogo(file);
  if (!v.ok) throw new Error(v.error);
  const opt = await optimizeLogo(new Blob([file], { type: v.type }));
  const type = (LOGO_MIME as readonly string[]).includes(opt.type) ? opt.type as (typeof LOGO_MIME)[number] : v.type;
  if (DATA_MODE !== 'supabase') return readDataUrl(opt);
  return storeLogo(opt, type);
}

/**
 * Logo já salva e pesada (ex.: PNG de vários MB enviado antes da otimização): gera a versão leve e devolve o
 * NOVO caminho (o arquivo original continua no Storage, não é apagado). null = nada a fazer.
 */
export async function optimizeStoredLogo(blob: Blob): Promise<string | null> {
  if (blob.size <= LOGO_HEAVY_BYTES) return null;
  const opt = await optimizeLogo(blob);
  if (opt === blob || opt.size > blob.size * 0.8) return null;
  if (DATA_MODE !== 'supabase') return readDataUrl(opt);
  return storeLogo(opt, (LOGO_MIME as readonly string[]).includes(opt.type) ? opt.type as (typeof LOGO_MIME)[number] : 'image/png');
}

/** Apaga o arquivo antigo do Storage (no modo local não há arquivo). Falha aqui não é crítica. */
export async function removeLogoFile(path: string | null | undefined): Promise<void> {
  if (!path || path.startsWith('data:') || DATA_MODE !== 'supabase') return;
  await supabase().storage.from(LOGO_BUCKET).remove([path]);
}

const memory = new Map<string, string>();
const LOCAL_KEY = 'ccc:logo-cache:';
/** Cópia leve da logo neste aparelho (data URL), para abrir o app sem baixar a logo de novo. */
function readCached(path: string): string | null {
  try { return localStorage.getItem(LOCAL_KEY + path); } catch { return null; }
}
function writeCached(path: string, dataUrl: string) {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(LOCAL_KEY)) localStorage.removeItem(k); // só a logo atual
    if (dataUrl.length <= 400 * 1024) localStorage.setItem(LOCAL_KEY + path, dataUrl);
  } catch { /* armazenamento cheio ou bloqueado: segue sem cópia local */ }
}

/**
 * Converte settings.logo_path numa URL exibível (data: ou blob:, ambas permitidas pela CSP).
 * Ordem: memória → cópia no aparelho → Storage. `blob` vem junto quando a logo foi baixada (para otimizar a pesada).
 */
export async function resolveLogo(path: string | null | undefined): Promise<{ url: string; blob?: Blob } | null> {
  if (!path) return null;
  if (path.startsWith('data:image/')) return { url: path };
  if (DATA_MODE !== 'supabase') return null;
  const hit = memory.get(path) ?? readCached(path);
  if (hit) { memory.set(path, hit); return { url: hit }; }
  const { data, error } = await supabase().storage.from(LOGO_BUCKET).download(path);
  if (error || !data) return null;
  const url = data.size <= LOGO_HEAVY_BYTES ? await readDataUrl(data) : URL.createObjectURL(data);
  memory.set(path, url);
  if (url.startsWith('data:')) writeCached(path, url);
  return { url, blob: data };
}
export async function resolveLogoUrl(path: string | null | undefined): Promise<string | null> {
  return (await resolveLogo(path))?.url ?? null;
}
