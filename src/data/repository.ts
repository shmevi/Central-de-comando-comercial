import type { BaseEntity, Collection } from '@/domain/types';

/** Contrato da camada de dados. A UI nunca fala diretamente com o Supabase. */
export interface ListOptions {
  /** true = tudo, ignorando o limite de "recentes" da coleção (backup/exportação). */
  all?: boolean;
}

export interface Repository<T extends BaseEntity> {
  list(opts?: ListOptions): Promise<T[]>;
  create(input: Omit<T, 'id' | 'created_at' | 'updated_at'> & Partial<Pick<T, 'id'>>): Promise<T>;
  /** Várias criações numa ida ao servidor (ex.: sincronização, backup). Devolve na mesma ordem. */
  createMany(inputs: (Omit<T, 'id' | 'created_at' | 'updated_at'> & Partial<Pick<T, 'id'>>)[]): Promise<T[]>;
  update(id: string, patch: Partial<T>): Promise<T>;
  remove(id: string): Promise<void>;
}

/**
 * Coleções que crescem sem parar e só precisam do histórico recente na tela: o app carrega os N últimos
 * (o backup continua levando tudo, com `list({ all: true })`).
 */
export const RECENT_LIMIT: Partial<Record<Collection, number>> = { sync_logs: 300 };

export class RepositoryError extends Error {
  constructor(message: string, public cause?: unknown) { super(message); }
}
