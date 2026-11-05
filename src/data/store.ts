import { useEffect, useSyncExternalStore, useCallback } from 'react';
import type { Collection, EntityMap } from '@/domain/types';
import { repo } from './index';

type State<T> = { items: T[]; loading: boolean; loaded: boolean; error: string | null };
const states = new Map<Collection, State<any>>();
const listeners = new Map<Collection, Set<() => void>>();

function get<C extends Collection>(c: C): State<EntityMap[C]> {
  if (!states.has(c)) states.set(c, { items: [], loading: false, loaded: false, error: null });
  return states.get(c)!;
}
function set<C extends Collection>(c: C, patch: Partial<State<EntityMap[C]>>) {
  states.set(c, { ...get(c), ...patch });
  listeners.get(c)?.forEach((l) => l());
}
export async function load<C extends Collection>(c: C, force = false) {
  const s = get(c);
  if ((s.loaded || s.loading) && !force) return;
  set(c, { loading: true, error: null });
  try { set(c, { items: await repo(c).list(), loading: false, loaded: true }); }
  catch (e) { set(c, { loading: false, loaded: true, error: (e as Error).message }); }
}
export function resetStore() { [...states.keys()].forEach((c) => set(c, { items: [], loaded: false, loading: false, error: null })); }

export const actions = {
  async create<C extends Collection>(c: C, input: any): Promise<EntityMap[C]> {
    const item = await repo(c).create(input);
    set(c, { items: [...get(c).items, item] });
    return item;
  },
  async update<C extends Collection>(c: C, id: string, patch: Partial<EntityMap[C]>): Promise<EntityMap[C]> {
    const item = await repo(c).update(id, patch);
    set(c, { items: get(c).items.map((i) => (i.id === id ? item : i)) });
    return item;
  },
  async remove<C extends Collection>(c: C, id: string) {
    await repo(c).remove(id);
    set(c, { items: get(c).items.filter((i) => i.id !== id) });
  },
};

/** Hook reativo para uma coleção. */
export function useCollection<C extends Collection>(c: C) {
  const subscribe = useCallback((l: () => void) => {
    if (!listeners.has(c)) listeners.set(c, new Set());
    listeners.get(c)!.add(l);
    return () => listeners.get(c)!.delete(l);
  }, [c]);
  const state = useSyncExternalStore(subscribe, () => get(c));
  useEffect(() => { load(c); }, [c]);
  return {
    ...state,
    create: (input: any) => actions.create(c, input),
    update: (id: string, patch: Partial<EntityMap[C]>) => actions.update(c, id, patch),
    remove: (id: string) => actions.remove(c, id),
    reload: () => load(c, true),
  };
}
