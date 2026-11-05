import type { BaseEntity, Collection } from '@/domain/types';
import { Repository, RepositoryError } from './repository';
import { supabase } from './supabaseClient';

/**
 * Repositório PostgreSQL via Supabase. user_id é preenchido pelo banco (default auth.uid())
 * e as políticas RLS garantem que cada usuário só vê os próprios registros.
 */
export class SupabaseRepository<T extends BaseEntity> implements Repository<T> {
  constructor(private table: Collection) {}
  private fail(e: { message: string } | null, msg: string): never {
    throw new RepositoryError(`${msg}: ${e?.message ?? 'erro desconhecido'}`, e);
  }
  async list() {
    const { data, error } = await supabase().from(this.table).select('*').order('created_at', { ascending: true });
    if (error) this.fail(error, 'Falha ao carregar');
    return (data ?? []) as T[];
  }
  async create(input: any) {
    const { user_id: _u, ...rest } = input;
    const { data, error } = await supabase().from(this.table).insert(rest).select().single();
    if (error) this.fail(error, 'Falha ao criar');
    return data as T;
  }
  async update(id: string, patch: Partial<T>) {
    const { id: _i, user_id: _u, created_at: _c, updated_at: _up, ...rest } = patch as any;
    const { data, error } = await supabase().from(this.table).update(rest).eq('id', id).select().single();
    if (error) this.fail(error, 'Falha ao salvar');
    return data as T;
  }
  async remove(id: string) {
    const { error } = await supabase().from(this.table).delete().eq('id', id);
    if (error) this.fail(error, 'Falha ao excluir');
  }
}
