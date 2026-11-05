import { useEffect, useMemo, useState } from 'react';
import { useCollection } from '@/data/store';
import { DEFAULT_SETTINGS } from '@/domain/defaults';
import type { Settings } from '@/domain/types';
import { recifeParts } from '@/lib/time';
import type { Workday } from '@/lib/workday';

export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => recifeParts());
  useEffect(() => { const t = setInterval(() => setNow(recifeParts()), intervalMs); return () => clearInterval(t); }, [intervalMs]);
  return now;
}

export function useSettings() {
  const c = useCollection('settings');
  const settings: Settings = (c.items[0] ?? { ...DEFAULT_SETTINGS, id: '', created_at: '', updated_at: '' }) as Settings;
  const workday: Workday = { start: settings.workday_start, end: settings.workday_end, break_start: settings.break_start, break_end: settings.break_end };
  const save = (patch: Partial<Settings>) => (c.items[0] ? c.update(c.items[0].id, patch) : c.create({ ...DEFAULT_SETTINGS, ...patch }));
  return { settings, workday, save, loading: c.loading, error: c.error };
}

export function useInstitutions() {
  const c = useCollection('institutions');
  const byId = useMemo(() => Object.fromEntries(c.items.map((i) => [i.id, i])), [c.items]);
  const active = c.items.filter((i) => i.active);
  return { ...c, byId, active, options: active.map((i) => ({ value: i.id, label: i.name })) };
}
