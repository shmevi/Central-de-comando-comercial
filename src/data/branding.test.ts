import { describe, it, expect } from 'vitest';
import { sniffImageType, validateLogo, LOGO_MAX_BYTES } from './branding';

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const webp = new Uint8Array([...'RIFF'].map((c) => c.charCodeAt(0)).concat([0, 0, 0, 0], [...'WEBP'].map((c) => c.charCodeAt(0))));
const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
const file = (bytes: Uint8Array, name: string, type: string) => new File([bytes as unknown as BlobPart], name, { type });

describe('logo personalizada', () => {
  it('identifica PNG, JPEG e WEBP pelos bytes', () => {
    expect(sniffImageType(png)).toBe('image/png');
    expect(sniffImageType(jpg)).toBe('image/jpeg');
    expect(sniffImageType(webp)).toBe('image/webp');
    expect(sniffImageType(svg)).toBeNull();
  });
  it('recusa SVG/HTML renomeado como .png e arquivo grande', async () => {
    expect((await validateLogo(file(svg, 'logo.png', 'image/png'), 'supabase')).ok).toBe(false);
    expect((await validateLogo(file(png, 'logo.png', 'image/png'), 'supabase')).ok).toBe(true);
    const big = new Uint8Array(LOGO_MAX_BYTES + 1); big.set(png);
    const r = await validateLogo(file(big, 'logo.png', 'image/png'), 'supabase');
    expect(r.ok).toBe(false);
  });
});

describe('limite da logo', () => {
  it('aceita até 5 MB no Supabase e 1 MB no modo local', async () => {
    const { LOGO_MAX_BYTES_LOCAL, fmtLimit } = await import('./branding');
    expect(LOGO_MAX_BYTES).toBe(5 * 1024 * 1024);
    expect(fmtLimit(LOGO_MAX_BYTES)).toBe('5 MB');
    expect(fmtLimit(LOGO_MAX_BYTES_LOCAL)).toBe('1 MB');
    const quatroMB = new Uint8Array(4 * 1024 * 1024); quatroMB.set(png);
    expect((await validateLogo(file(quatroMB, 'logo.png', 'image/png'), 'supabase')).ok).toBe(true);
    expect((await validateLogo(file(quatroMB, 'logo.png', 'image/png'), 'local')).ok).toBe(false);
  });
});

describe('otimização da logo', () => {
  it('reduz para caber em 512 px mantendo a proporção (nunca aumenta)', async () => {
    const { fitWithin } = await import('./branding');
    expect(fitWithin(3000, 1500)).toEqual({ w: 512, h: 256 });
    expect(fitWithin(800, 1600)).toEqual({ w: 256, h: 512 });
    expect(fitWithin(200, 100)).toEqual({ w: 200, h: 100 });
  });
});
