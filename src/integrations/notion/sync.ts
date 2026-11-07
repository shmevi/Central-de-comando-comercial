/**
 * Sincronização Notion → Central (somente leitura do Notion). Orquestra: consulta com filtro na origem
 * (barreira 1) → planejamento puro em plan.ts (barreira 2, mapeamentos, três vias) → gravação local.
 * Nada aqui escreve no Notion.
 */
import { actions } from '@/data/store';
import { repo } from '@/data';
import type { KeyResult, NotionSyncEntity, NotionSyncState, Objective, ReviewQueueItem, Settings, Task } from '@/domain/types';
import { nowIso, uid } from '@/lib/utils';
import { queryAll, type NotionAdapter, type NotionPage } from './adapter';
import { ACTIVE_STATUS_GROUPS, PROPS, checkNotionConfig, describeConfigProblem, normalizePageId, resolveNotionConfig } from './config';
import { isOwnedBy, relationOf } from './mapping';
import { planNotionSync, type StatePatch, type SyncPlan } from './plan';

export type SyncSummary = SyncPlan['counts'];

export async function syncNotion(adapter: NotionAdapter, settings: Settings, saveSettings?: (patch: Partial<Settings>) => Promise<unknown>): Promise<SyncSummary> {
  const config = resolveNotionConfig(settings);
  // Fail-closed: sem todos os IDs obrigatórios não há consulta nenhuma (e nenhum valor padrão é usado).
  const check = checkNotionConfig(config);
  if (!check.ok) {
    const msg = `Configuração do Notion incompleta (${describeConfigProblem(check)}). Nada foi lido.`;
    try { await actions.create('sync_logs', { source: 'notion', direction: 'leitura', entity: 'geral', status: 'erro', message: msg, is_demo_source: adapter.isDemo }); } catch { /* ignora */ }
    throw new Error(msg);
  }
  const startedAt = nowIso();
  try {
    const [tasks, objectives, states, reviews] = await Promise.all([
      repo('tasks').list(), repo('objectives').list(), repo('notion_sync_state').list(), repo('review_queue').list(),
    ]);

    // Barreira 1: filtro na origem pelo ID estável + só itens ativos (escopo inicial).
    const base = { personId: config.person_id };
    const tarefas = await queryAll(adapter, 'tarefas', { ...base, dataSourceId: config.tasks_data_source_id, personProperty: PROPS.tarefas.responsible, statusProperty: PROPS.tarefas.status, statusGroups: ACTIVE_STATUS_GROUPS });
    const krs = await queryAll(adapter, 'krs', { ...base, dataSourceId: config.krs_data_source_id, personProperty: PROPS.krs.responsible, statusProperty: PROPS.krs.status, statusGroups: ACTIVE_STATUS_GROUPS });

    // Itens já rastreados que saíram do filtro (ex.: concluídos no Notion) são buscados um a um,
    // para a Central receber a mudança em vez de ficar com o estado antigo para sempre.
    // Não busca de novo o que saiu do escopo (outro responsável) ou foi apagado: nada de ler página alheia à toa.
    const SKIP = new Set(['removido_no_notion', 'fora_do_escopo', 'removido_na_central']);
    const tracked = (e: NotionSyncEntity) => states.filter((s) => s.entity === e && s.local_id && !SKIP.has(s.sync_status)).map((s) => normalizePageId(s.notion_page_id));
    const extra = async (source: 'tarefas' | 'krs', got: NotionPage[]) => {
      const have = new Set(got.map((p) => normalizePageId(p.id)));
      const want = tracked(source).filter((id) => !have.has(id));
      const found = want.length ? await adapter.retrieve(source, want) : [];
      const foundIds = new Set(found.map((p) => normalizePageId(p.id)));
      return { pages: found, missing: want.filter((id) => !foundIds.has(id)) };
    };
    const xt = await extra('tarefas', tarefas);
    const xk = await extra('krs', krs);
    const allKrs = [...krs, ...xk.pages];

    // Objetivos: só os referenciados por KRs que JÁ passaram pela barreira 2 (não busca nada por causa de KR alheio).
    const parentIds = [...new Set(allKrs.filter((p) => isOwnedBy(p, PROPS.krs.responsible, config.person_id)).flatMap((p) => relationOf(p.properties[PROPS.krs.objective])))];
    const objetivos = parentIds.length ? await adapter.retrieve('objetivos', parentIds) : [];

    const plan = await planNotionSync({
      config, isDemo: adapter.isDemo, now: startedAt, newId: uid,
      notion: { tarefas: [...tarefas, ...xt.pages], krs: allKrs, objetivos },
      missing: [...xt.missing, ...xk.missing],
      local: { tasks, objectives, states, reviews },
    });
    await applyPlan(plan, states, adapter.isDemo);
    await saveSettings?.({ notion_config: { ...config, last_sync_at: startedAt } });
    return plan.counts;
  } catch (e) {
    // O registro do erro não pode esconder o erro original (ex.: banco sem a migration 0002).
    try { await actions.create('sync_logs', { source: 'notion', direction: 'leitura', entity: 'geral', status: 'erro', message: (e as Error).message, is_demo_source: adapter.isDemo }); } catch { /* ignora */ }
    throw e;
  }
}

