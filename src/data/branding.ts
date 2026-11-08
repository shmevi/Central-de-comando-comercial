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
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;          // igual ao limite do bucket na migration 0003
export const LOGO_MAX_BYTES_LOCAL = 700 * 1024;          // localStorage tem pouco espaço
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
  if (file.size > max) return { ok: false, error: `Imagem grande demais (máx. ${Math.round(max / 1024)} KB).` };
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const type = sniffImageType(head);
  if (!type) return { ok: false, error: 'Formato não aceito. Use PNG, JPG/JPEG ou WEBP.' };
  return { ok: true, type };
}

const readDataUrl = (file: Blob) => new Promise<string>((res, rej) => {
  const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error('Não foi possível ler a imagem.')); r.readAsDataURL(file);
});

/** Envia a imagem e devolve o valor a gravar em settings.logo_path. */
export async function uploadLogo(file: File): Promise<string> {
  const v = await validateLogo(file);
  if (!v.ok) throw new Error(v.error);
  if (DATA_MODE !== 'supabase') return readDataUrl(new Blob([file], { type: v.type }));
  const sb = supabase();
  const uid = (await sb.auth.getSession()).data.session?.user.id;
  if (!uid) throw new Error('Sessão expirada. Entre novamente para trocar a logo.');
  const path = `${uid}/logo-${Date.now()}.${EXT[v.type]}`;
  const { error } = await sb.storage.from(LOGO_BUCKET).upload(path, file, { contentType: v.type, upsert: false, cacheControl: '3600' });
  if (error) throw new Error(error.message.includes('Bucket not found')
    ? 'Armazenamento da logo não configurado: aplique a migration 0003 no Supabase.'
    : `Falha ao enviar a logo: ${error.message}`);
  return path;
}

/** Apaga o arquivo antigo do Storage (no modo local não há arquivo). Falha aqui não é crítica. */
export async function removeLogoFile(path: string | null | undefined): Promise<void> {
  if (!path || path.startsWith('data:') || DATA_MODE !== 'supabase') return;
  await supabase().storage.from(LOGO_BUCKET).remove([path]);
}

const cache = new Map<string, string>();
/** Converte settings.logo_path numa URL exibível (data: ou blob:, ambas permitidas pela CSP). */
export async function resolveLogoUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith('data:image/')) return path;
  if (DATA_MODE !== 'supabase') return null;
  if (cache.has(path)) return cache.get(path)!;
  const { data, error } = await supabase().storage.from(LOGO_BUCKET).download(path);
  if (error || !data) return null;
  const url = URL.createObjectURL(data);
  cache.set(path, url);
  return url;
}
