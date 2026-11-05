import type { KeyResult } from '@/domain/types';
/** Progresso só é calculado com meta válida (start/target/current numéricos e target ≠ start). */
export function krProgress(kr: KeyResult): number | null {
  const { start, target, current } = kr;
  if (start == null || target == null || current == null) return null;
  if ([start, target, current].some((n) => !Number.isFinite(n)) || target === start) return null;
  const p = ((current - start) / (target - start)) * 100;
  return Math.max(0, Math.min(100, Math.round(p)));
}
export function objectiveProgress(krs: KeyResult[]): number | null {
  const vals = krs.map(krProgress).filter((v): v is number => v != null);
  if (!vals.length) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}
