/**
 * Envio Central → Notion: validação e escrita, UMA página por vez. Puro em relação ao banco (não lê nem grava a
 * Central): roda no servidor (Edge Function notion-sync, modo "push", com a API real) e, no modo local, no navegador
 * com o adaptador de demonstração.
 *
 * Garantias (todas antes de qualquer escrita):
 * - só campos permitidos (Tarefas: título, status, prioridade, prazo, atribuição; KRs: título, status, meta, atual);
 * - a página é lida de novo no Notion e tem de ser da base configurada, não arquivada e do responsável (pelo ID);
 * - valores validados: status/prioridade só dos mapeamentos aprovados; status de KR só opções que existem na base;
 * - anti-sobrescrita: se o Notion mudou aquele campo desde a última sincronização (≠ base), NÃO escreve — vira conflito;
 * - nunca cria, arquiva ou apaga páginas; nunca altera responsável, objetivo, período ou conteúdo.
 */
import type { NotionConfig } from '@/domain/types';
import type { NotionPage, NotionWriteAdapter, NotionWriteValue } from './adapter';
import { PROPS, TASK_ATTRIBUTION_OPTIONS, TASK_PRIORITY_MAP, TASK_STATUS_MAP, normalizePageId, sortAttribution } from './config';
import { dateOf, isOwnedBy, isoDay, nameOf, namesOf, numberOf, textOf } from './mapping';
import { fromDataSource, minimizePage } from './pipeline';

export type PushEntity = 'tarefas' | 'krs';
export const PUSH_FIELDS = { tarefas: ['title', 'status', 'priority', 'due_date', 'attribution'], krs: ['title', 'status', 'target', 'current'] } as const satisfies Record<PushEntity, readonly string[]>;
export const MAX_PUSH = 50;

export interface PushChange {
  entity: PushEntity;
  page_id: string;
  /** Valores da Central (no formato da Central) dos campos a enviar. */
  fields: Record<string, unknown>;
  /** Valores desses campos na última sincronização (a "base" das três vias). */
  base: Record<string, unknown>;
}
export type PushStatus = 'enviado' | 'sem_mudanca' | 'conflito' | 'recusado' | 'erro';
export interface PushResult {
  entity: PushEntity;
  page_id: string;
  status: PushStatus;
  message?: string;
  written?: string[];
  conflicts?: string[];
  /** Página (minimizada) como ficou no Notion — para a Central atualizar o estado de sincronização. */
  page?: NotionPage;
}

const PRIORITY_TO_NOTION = Object.fromEntries(Object.entries(TASK_PRIORITY_MAP).map(([n, c]) => [c, n])) as Record<string, string>;
const STATUS_TO_NOTION = Object.fromEntries(Object.entries(TASK_STATUS_MAP).map(([n, c]) => [c, n])) as Record<string, string>;
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const propName = (entity: PushEntity, field: string) => (PROPS[entity] as Record<string, string>)[field];

/** Valor atual de um campo NA PÁGINA DO NOTION, convertido para o formato da Central (para comparar). */
export function notionFieldValue(entity: PushEntity, page: NotionPage, field: string): unknown {
  const v = page.properties[propName(entity, field)];
  if (field === 'title') return textOf(v);
  if (entity === 'tarefas') {
    if (field === 'status') { const n = nameOf(v); return n ? (TASK_STATUS_MAP[n] ?? `?${n}`) : null; }
    if (field === 'priority') { const n = nameOf(v); return n ? (TASK_PRIORITY_MAP[n] ?? `?${n}`) : null; }
    if (field === 'due_date') return dateOf(v).start;
    if (field === 'attribution') return sortAttribution(namesOf(v));
  } else {
    if (field === 'status') return nameOf(v);
    if (field === 'target' || field === 'current') return numberOf(v);
  }
  return undefined;
}

/** Valor da Central → valor de escrita do Notion. Devolve string de erro quando o valor não pode ir. */
function toNotion(entity: PushEntity, field: string, value: unknown, page: NotionPage, krStatus: string[] | null): NotionWriteValue | string {
  if (field === 'title') {
    const t = typeof value === 'string' ? value.trim() : '';
    if (!t) return 'título vazio';
    if (t.length > 2000) return 'título longo demais (máx. 2000 caracteres)';
    return { type: 'title', text: t };
  }
  if (entity === 'tarefas') {
    if (field === 'status') { const n = typeof value === 'string' ? STATUS_TO_NOTION[value] : undefined; return n ? { type: 'status', name: n } : `status sem correspondente no Notion (${String(value)})`; }
    if (field === 'priority') { const n = typeof value === 'string' ? PRIORITY_TO_NOTION[value] : undefined; return n ? { type: 'select', name: n } : `prioridade sem correspondente no Notion (${String(value)})`; }
    if (field === 'due_date') {
      if (value == null || value === '') return { type: 'date', start: null, end: null };
      const d = typeof value === 'string' ? isoDay(value) : null;
      if (!d || d !== value) return 'prazo inválido';
      const end = dateOf(page.properties[PROPS.tarefas.due_date]).end; // preserva o fim de um intervalo, se ainda fizer sentido
      return { type: 'date', start: d, end: end && end >= d ? end : null };
    }
    if (field === 'attribution') {
      if (!Array.isArray(value) || value.some((x) => typeof x !== 'string')) return 'atribuição inválida';
      const names = sortAttribution(value as string[]);
      const bad = names.filter((n) => !(TASK_ATTRIBUTION_OPTIONS as readonly string[]).includes(n));
      // Só opções que já existem na base: o Notion criaria uma opção nova com qualquer outro nome.
      return bad.length ? `atribuição desconhecida no Notion (${bad.join(', ')})` : { type: 'multi_select', names };
    }
  } else {
    if (field === 'status') {
      if (typeof value !== 'string' || !value.trim()) return 'status vazio (o Notion não aceita limpar o status)';
      return krStatus?.includes(value) ? { type: 'status', name: value } : `status "${value}" não existe na base de KRs do Notion`;
    }
    if (field === 'target' || field === 'current') {
      if (value == null) return { type: 'number', value: null };
      return typeof value === 'number' && Number.isFinite(value) ? { type: 'number', value } : 'número inválido';
    }
  }
  return `campo não permitido (${field})`;
}

