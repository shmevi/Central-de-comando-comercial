import type { BaseEntity } from '@/domain/types';

/** Contrato da camada de dados. A UI nunca fala diretamente com o Supabase. */
export interface Repository<T extends BaseEntity> {
  list(): Promise<T[]>;
  create(input: Omit<T, 'id' | 'created_at' | 'updated_at'> & Partial<Pick<T, 'id'>>): Promise<T>;
  update(id: string, patch: Partial<T>): Promise<T>;
  remove(id: string): Promise<void>;
}

export class RepositoryError extends Error {
  constructor(message: string, public cause?: unknown) { super(message); }
}
