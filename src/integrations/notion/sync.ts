/**
 * Sincronização Notion → Central (somente leitura do Notion). Orquestra: consulta com filtro na origem
 * (barreira 1) → planejamento puro em plan.ts (barreira 2, mapeamentos, três vias) → gravação local.
 * Nada aqui escreve no Notion.
 */
import { actions } from '@/data/store';
import { repo } from '@/data';
import type { KeyResult, NotionConfig, NotionSyncState, Objective, ReviewQueueItem, Settings, Task } from '@/domain/types';
import { mergeById, nowIso, pool, uid } from '@/lib/utils';
import type { NotionAdapter } from './adapter';
import { checkNotionConfig, describeConfigProblem, isNotionId, normalizePageId, resolveNotionConfig } from './config';
import { readNotion, type NotionRead } from './pipeline';
import { planNotionSync, type StatePatch, type SyncPlan } from './plan';

export type SyncSummary = SyncPlan['counts'] & { person_id: string };

/**
 * De onde vem a leitura do Notion. Duas implementações:
 * - demonstração (modo local): o adaptador fictício, lido aqui mesmo no navegador;
 * - servidor (modo Supabase): a Edge Function notion-sync lê a API real com o token guardado lá e devolve só as
 *   páginas do responsável vinculado à conta (o person_id do vínculo prevalece sobre o digitado).
 */
export interface NotionReader {
  kind: NotionAdapter['kind'];
  isDemo: boolean;
  read(config: NotionConfig, states: NotionSyncState[]): Promise<{ read: NotionRead; person_id: string }>;
}

export const readerFromAdapter = (adapter: NotionAdapter): NotionReader => ({
  kind: adapter.kind, isDemo: adapter.isDemo,
  read: async (config, states) => ({ read: await readNotion(adapter, config, states, { bodies: true }), person_id: config.person_id }),
});

/** opts.quiet (leitura automática): não grava a linha de resumo no log quando nada mudou. */
export async function syncNotion(source: NotionAdapter | NotionReader, settings: Settings, saveSettings?: (patch: Partial<Settings>) => Promise<unknown>, opts: { quiet?: boolean } = {}): Promise<SyncSummary> {
  const reader: NotionReader = 'query' in source ? readerFromAdapter(source) : source;
  const config = resolveNotionConfig(settings);
  // Fail-closed: sem todos os IDs obrigatórios não há consulta nenhuma (e nenhum valor padrão é usado).
  const check = checkNotionConfig(config);
  if (!check.ok) {
    const msg = `Configuração do Notion incompleta (${describeConfigProblem(check)}). Nada foi lido.`;
    try { await actions.create('sync_logs', { source: 'notion', direction: 'leitura', entity: 'geral', status: 'erro', message: msg, is_demo_source: reader.isDemo }); } catch { /* ignora */ }
    throw new Error(msg);
  }
  const startedAt = nowIso();
  try {
    const [tasks, objectives, states, reviews] = await Promise.all([
      repo('tasks').list(), repo('objectives').list(), repo('notion_sync_state').list(), repo('review_queue').list(),
    ]);
    // Barreira 1 (filtro na origem), itens rastreados e Objetivos: ver pipeline.ts. Barreira 2: plan.ts.
    const got = await reader.read(config, states);
    if (!isNotionId(got.person_id)) throw new Error('Resposta inválida da leitura do Notion (responsável ausente). Nada foi gravado.');
    // Planeja com o responsável que a leitura usou de fato (no servidor, o do vínculo da conta).
    const effective = { ...config, person_id: normalizePageId(got.person_id) };
    const plan = await planNotionSync({
      config: effective, isDemo: reader.isDemo, now: startedAt, newId: uid,
      notion: { tarefas: got.read.tarefas, krs: got.read.krs, objetivos: got.read.objetivos }, missing: got.read.missing,
      local: { tasks, objectives, states, reviews },
    });
    await applyPlan(plan, states, reader.isDemo, opts.quiet);
    await saveSettings?.({ notion_config: { ...effective, last_sync_at: startedAt } });
    return { ...plan.counts, person_id: effective.person_id };
  } catch (e) {
    // O registro do erro não pode esconder o erro original (ex.: banco sem a migration 0002).
    try { await actions.create('sync_logs', { source: 'notion', direction: 'leitura', entity: 'geral', status: 'erro', message: (e as Error).message, is_demo_source: reader.isDemo }); } catch { /* ignora */ }
    throw e;
  }
}

