/**
 * Leitura do Notion + planejamento, SEM gravar nada. Puro (sem React, sem banco): usado pelo navegador
 * (sync.ts, com o adaptador de demonstração) e pelo servidor (Edge Function notion-sync, com a API real).
 */
import type { NotionConfig, NotionSyncEntity, NotionSyncState } from '@/domain/types';
import { queryAll, type NotionAdapter, type NotionPage } from './adapter';
import { ACTIVE_STATUS_GROUPS, PROPS, normalizePageId } from './config';
import { isOwnedBy, relationOf } from './mapping';
import { planNotionSync, type PlanInput, type SyncPlan } from './plan';

export interface NotionRead {
  tarefas: NotionPage[];
  krs: NotionPage[];
  objetivos: NotionPage[];
  /** Páginas rastreadas que o Notion não devolveu (apagadas, arquivadas ou sem acesso). */
  missing: string[];
  /** Quantas vieram da consulta filtrada e quantas foram buscadas uma a uma por já estarem rastreadas. */
  counts: { tarefas: { consulta: number; rastreadas: number }; krs: { consulta: number; rastreadas: number }; objetivos: number };
}

/** A página veio da base configurada? (quando a origem informa a base) */
export const fromDataSource = (p: NotionPage, dataSourceId: string) =>
  !p.parent_data_source_id || normalizePageId(p.parent_data_source_id) === normalizePageId(dataSourceId);

/**
 * Barreira 1 (filtro na origem) + busca dos itens já rastreados + Objetivos dos KRs do responsável.
 * A configuração deve ter sido validada (checkNotionConfig) antes de chamar.
 */
export async function readNotion(adapter: NotionAdapter, config: NotionConfig, states: NotionSyncState[]): Promise<NotionRead> {
  const base = { personId: config.person_id, statusGroups: ACTIVE_STATUS_GROUPS };
  const tarefas = await queryAll(adapter, 'tarefas', { ...base, dataSourceId: config.tasks_data_source_id, personProperty: PROPS.tarefas.responsible, statusProperty: PROPS.tarefas.status });
  const krs = await queryAll(adapter, 'krs', { ...base, dataSourceId: config.krs_data_source_id, personProperty: PROPS.krs.responsible, statusProperty: PROPS.krs.status });

  // Itens já rastreados que saíram do filtro (ex.: concluídos no Notion) são buscados um a um, para a Central
  // receber a mudança. O que saiu do escopo (outro responsável) ou foi apagado não é buscado de novo.
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

  // Objetivos: só os referenciados por KRs que JÁ passaram pela barreira 2 (nada é buscado por causa de KR alheio).
  const parentIds = [...new Set(allKrs
    .filter((p) => fromDataSource(p, config.krs_data_source_id) && isOwnedBy(p, PROPS.krs.responsible, config.person_id))
    .flatMap((p) => relationOf(p.properties[PROPS.krs.objective])))];
  const objetivos = parentIds.length ? await adapter.retrieve('objetivos', parentIds) : [];

  return {
    tarefas: [...tarefas, ...xt.pages], krs: allKrs, objetivos, missing: [...xt.missing, ...xk.missing],
    counts: { tarefas: { consulta: tarefas.length, rastreadas: xt.pages.length }, krs: { consulta: krs.length, rastreadas: xk.pages.length }, objetivos: objetivos.length },
  };
}

export async function readAndPlan(adapter: NotionAdapter, config: NotionConfig, local: PlanInput['local'], opts: { now: string; newId: () => string }): Promise<{ read: NotionRead; plan: SyncPlan }> {
  const read = await readNotion(adapter, config, local.states);
  const plan = await planNotionSync({
    config, isDemo: adapter.isDemo, now: opts.now, newId: opts.newId,
    notion: { tarefas: read.tarefas, krs: read.krs, objetivos: read.objetivos }, missing: read.missing, local,
  });
  return { read, plan };
}

/**
 * Relatório do dry-run: só contagens e IDs de página do responsável. Nenhum título, nenhum conteúdo de página
 * e nada de páginas de outras pessoas.
 */