async function applyPlan(plan: SyncPlan, states: NotionSyncState[], isDemo: boolean) {
  for (const t of plan.taskCreates) await actions.create('tasks', t);
  for (const u of plan.taskUpdates) await actions.update('tasks', u.id, u.patch);
  for (const o of plan.objectiveCreates) await actions.create('objectives', o);
  for (const u of plan.objectiveUpdates) await actions.update('objectives', u.id, u.patch);
  await upsertStates(plan.states, states, isDemo);
  for (const r of plan.reviews) await actions.create('review_queue', r);
  for (const l of plan.logs) {
    await actions.create('sync_logs', {
      source: 'notion', direction: 'leitura', entity: l.entity, external_id: l.external_id, fields_changed: l.fields_changed, is_demo_source: isDemo,
      status: l.action === 'conflito' || l.action === 'revisao' || l.action === 'suspenso' ? 'revisao' : 'sucesso',
      message: LOG_TEXT[l.action],
    });
  }
  const c = plan.counts;
  await actions.create('sync_logs', {
    source: 'notion', direction: 'leitura', entity: 'geral', is_demo_source: isDemo, external_id: null, fields_changed: null,
    status: c.tarefas.revisao + c.krs.revisao + c.tarefas.conflitos + c.krs.conflitos ? 'revisao' : 'sucesso',
    message: `Tarefas: ${c.tarefas.criados} nova(s), ${c.tarefas.atualizados} atualizada(s), ${c.tarefas.revisao} em revisão, ${c.tarefas.conflitos} conflito(s), ${c.tarefas.pendente_push} alterada(s) só na Central. `
      + `KRs: ${c.krs.criados} novo(s), ${c.krs.atualizados} atualizado(s), ${c.krs.revisao} em revisão, ${c.krs.conflitos} conflito(s). `
      + `Objetivos: ${c.objetivos.criados} novo(s). Ignorados (outros responsáveis ou sem responsável): ${c.fora_do_escopo}.`,
  });
}

const LOG_TEXT = { criado: 'Importado do Notion', atualizado: 'Atualizado pelo Notion', conflito: 'Conflito: alterado nos dois lados — enviado para revisão', revisao: 'Enviado para revisão', suspenso: 'Sincronização do item suspensa (muitas escritas seguidas)' } as const;

async function upsertStates(patches: StatePatch[], current: NotionSyncState[], isDemo = false) {
  const byPage = new Map(current.map((s) => [normalizePageId(s.notion_page_id), s]));
  for (const p of patches) {
    const ex = byPage.get(p.notion_page_id);
    if (ex) await actions.update('notion_sync_state', ex.id, p);
    else await actions.create('notion_sync_state', {
      local_id: null, local_parent_id: null, notion_parent_id: null, pinned_parent_id: null, synced_hash: null, synced_snapshot: null,
      last_notion_edited_time: null, last_central_updated_at: null, last_synced_at: null, last_change_origin: null, echo_edited_time: null,
      sync_status: 'ok', write_count_window: 0, write_window_started_at: null, is_demo: isDemo, ...p,
    });
  }
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