/**
 * Grava o plano na Central. Criações vão EM LOTE (1 requisição por tipo) e alterações em paralelo (até 6 ao
 * mesmo tempo) — antes era uma requisição por vez (dezenas de idas e voltas numa sincronização).
 * Várias alterações do mesmo registro são juntadas numa só, para respostas fora de ordem não se sobrescreverem.
 */
async function applyPlan(plan: SyncPlan, states: NotionSyncState[], isDemo: boolean, quiet = false) {
  await Promise.all([actions.createMany('tasks', plan.taskCreates), actions.createMany('objectives', plan.objectiveCreates)]);
  await Promise.all([
    pool(mergeById(plan.taskUpdates), 6, (u) => actions.update('tasks', u.id, u.patch)),
    pool(mergeById(plan.objectiveUpdates), 6, (u) => actions.update('objectives', u.id, u.patch)),
  ]);
  await upsertStates(plan.states, states, isDemo);
  await actions.createMany('review_queue', plan.reviews);
  const c = plan.counts;
  if (quiet && plan.logs.length === 0) return; // leitura automática sem novidade: não enche o log
  await actions.createMany('sync_logs', [...plan.logs.map((l) => ({
    source: 'notion', direction: 'leitura', entity: l.entity, external_id: l.external_id, fields_changed: l.fields_changed, is_demo_source: isDemo,
    status: l.action === 'conflito' || l.action === 'revisao' || l.action === 'suspenso' ? 'revisao' : 'sucesso',
    message: LOG_TEXT[l.action],
  })), {
    source: 'notion', direction: 'leitura', entity: 'geral', is_demo_source: isDemo, external_id: null, fields_changed: null,
    status: c.tarefas.revisao + c.krs.revisao + c.tarefas.conflitos + c.krs.conflitos ? 'revisao' : 'sucesso',
    message: `Tarefas: ${c.tarefas.criados} nova(s), ${c.tarefas.atualizados} atualizada(s), ${c.tarefas.revisao} em revisão, ${c.tarefas.conflitos} conflito(s), ${c.tarefas.pendente_push} alterada(s) só na Central. `
      + `KRs: ${c.krs.criados} novo(s), ${c.krs.atualizados} atualizado(s), ${c.krs.revisao} em revisão, ${c.krs.conflitos} conflito(s). `
      + `Objetivos: ${c.objetivos.criados} novo(s). Ignorados (outros responsáveis ou sem responsável): ${c.fora_do_escopo}.`,
  }]);
}

const LOG_TEXT = { criado: 'Importado do Notion', atualizado: 'Atualizado pelo Notion', conflito: 'Conflito: alterado nos dois lados — enviado para revisão', revisao: 'Enviado para revisão', suspenso: 'Sincronização do item suspensa (muitas escritas seguidas)' } as const;

async function upsertStates(patches: StatePatch[], current: NotionSyncState[], isDemo = false) {
  const byPage = new Map(current.map((s) => [normalizePageId(s.notion_page_id), s]));
  const updates = patches.filter((p) => byPage.has(p.notion_page_id)).map((p) => ({ id: byPage.get(p.notion_page_id)!.id, patch: p }));
  const creates = patches.filter((p) => !byPage.has(p.notion_page_id)).map((p) => ({
    local_id: null, local_parent_id: null, notion_parent_id: null, pinned_parent_id: null, synced_hash: null, synced_snapshot: null,
    last_notion_edited_time: null, last_central_updated_at: null, last_synced_at: null, last_change_origin: null, echo_edited_time: null,
    sync_status: 'ok', write_count_window: 0, write_window_started_at: null, is_demo: isDemo, ...p,
  }));
  await Promise.all([actions.createMany('notion_sync_state', creates), pool(mergeById(updates), 6, (u) => actions.update('notion_sync_state', u.id, u.patch))]);
}

