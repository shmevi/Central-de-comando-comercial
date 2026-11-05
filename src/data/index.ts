import type { Collection, EntityMap } from '@/domain/types';
import type { Repository } from './repository';
import { LocalRepository } from './localRepository';
import { SupabaseRepository } from './supabaseRepository';
import { DATA_MODE } from './supabaseClient';

const cache = new Map<Collection, Repository<any>>();
export function repo<C extends Collection>(c: C): Repository<EntityMap[C]> {
  if (!cache.has(c)) cache.set(c, DATA_MODE === 'supabase' ? new SupabaseRepository(c) : new LocalRepository(c));
  return cache.get(c)!;
}
export { DATA_MODE };
