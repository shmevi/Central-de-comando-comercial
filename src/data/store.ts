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
/**
 * "Geração" do cache: resetStore() troca a geração e respostas de leituras antigas que chegarem depois são
 * descartadas (sem isso, uma leitura disparada antes de sair/entrar da conta poderia gravar dados velhos).
 */
let generation = 0;
const inflight = new Map<Collection, Promise<void>>();

export function load<C extends Collection>(c: C, force = false): Promise<void> {
  const s = get(c);
  if (!force && s.loaded) return Promise.resolve();
  if (!force && inflight.has(c)) return inflight.get(c)!; // mesma leitura já em andamento: reaproveita
  const g = generation;
  set(c, { loading: true, error: null });
  const p = repo(c).list()
    .then((items) => { if (g === generation) set(c, { items, loading: false, loaded: true }); })
    .catch((e) => { if (g === generation) set(c, { loading: false, loaded: true, error: (e as Error).message }); })
    .finally(() => { if (inflight.get(c) === p) inflight.delete(c); });
  inflight.set(c, p);
  return p;
}

/** Carrega várias coleções em paralelo, sem lançar erro (cada coleção guarda o próprio erro). */
export const prefetch = (cs: readonly Collection[]) => Promise.all(cs.map((c) => load(c)));
/** Erro da última leitura da coleção (null = sem erro). */
export function getError(c: Collection): string | null { return get(c).error; }
/** Leitura síncrona do que já está carregado em memória. */
export function getItems<C extends Collection>(c: C): EntityMap[C][] { return get(c).items; }

/**
 * Limpa o cache. `notify=true` faz as telas abertas recarregarem (ex.: depois de importar um backup).
 * Ao sair da conta use `notify=false`: as telas estão sendo fechadas e não devem pedir dados sem login.
 */
export function resetStore(notify = true) {
  generation++; inflight.clear();
  for (const c of [...states.keys()]) {
    states.set(c, { items: [], loaded: false, loading: false, error: null });
    if (notify) listeners.get(c)?.forEach((l) => l());
  }
}

export const actions = {
  async create<C extends Collection>(c: C, input: any): Promise<EntityMap[C]> {
    const item = await repo(c).create(input);
    set(c, { items: [...get(c).items, item] });
    return item;
  },
  async createMany<C extends Collection>(c: C, inputs: any[]): Promise<EntityMap[C][]> {
    if (!inputs.length) return [];
    const made = await repo(c).createMany(inputs);
    set(c, { items: [...get(c).items, ...made] });
    return made;
  },
  /**
   * Otimista: a tela muda NA HORA e o servidor confirma depois. Se o servidor recusar, o item volta ao que era
   * e o erro é relançado (quem chamou mostra a mensagem, como antes).
   */
  async update<C extends Collection>(c: C, id: string, patch: Partial<EntityMap[C]>): Promise<EntityMap[C]> {
    const before = get(c).items.find((i) => i.id === id);
    if (before) set(c, { items: get(c).items.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
    try {
      const item = await repo(c).update(id, patch);
      set(c, { items: get(c).items.map((i) => (i.id === id ? item : i)) });
      return item;
    } catch (e) {
      if (before) set(c, { items: get(c).items.map((i) => (i.id === id ? before : i)) });
      throw e;
    }
  },
  /** Otimista: some da tela na hora; se o servidor recusar, volta para a mesma posição. */
  async remove<C extends Collection>(c: C, id: string) {
    const list = get(c).items; const idx = list.findIndex((i) => i.id === id); const before = list[idx];
    if (before) set(c, { items: list.filter((i) => i.id !== id) });
    try { await repo(c).remove(id); }
    catch (e) {
      if (before && !get(c).items.some((i) => i.id === id)) { const now = [...get(c).items]; now.splice(Math.min(idx, now.length), 0, before); set(c, { items: now }); }
      throw e;
    }
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
  // Recarrega sempre que a coleção não estiver carregada (inclusive após resetStore, ex.: importar backup).
  useEffect(() => { if (!state.loaded) load(c); }, [c, state.loaded]);
  return {
    ...state,
    create: (input: any) => actions.create(c, input),
    update: (id: string, patch: Partial<EntityMap[C]>) => actions.update(c, id, patch),
    remove: (id: string) => actions.remove(c, id),
    reload: () => load(c, true),
  };
}