export function dryRunReport(read: NotionRead, plan: SyncPlan, config: NotionConfig) {
  const owned = (pages: NotionPage[], prop: string, ds: string) => pages.filter((p) => !p.archived && fromDataSource(p, ds) && isOwnedBy(p, prop, config.person_id));
  const tOwned = owned(read.tarefas, PROPS.tarefas.responsible, config.tasks_data_source_id);
  const kOwned = owned(read.krs, PROPS.krs.responsible, config.krs_data_source_id);
  const reviews = (entity: string, kind?: string) => plan.reviews.filter((r) => r.entity === entity && (!kind || r.kind === kind));
  const ids = <T,>(xs: T[], f: (x: T) => string | null | undefined) => xs.map(f).filter((x): x is string => !!x).map(normalizePageId);
  const krStates = plan.states.filter((s) => s.entity === 'krs' && s.local_parent_id && ['ok', 'pendente_push', 'conflito'].includes(s.sync_status ?? 'ok'));
  const c = plan.counts;
  return {
    tarefas: {
      retornadas: read.tarefas.length, da_consulta: read.counts.tarefas.consulta, ja_rastreadas: read.counts.tarefas.rastreadas,
      do_responsavel: tOwned.length, ignoradas: read.tarefas.length - tOwned.length,
      criar: c.tarefas.criados, atualizar: c.tarefas.atualizados, sem_mudanca: c.tarefas.sem_mudanca,
      valor_desconhecido: reviews('tarefas', 'valor_desconhecido').length, conflitos: c.tarefas.conflitos, alteradas_so_na_central: c.tarefas.pendente_push,
      ids: { criar: ids(plan.taskCreates, (t) => t.external_ref), revisao: ids(reviews('tarefas'), (r) => r.external_id) },
      problemas: reviews('tarefas', 'valor_desconhecido').map((r) => ({ page_id: normalizePageId(r.external_id), motivo: r.reason })),
    },
    krs: {
      retornados: read.krs.length, da_consulta: read.counts.krs.consulta, ja_rastreados: read.counts.krs.rastreadas,
      do_responsavel: kOwned.length, ignorados: read.krs.length - kOwned.length,
      normais: krStates.length, criar: c.krs.criados, atualizar: c.krs.atualizados,
      sem_objetivo: reviews('krs', 'kr_sem_objetivo').length, multiplos_objetivos: reviews('krs', 'kr_multiplos_objetivos').length,
      valor_desconhecido: reviews('krs', 'valor_desconhecido').length, conflitos: c.krs.conflitos,
      enviados_para_revisao: reviews('krs').length,
      ids: { revisao: ids(reviews('krs'), (r) => r.external_id) },
    },
    objetivos: {
      lidos: read.counts.objetivos,
      agrupando_krs: new Set(krStates.map((s) => s.notion_parent_id).filter(Boolean)).size,
      criar: plan.objectiveCreates.length,
      atualizar: plan.objectiveUpdates.length,
    },
    paginas_sumidas: read.missing.length,
    ignorados_fora_do_escopo: c.fora_do_escopo,
  };
}

/**
 * Versão da leitura que o servidor devolve ao navegador (modo "read" da Edge Function). Minimiza o que sai:
 * - Tarefas/KRs do responsável: só as propriedades que a integração usa; no campo de responsável fica só ele
 *   (corresponsáveis não saem).
 * - Páginas de outra pessoa, de outra base ou arquivadas: viram um "esqueleto" sem propriedades nem URL. O
 *   planejador (barreira 2) só marca o estado delas — sem título nem conteúdo, que nunca saem do servidor.
 * - Objetivos (só os ligados a KRs do responsável): só o título.
 */
export function clientRead(read: NotionRead, config: NotionConfig): NotionRead {
  const pick = (p: NotionPage, keys: readonly string[], personProp?: string): NotionPage => {
    const properties: NotionPage['properties'] = {};
    for (const k of keys) if (p.properties[k] !== undefined) properties[k] = p.properties[k];
    if (personProp) properties[personProp] = { type: 'people', ids: [normalizePageId(config.person_id)] };
    return { id: normalizePageId(p.id), url: p.url ?? null, last_edited_time: p.last_edited_time, parent_data_source_id: p.parent_data_source_id ?? null, archived: !!p.archived, properties };
  };
  const skeleton = (p: NotionPage): NotionPage => ({ id: normalizePageId(p.id), last_edited_time: p.last_edited_time, parent_data_source_id: p.parent_data_source_id ?? null, archived: !!p.archived, properties: {} });
  const side = (pages: NotionPage[], props: Record<string, string>, personProp: string, ds: string) => pages.map((p) =>
    !p.archived && fromDataSource(p, ds) && isOwnedBy(p, personProp, config.person_id) ? pick(p, Object.values(props), personProp) : skeleton(p));
  return {
    tarefas: side(read.tarefas, PROPS.tarefas, PROPS.tarefas.responsible, config.tasks_data_source_id),
    krs: side(read.krs, PROPS.krs, PROPS.krs.responsible, config.krs_data_source_id),
    objetivos: read.objetivos.map((p) => (fromDataSource(p, config.objectives_data_source_id) ? pick(p, Object.values(PROPS.objetivos)) : skeleton(p))),
    missing: read.missing.map(normalizePageId),
    counts: read.counts,
  };
}