// ======================================================================== resolução da fila
async function stateOf(pageId: string) {
  return (await repo('notion_sync_state').list()).find((s) => normalizePageId(s.notion_page_id) === normalizePageId(pageId)) ?? null;
}
async function closeReview(item: ReviewQueueItem, resolution: ReviewQueueItem['resolution'], message: string) {
  await actions.update('review_queue', item.id, { resolved: true, resolution });
  await actions.create('sync_logs', { source: 'notion', direction: 'leitura', entity: item.entity, external_id: item.external_id, fields_changed: null, status: 'sucesso', message, is_demo_source: !!item.is_demo });
}

/** Descarta a pendência. Nada é alterado no Notion; se o problema continuar, o item volta na próxima leitura. */
export const discardReview = (item: ReviewQueueItem) => closeReview(item, 'descartado', `Revisão descartada: ${item.title}`);

/** KR com vários Objetivos: registra a escolha. A importação acontece na próxima sincronização. */
export async function chooseObjective(item: ReviewQueueItem, objectivePageId: string) {
  const options = ((item.payload.objectives as { id: string }[] | undefined) ?? []).map((o) => normalizePageId(o.id));
  if (!options.includes(normalizePageId(objectivePageId))) throw new Error('Objetivo fora das opções do Notion.');
  const st = await stateOf(item.external_id);
  const patch = { pinned_parent_id: normalizePageId(objectivePageId), sync_status: 'ok' as const };
  if (st) await actions.update('notion_sync_state', st.id, patch);
  else await upsertStates([{ entity: 'krs', notion_page_id: normalizePageId(item.external_id), ...patch }], [], !!item.is_demo);
  await closeReview(item, 'objetivo_escolhido', `Objetivo escolhido para o KR: ${item.title}`);
}

/** Conflito: manter o valor do Notion (aplica na Central) ou o da Central (fica pendente para a fase Central → Notion). */
export async function resolveConflict(item: ReviewQueueItem, keep: 'manter_notion' | 'manter_central') {
  const p = item.payload as { local_id: string; local_parent_id?: string; notion: Record<string, unknown>; notion_hash: string; notion_progress?: number | null };
  const st = await stateOf(item.external_id);
  if (keep === 'manter_notion') {
    if (item.entity === 'tarefas') {
      const t = (await repo('tasks').list()).find((x) => x.id === p.local_id) as Task | undefined;
      if (!t) throw new Error('A tarefa não existe mais na Central.');
      const n = p.notion as Pick<Task, 'title' | 'status' | 'priority' | 'due_date'>;
      await actions.update('tasks', t.id, { ...n, completed_at: n.status === 'concluida' ? (t.completed_at ?? nowIso()) : null, history: [...t.history, { at: nowIso(), action: 'Conflito resolvido: mantido o Notion' }] });
    } else {
      const o = (await repo('objectives').list()).find((x) => x.id === p.local_parent_id) as Objective | undefined;
      if (!o || !o.key_results.some((k) => k.id === p.local_id)) throw new Error('O KR não existe mais na Central.');
      await actions.update('objectives', o.id, { key_results: o.key_results.map((k): KeyResult => (k.id === p.local_id ? { ...k, ...p.notion, notion_progress: p.notion_progress ?? k.notion_progress ?? null } : k)) });
    }
  }
  const patch = { synced_hash: p.notion_hash, synced_snapshot: p.notion, last_synced_at: nowIso(), sync_status: keep === 'manter_notion' ? 'ok' as const : 'pendente_push' as const, last_change_origin: keep === 'manter_notion' ? 'notion' as const : 'central' as const };
  if (st) await actions.update('notion_sync_state', st.id, patch);
  await closeReview(item, keep, keep === 'manter_notion' ? `Conflito resolvido mantendo o Notion: ${item.title}` : `Conflito resolvido mantendo a Central (aguarda envio ao Notion): ${item.title}`);
}
