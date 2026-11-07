import type { SupabaseClient } from '@supabase/supabase-js';
import type { BaseEntity, Collection } from '@/domain/types';
import { Repository, RepositoryError } from './repository';
import { supabase } from './supabaseClient';

/** Menor que o max_rows padrão do Supabase (1000), para a última página nunca ser cortada. */
export const PAGE_SIZE = 500;

type PgError = { message: string; code?: string; details?: string | null; hint?: string | null } | null;

/** Traduz os erros mais comuns do PostgREST/PostgreSQL para algo que um usuário consiga resolver. */
export function friendlyDbError(e: PgError, action: string): string {
  const code = e?.code ?? '';
  const msg = (e?.message ?? '').toLowerCase();
  if (code === 'PGRST205' || code === '42P01' || msg.includes('could not find the table') || msg.includes('does not exist'))
    return `${action}: tabela não encontrada no banco. Aplique as migrations de supabase/migrations/ (em ordem: 0001, 0002…) no projeto Supabase.`;
  if (code === 'PGRST301' || code === 'PGRST303' || msg.includes('jwt expired')) return `${action}: sua sessão expirou. Saia e entre novamente.`;
  if (code === '42501') return `${action}: sem permissão (o registro não é seu ou a sessão expirou).`;
  if (code === '23505') return `${action}: já existe um registro igual.`;
  if (code === '23503') return `${action}: um registro relacionado não existe mais (pode ter sido excluído).`;
  if (code === '23514' || code === '23502') return `${action}: dados inválidos para o banco. Revise os campos obrigatórios.`;
  if (code.startsWith('22')) return `${action}: formato de dado inválido (data, número ou identificador).`;
  if (msg.includes('failed to fetch') || msg.includes('network')) return `${action}: sem conexão com o Supabase. Verifique a internet.`;
  return `${action}: ${e?.message ?? 'erro desconhecido'}`;
}

/** Campos que o banco controla sozinho (nunca enviados pelo app). */
const SERVER_FIELDS = ['user_id', 'created_at', 'updated_at'] as const;
const strip = (o: Record<string, unknown>, extra: string[] = []) => {
  const out = { ...o };
  for (const k of [...SERVER_FIELDS, ...extra]) delete out[k];
  return out;
};

/**
 * Repositório PostgreSQL via Supabase. user_id é preenchido pelo banco (default auth.uid())
 * e as políticas RLS garantem que cada usuário só vê os próprios registros.
 */
export class SupabaseRepository<T extends BaseEntity> implements Repository<T> {
  constructor(private table: Collection, private client: () => SupabaseClient = supabase) {}
  private fail(e: PgError, action: string): never {
    console.error(`[supabase:${this.table}] ${action}`, e);
    throw new RepositoryError(friendlyDbError(e, action), e);
  }
  /** Lê em páginas: o PostgREST limita cada resposta (padrão 1000 linhas) e cortaria a lista em silêncio. */
  async list() {
    const all: T[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await this.client().from(this.table).select('*')
        .order('created_at', { ascending: true }).order('id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) this.fail(error, 'Falha ao carregar');
      all.push(...((data ?? []) as T[]));
      if (!data || data.length < PAGE_SIZE) return all;
    }
  }
  async create(input: Omit<T, 'id' | 'created_at' | 'updated_at'> & Partial<Pick<T, 'id'>>) {
    const { data, error } = await this.client().from(this.table).insert(strip(input as Record<string, unknown>)).select().single();
    if (error) this.fail(error, 'Falha ao criar');
    return data as T;
  }
  async update(id: string, patch: Partial<T>) {
    const { data, error } = await this.client().from(this.table).update(strip(patch as Record<string, unknown>, ['id'])).eq('id', id).select().single();
    if (error) this.fail(error, 'Falha ao salvar');
    return data as T;
  }
  async remove(id: string) {
    const { error } = await this.client().from(this.table).delete().eq('id', id);
    if (error) this.fail(error, 'Falha ao excluir');
  }
}