function friendly(e: unknown): string {
  const status = (e as { status?: number }).status;
  if (status === 403) return 'O Notion recusou a alteração: a integração não tem permissão de EDIÇÃO nesta base (ative "Update content" na integração e compartilhe a base com ela).';
  if (status === 404) return 'Página não encontrada no Notion (apagada ou sem acesso).';
  if (status === 409) return 'O Notion estava atualizando esta página ao mesmo tempo. Tente de novo.';
  return (e as Error)?.message || 'Falha ao gravar no Notion.';
}

/** Confere o formato de um pedido vindo de fora (corpo da Edge Function). */
export function parseChanges(raw: unknown): PushChange[] | string {
  if (!Array.isArray(raw) || raw.length === 0) return 'Nenhuma alteração enviada.';
  if (raw.length > MAX_PUSH) return `No máximo ${MAX_PUSH} alterações por envio.`;
  const out: PushChange[] = [];
  for (const c of raw) {
    const entity = (c as PushChange)?.entity;
    const id = (c as PushChange)?.page_id;
    const fields = (c as PushChange)?.fields;
    const base = (c as PushChange)?.base;
    if (entity !== 'tarefas' && entity !== 'krs') return 'Entidade inválida (use tarefas ou krs).';
    if (typeof id !== 'string' || !/^[0-9a-f]{32}$/.test(normalizePageId(id))) return 'ID de página inválido.';
    if (!fields || typeof fields !== 'object' || Array.isArray(fields) || !base || typeof base !== 'object' || Array.isArray(base)) return 'Campos inválidos.';
    const allowed = PUSH_FIELDS[entity] as readonly string[];
    const keys = Object.keys(fields);
    if (!keys.length) return 'Alteração sem campos.';
    const bad = keys.filter((k) => !allowed.includes(k));
    if (bad.length) return `Campo não permitido: ${bad.join(', ')}.`;
    out.push({ entity, page_id: normalizePageId(id), fields: fields as Record<string, unknown>, base: base as Record<string, unknown> });
  }
  return out;
}

export async function applyPush(adapter: NotionWriteAdapter, config: NotionConfig, changes: PushChange[]): Promise<PushResult[]> {
  const results: PushResult[] = [];
  let krStatus: string[] | null = null;
  for (const ch of changes) {
    const r = (status: PushStatus, extra: Partial<PushResult> = {}): PushResult => ({ entity: ch.entity, page_id: ch.page_id, status, ...extra });
    try {
      const [page] = await adapter.retrieve(ch.entity, [ch.page_id]);
      if (!page) { results.push(r('recusado', { message: 'Página não encontrada no Notion (apagada ou sem acesso).' })); continue; }
      const ds = ch.entity === 'tarefas' ? config.tasks_data_source_id : config.krs_data_source_id;
      if (!fromDataSource(page, ds) || page.archived || !isOwnedBy(page, PROPS[ch.entity].responsible, config.person_id)) {
        // Sem dados da página na resposta: pode ser de outra pessoa.
        results.push(r('recusado', { message: 'Fora do escopo: a página não é sua, está arquivada ou é de outra base. Nada foi alterado.' }));
        continue;
      }
      const mini = minimizePage(page, ch.entity, config.person_id);
      const write: Record<string, NotionWriteValue> = {};
      const conflicts: string[] = [];
      const problems: string[] = [];
      for (const [field, value] of Object.entries(ch.fields)) {
        const now = notionFieldValue(ch.entity, page, field);
        if (same(now, value)) continue; // já está igual no Notion
        if (!same(now, ch.base[field])) { conflicts.push(field); continue; } // o Notion mudou desde a última sincronização
        if (ch.entity === 'krs' && field === 'status' && !krStatus) krStatus = await adapter.statusOptions('krs');
        const w = toNotion(ch.entity, field, value, page, krStatus);
        if (typeof w === 'string') problems.push(`${field}: ${w}`);
        else write[propName(ch.entity, field)] = w;
      }
      if (conflicts.length) { results.push(r('conflito', { conflicts, page: mini, message: 'Alterado no Notion e na Central desde a última sincronização. Nada foi sobrescrito.' })); continue; }
      if (problems.length) { results.push(r('recusado', { message: problems.join('; '), page: mini })); continue; }
      if (!Object.keys(write).length) { results.push(r('sem_mudanca', { page: mini })); continue; }
      const updated = await adapter.update(ch.entity, ch.page_id, write);
      const fieldsWritten = Object.keys(ch.fields).filter((f) => write[propName(ch.entity, f)]);
      results.push(r('enviado', { written: fieldsWritten, page: minimizePage(updated, ch.entity, config.person_id) }));
    } catch (e) {
      results.push(r('erro', { message: friendly(e) }));
    }
  }
  return results;
}
