import type { BaseEntity, Collection } from '@/domain/types';
import { uid, nowIso } from '@/lib/utils';
import { RECENT_LIMIT, Repository, RepositoryError, type ListOptions } from './repository';

const PREFIX = 'ccc:v1:';

function read<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch { return []; }
}
function write<T>(key: string, items: T[]) {
  try { localStorage.setItem(PREFIX + key, JSON.stringify(items)); }
  catch (e) { throw new RepositoryError('Não foi possível salvar no armazenamento local do navegador.', e); }
}

/** Persistência no navegador (modo local/offline). */
export class LocalRepository<T extends BaseEntity> implements Repository<T> {
  constructor(private collection: Collection) {}
  async list(opts: ListOptions = {}) {
    const all = read<T>(this.collection);
    const recent = opts.all ? undefined : RECENT_LIMIT[this.collection];
    return recent ? all.slice(-recent) : all;
  }
  async create(input: any) {
    return (await this.createMany([input]))[0];
  }
  async createMany(inputs: any[]) {
    const now = nowIso();
    const made = inputs.map((input) => ({ ...input, id: input.id ?? uid(), created_at: now, updated_at: now, user_id: 'local' }) as T);
    write(this.collection, [...read<T>(this.collection), ...made]);
    return made;
  }
  async update(id: string, patch: Partial<T>) {
    const items = read<T>(this.collection);
    const idx = items.findIndex((i) => i.id === id);
    if (idx < 0) throw new RepositoryError('Registro não encontrado.');
    const item = { ...items[idx], ...patch, id, updated_at: nowIso() };
    items[idx] = item;
    write(this.collection, items);
    return item;
  }
  async remove(id: string) {
    write(this.collection, read<T>(this.collection).filter((i) => i.id !== id));
  }
}

export function localHasData(): boolean {
  try { return localStorage.getItem(PREFIX + 'settings') != null; } catch { return false; }
}
export function localClearAll() {
  try { Object.keys(localStorage).filter((k) => k.startsWith(PREFIX)).forEach((k) => localStorage.removeItem(k)); } catch { /* ignore */ }
}
