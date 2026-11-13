import { describe, expect, it, vi } from 'vitest';
vi.mock('@/data/store', () => ({ getItems: () => [], load: async () => {} }));
vi.mock('@/app/hooks', () => ({ useSettings: () => ({}) }));
import { AUTO_SYNC_MINUTES, isDue } from './autoSync';

describe('leitura automática do Notion: hora de ler?', () => {
  const now = Date.parse('2026-11-13T12:00:00Z');
  const ago = (min: number) => new Date(now - min * 60_000).toISOString();
  it('nunca leu → lê', () => { expect(isDue(null, 0, now)).toBe(true); });
  it(`só lê de novo depois de ${AUTO_SYNC_MINUTES} minutos`, () => {
    expect(isDue(ago(3), 0, now)).toBe(false);
    expect(isDue(ago(AUTO_SYNC_MINUTES), 0, now)).toBe(true);
  });
  it('outra aba que acabou de tentar segura a leitura', () => {
    expect(isDue(ago(30), now - 60_000, now)).toBe(false);
  });
});
