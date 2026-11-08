/**
 * Planejador da sincronização Notion → Central. PURO: recebe o que veio do Notion e o estado local,
 * devolve o que deve ser criado/alterado/enfileirado. Não grava nada — quem grava é `sync.ts`.
 *
 * Garantias:
 * - Barreira 2: toda página é validada de novo pelo ID estável do responsável. Página fora do escopo não gera
 *   item, revisão nem log com dados dela (só entra numa contagem anônima).
 * - Identidade = external_ref "notion:<page_id>". Título nunca é usado como identidade.
 * - institution_id = null para tudo que vem do Notion. Nenhuma instituição é inferida.
 * - Valor fora dos mapeamentos → revisão ('valor_desconhecido'), nunca um padrão.
 * - Três vias (base = último estado sincronizado): só Notion mudou → aplica; só Central mudou → pendente_push;
 *   os dois mudaram para valores diferentes → conflito (nada é sobrescrito).
 * - Item apagado na Central não é recriado; item que saiu do Notion/escopo não é apagado na Central.
 */
import type { KeyResult, NotionConfig, NotionSyncEntity, NotionSyncState, Objective, ReviewKind, ReviewQueueItem, SyncStatus, Task } from '@/domain/types';
import type { NotionPage } from './adapter';
import { PROPS, notionRef, normalizePageId, sortAttribution } from './config';
import { stateHash } from './hash';
import { cycleFromPeriods, isOwnedBy, krSyncFields, mapKr, mapTask, taskSyncFields, textOf, type TaskSyncFields } from './mapping';

export type NewTask = Omit<Task, 'id' | 'created_at' | 'updated_at'> & { id: string };
export type NewObjective = Omit<Objective, 'id' | 'created_at' | 'updated_at'> & { id: string };
export type StatePatch = Partial<Omit<NotionSyncState, 'id' | 'created_at' | 'updated_at' | 'user_id'>> & { entity: NotionSyncEntity; notion_page_id: string };
export type NewReview = Omit<ReviewQueueItem, 'id' | 'created_at' | 'updated_at'>;
export interface PlannedLog { entity: NotionSyncEntity; external_id: string; action: 'criado' | 'atualizado' | 'conflito' | 'revisao' | 'suspenso'; fields_changed: string[] }

export interface SyncPlan {
  taskCreates: NewTask[];
  taskUpdates: { id: string; patch: Partial<Task> }[];
  objectiveCreates: NewObjective[];
  objectiveUpdates: { id: string; patch: Partial<Objective> }[];
  states: StatePatch[];
  reviews: NewReview[];
  logs: PlannedLog[];
  counts: Record<NotionSyncEntity, { criados: number; atualizados: number; sem_mudanca: number; revisao: number; conflitos: number; pendente_push: number }>
    & { fora_do_escopo: number };
}

export interface PlanInput {
  config: NotionConfig;
  notion: { tarefas: NotionPage[]; krs: NotionPage[]; objetivos: NotionPage[] };
  /** IDs de páginas já rastreadas que o Notion não devolveu (apagadas, arquivadas ou sem acesso). */
  missing?: string[];
  local: { tasks: Task[]; objectives: Objective[]; states: NotionSyncState[]; reviews: ReviewQueueItem[] };
  isDemo: boolean;
  now: string;
  newId: () => string;
}

/** Disjuntor anti-loop: mais de N escritas no mesmo item dentro da janela suspende aquele item. */
export const BREAKER = { maxWrites: 3, windowMs: 10 * 60 * 1000 } as const;

const diffKeys = <T extends object>(a: T, b: T) => (Object.keys(a) as (keyof T)[]).filter((k) => JSON.stringify(a[k] ?? null) !== JSON.stringify(b[k] ?? null)).map(String);

export async function planNotionSync(input: PlanInput): Promise<SyncPlan> {
  const { config, local, now, isDemo, newId } = input;
  const plan: SyncPlan = {
    taskCreates: [], taskUpdates: [], objectiveCreates: [], objectiveUpdates: [], states: [], reviews: [], logs: [],
    counts: { tarefas: zero(), krs: zero(), objetivos: zero(), fora_do_escopo: 0 },
  };
  const states = new Map(local.states.map((s) => [normalizePageId(s.notion_page_id), s]));
  const openReviews = new Set(local.reviews.filter((r) => !r.resolved).map((r) => `${r.external_id}|${r.kind ?? 'instituicao'}`));

  const setState = (p: StatePatch) => plan.states.push({ last_synced_at: now, ...p });
  const review = (entity: NotionSyncEntity, pageId: string, kind: ReviewKind, title: string, reason: string, payload: Record<string, unknown>) => {
    plan.counts[entity].revisao++;
    if (openReviews.has(`${pageId}|${kind}`)) return; // já pendente: não duplica
    openReviews.add(`${pageId}|${kind}`);
    plan.reviews.push({ source: 'notion', entity, kind, external_id: pageId, title, payload, reason, resolved: false, resolution: null, is_demo: isDemo });
    plan.logs.push({ entity, external_id: pageId, action: 'revisao', fields_changed: [] });
  };
  const inWindow = (st: NotionSyncState | undefined) => {
    const started = st?.write_window_started_at ? Date.parse(st.write_window_started_at) : NaN;
    return Number.isFinite(started) && Date.parse(now) - started < BREAKER.windowMs;
  };
  /** Item suspenso pelo disjuntor fica parado só até a janela expirar; depois volta a sincronizar sozinho. */
  const suspendedNow = (st: NotionSyncState | undefined) => st?.sync_status === 'suspenso' && inWindow(st);
  /** Disjuntor: devolve o contador atualizado (pode escrever) ou null (suspende o item). */
  const breakerAllows = (entity: NotionSyncEntity, pageId: string, st: NotionSyncState | undefined): Partial<StatePatch> | null => {
    const win = inWindow(st);
    const count = win ? (st?.write_count_window ?? 0) : 0;
    if (count >= BREAKER.maxWrites) {
      setState({ entity, notion_page_id: pageId, sync_status: 'suspenso' });
      plan.logs.push({ entity, external_id: pageId, action: 'suspenso', fields_changed: [] });
      return null;
    }
    return { write_count_window: count + 1, write_window_started_at: win ? st!.write_window_started_at : now };
  };

  // Páginas que sumiram do Notion: só marca o estado. A Central NÃO apaga nada sozinha.
  for (const raw of input.missing ?? []) {
    const id = normalizePageId(raw); const st = states.get(id);
    if (st && st.sync_status !== 'removido_no_notion') setState({ entity: st.entity, notion_page_id: id, sync_status: 'removido_no_notion' });
  }

  /** A página veio da base configurada? Se a origem informar outra base, a página é recusada. */
  const fromSource = (p: NotionPage, dataSourceId: string) =>
    !p.parent_data_source_id || normalizePageId(p.parent_data_source_id) === normalizePageId(dataSourceId);
  const SOURCE: Record<NotionSyncEntity, string> = { tarefas: config.tasks_data_source_id, krs: config.krs_data_source_id, objetivos: config.objectives_data_source_id };

  /** Barreira 2. Fora do escopo: se era rastreada, só marca o estado; nunca registra dados da página. */
  const inScope = (entity: NotionSyncEntity, p: NotionPage, personProperty: string) => {
    const id = normalizePageId(p.id);
    if (!fromSource(p, SOURCE[entity])) { plan.counts.fora_do_escopo++; return false; }
    if (p.archived) {
      const st = states.get(id);
      if (st && st.sync_status !== 'removido_no_notion') setState({ entity, notion_page_id: id, sync_status: 'removido_no_notion' });
      return false;
    }
    if (isOwnedBy(p, personProperty, config.person_id)) return true;
    plan.counts.fora_do_escopo++;
    const st = states.get(id);
    if (st && st.sync_status !== 'fora_do_escopo') setState({ entity, notion_page_id: id, sync_status: 'fora_do_escopo' });
    return false;
  };

  // ================================================================ TAREFAS
  const tasksByRef = new Map(local.tasks.filter((t) => t.external_ref).map((t) => [t.external_ref!, t]));
  for (const page of input.notion.tarefas) {
    if (!inScope('tarefas', page, PROPS.tarefas.responsible)) continue;
    const pid = normalizePageId(page.id); const ref = notionRef(pid);
    const st = states.get(pid);
    if (suspendedNow(st)) continue;
    const localTask = tasksByRef.get(ref);
    const mapped = mapTask(page);
    if (!mapped.ok) {
      review('tarefas', pid, 'valor_desconhecido', mapped.partial.title ?? '(sem título)', mapped.problems.map((p) => p.message).join('; '),
        { problems: mapped.problems, notion: mapped.partial, local_id: localTask?.id ?? null });
      setState({ entity: 'tarefas', notion_page_id: pid, local_id: localTask?.id ?? st?.local_id ?? null, sync_status: 'revisao', last_notion_edited_time: page.last_edited_time });
      continue;
    }
    const nf = mapped.fields; const nHash = await stateHash(nf);
    const base = { entity: 'tarefas' as const, notion_page_id: pid, last_notion_edited_time: page.last_edited_time };

    if (!localTask) {
      if (st?.local_id) { // existia e foi apagada na Central: respeita, não recria
        if (st.sync_status !== 'removido_na_central') setState({ ...base, sync_status: 'removido_na_central' });
        continue;
      }
      const br = breakerAllows('tarefas', pid, st); if (!br) continue;
      const id = newId();
      plan.taskCreates.push({
        id, ...nf, external_ref: ref, institution_id: null, is_demo: isDemo,
        description: '', category: 'Geral', checklist: [], recurrence: 'nenhuma', is_mission: false, mission_date: null,
        completed_at: nf.status === 'concluida' ? now : null,
        history: [{ at: now, action: 'Sincronizada do Notion' }],
      });
      setState({ ...base, ...br, local_id: id, synced_hash: nHash, synced_snapshot: nf, last_change_origin: 'notion', sync_status: 'ok' });
      plan.counts.tarefas.criados++;
      plan.logs.push({ entity: 'tarefas', external_id: pid, action: 'criado', fields_changed: Object.keys(nf) });
      continue;
    }

    // Base gravada antes de a Central ler a ATRIBUIÇÃO: a Central nunca teve esse campo, então ele é adotado do
    // Notion sem contar como mudança (evita conflito falso em todas as tarefas já sincronizadas).
    const legacy = !!st?.synced_snapshot && !('attribution' in (st.synced_snapshot as object));
    const cf = taskSyncFields(localTask);
    if (legacy) cf.attribution = nf.attribution;
    const cHash = await stateHash(cf);
    const baseHash = legacy ? await stateHash({ ...(st!.synced_snapshot as object), attribution: nf.attribution }) : (st?.synced_hash ?? null);
    const outcome = threeWay(baseHash, nHash, cHash);
    if (legacy && JSON.stringify(sortAttribution(localTask.attribution)) !== JSON.stringify(nf.attribution) && outcome !== 'notion')
      plan.taskUpdates.push({ id: localTask.id, patch: { attribution: nf.attribution } });
    if (outcome === 'igual') {
      plan.counts.tarefas.sem_mudanca++;
      if (!st || st.synced_hash !== nHash || st.sync_status !== 'ok' || st.local_id !== localTask.id)
        setState({ ...base, local_id: localTask.id, synced_hash: nHash, synced_snapshot: nf, sync_status: 'ok' });
    } else if (outcome === 'notion') {
      const br = breakerAllows('tarefas', pid, st); if (!br) continue;
      const changed = diffKeys(nf, cf);
      const patch: Partial<Task> = Object.fromEntries(changed.map((k) => [k, nf[k as keyof TaskSyncFields]]));
      if (legacy) patch.attribution = nf.attribution;
      if (changed.includes('status')) patch.completed_at = nf.status === 'concluida' ? (localTask.completed_at ?? now) : null;
      patch.history = [...localTask.history, { at: now, action: 'Atualizada pelo Notion', detail: changed.join(', ') }];
      plan.taskUpdates.push({ id: localTask.id, patch });
      setState({ ...base, ...br, local_id: localTask.id, synced_hash: nHash, synced_snapshot: nf, last_change_origin: 'notion', sync_status: 'ok' });
      plan.counts.tarefas.atualizados++;
      plan.logs.push({ entity: 'tarefas', external_id: pid, action: 'atualizado', fields_changed: changed });
    } else if (outcome === 'central') {
      plan.counts.tarefas.pendente_push++;
      if (st?.sync_status !== 'pendente_push') setState({ ...base, local_id: localTask.id, sync_status: 'pendente_push', last_change_origin: 'central', last_central_updated_at: localTask.updated_at });
    } else {
      plan.counts.tarefas.conflitos++;
      const snap = (st?.synced_snapshot ?? null) as TaskSyncFields | null;
      const fields = diffKeys(nf, cf);
      review('tarefas', pid, 'conflito', localTask.title, `Alterado no Notion e na Central: ${fields.join(', ')}`,
        { local_id: localTask.id, fields, base: snap, notion: nf, central: cf, notion_hash: nHash });
      plan.counts.tarefas.revisao--; // conflito é contado em "conflitos"
      setState({ ...base, local_id: localTask.id, sync_status: 'conflito' });
      plan.logs.push({ entity: 'tarefas', external_id: pid, action: 'conflito', fields_changed: fields });
    }
  }

  // ================================================================ OKRs: KRs agrupados por Objetivo (VISÃO)
  const objectivePages = new Map(input.notion.objetivos.filter((p) => fromSource(p, SOURCE.objetivos)).map((p) => [normalizePageId(p.id), p]));
  const objectivesByRef = new Map(local.objectives.filter((o) => o.external_ref).map((o) => [o.external_ref!, o]));
  // Cópias de trabalho dos key_results de cada objective local (permite mover KR de um para outro).
  const work = new Map<string, { obj: Objective | NewObjective; krs: KeyResult[]; isNew: boolean }>();
  for (const o of local.objectives) if (o.external_ref) work.set(o.id, { obj: o, krs: o.key_results.map((k) => ({ ...k })), isNew: false });
  const krLocation = new Map<string, string>(); // kr external_ref → objective local id
  for (const [oid, w] of work) for (const k of w.krs) if (k.external_ref) krLocation.set(k.external_ref, oid);
  const deletedObjectives = new Set<string>();

  /** Garante o objective local de uma página VISÃO. null = não deve receber KRs (apagado na Central ou inválido). */
  const objectiveFor = async (parentId: string): Promise<string | null> => {
    const ref = notionRef(parentId);
    const existing = objectivesByRef.get(ref);
    const page = objectivePages.get(parentId)!;
    const title = textOf(page.properties[PROPS.objetivos.title]);
    const st = states.get(parentId);
    if (existing) {
      if (title && title !== existing.title) { // título vem só do Notion (somente leitura na Central)
        const w = work.get(existing.id)!; w.obj = { ...w.obj, title };
        setState({ entity: 'objetivos', notion_page_id: parentId, local_id: existing.id, synced_hash: await stateHash({ title }), synced_snapshot: { title }, last_notion_edited_time: page.last_edited_time, last_change_origin: 'notion', sync_status: 'ok' });
      } else if (!st) {
        setState({ entity: 'objetivos', notion_page_id: parentId, local_id: existing.id, synced_hash: await stateHash({ title: existing.title }), synced_snapshot: { title: existing.title }, last_notion_edited_time: page.last_edited_time, sync_status: 'ok' });
      }
      return existing.id;
    }
    for (const [id, w] of work) if (w.isNew && w.obj.external_ref === ref) return id;
    if (st?.local_id) { // objetivo apagado na Central: não recria
      deletedObjectives.add(parentId);
      if (st.sync_status !== 'removido_na_central') setState({ entity: 'objetivos', notion_page_id: parentId, sync_status: 'removido_na_central' });
      return null;
    }
    if (!title) return null; // tratado por quem chama (revisão)
    const id = newId();
    work.set(id, { isNew: true, krs: [], obj: { id, title, institution_id: null, cycle: '', owner: config.person_name, key_results: [], external_ref: ref, is_demo: isDemo } });
    setState({ entity: 'objetivos', notion_page_id: parentId, local_id: id, synced_hash: await stateHash({ title }), synced_snapshot: { title }, last_notion_edited_time: page.last_edited_time, last_change_origin: 'notion', sync_status: 'ok' });
    plan.counts.objetivos.criados++;
    plan.logs.push({ entity: 'objetivos', external_id: parentId, action: 'criado', fields_changed: ['title'] });
    return id;
  };

  const findKr = (ref: string) => { const oid = krLocation.get(ref); if (!oid) return null; const w = work.get(oid)!; const k = w.krs.find((x) => x.external_ref === ref); return k ? { oid, k } : null; };

  for (const page of input.notion.krs) {
    if (!inScope('krs', page, PROPS.krs.responsible)) continue;
    const pid = normalizePageId(page.id); const ref = notionRef(pid);
    const st = states.get(pid);
    if (suspendedNow(st)) continue;
    const mapped = mapKr(page);
    const titleForQueue = (mapped.ok ? mapped.fields.fields.title : '') || '(KR sem título)';
    if (!mapped.ok) {
      review('krs', pid, 'valor_desconhecido', titleForQueue, mapped.problems.map((p) => p.message).join('; '), { problems: mapped.problems });
      setState({ entity: 'krs', notion_page_id: pid, sync_status: 'revisao', last_notion_edited_time: page.last_edited_time });
      continue;
    }
    const { fields: nf, objectiveIds, notion_progress } = mapped.fields;

    // Qual Objetivo? Nunca escolhido em silêncio.
    let parent: string | null = null;
    if (objectiveIds.length === 0) {
      review('krs', pid, 'kr_sem_objetivo', titleForQueue, 'KR sem Objetivo no Notion. Vincule-o a um Objetivo no Notion e sincronize de novo.', { fields: nf });
      setState({ entity: 'krs', notion_page_id: pid, sync_status: 'revisao', last_notion_edited_time: page.last_edited_time });
      continue;
    } else if (objectiveIds.length === 1) parent = objectiveIds[0];
    else if (st?.pinned_parent_id && objectiveIds.includes(normalizePageId(st.pinned_parent_id))) parent = normalizePageId(st.pinned_parent_id);
    else {
      const options = objectiveIds.map((oid) => ({ id: oid, title: textOf(objectivePages.get(oid)?.properties[PROPS.objetivos.title]) }));
      review('krs', pid, 'kr_multiplos_objetivos', titleForQueue, `KR ligado a ${objectiveIds.length} Objetivos. Escolha em qual ele fica na Central.`, { fields: nf, objectives: options });
      setState({ entity: 'krs', notion_page_id: pid, sync_status: 'revisao', last_notion_edited_time: page.last_edited_time });
      continue;
    }
    if (!objectivePages.has(parent) || !textOf(objectivePages.get(parent)!.properties[PROPS.objetivos.title])) {
      review('krs', pid, 'valor_desconhecido', titleForQueue, 'Objetivo do KR não encontrado no Notion ou sem título.', { fields: nf, objective_id: parent });
      setState({ entity: 'krs', notion_page_id: pid, sync_status: 'revisao', last_notion_edited_time: page.last_edited_time });
      continue;
    }
    const targetOid = await objectiveFor(parent);
    if (!targetOid) {
      if (deletedObjectives.has(parent)) setState({ entity: 'krs', notion_page_id: pid, sync_status: 'removido_na_central', last_notion_edited_time: page.last_edited_time });
      continue;
    }

    const nHash = await stateHash(nf);
    const base = { entity: 'krs' as const, notion_page_id: pid, notion_parent_id: parent, last_notion_edited_time: page.last_edited_time };
    const found = findKr(ref);
    if (!found) {
      if (st?.local_id) { // KR apagado na Central: não recria
        if (st.sync_status !== 'removido_na_central') setState({ ...base, sync_status: 'removido_na_central' });
        continue;
      }
      const br = breakerAllows('krs', pid, st); if (!br) continue;
      const k: KeyResult = { id: newId(), ...nf, start: null, unit: '', external_ref: ref, notion_progress };
      work.get(targetOid)!.krs.push(k); krLocation.set(ref, targetOid);
      setState({ ...base, ...br, local_id: k.id, local_parent_id: targetOid, synced_hash: nHash, synced_snapshot: nf, last_change_origin: 'notion', sync_status: 'ok' });
      plan.counts.krs.criados++;
      plan.logs.push({ entity: 'krs', external_id: pid, action: 'criado', fields_changed: Object.keys(nf) });
      continue;
    }

    // Mudança de Objetivo no Notion: a Central não move KRs, então segue sempre o Notion (mesmo ID local).
    if (found.oid !== targetOid) {
      const from = work.get(found.oid)!; from.krs = from.krs.filter((x) => x.external_ref !== ref);
      work.get(targetOid)!.krs.push(found.k); krLocation.set(ref, targetOid);
      plan.logs.push({ entity: 'krs', external_id: pid, action: 'atualizado', fields_changed: ['objetivo'] });
    }
    const krRef = work.get(targetOid)!.krs.find((x) => x.external_ref === ref)!;
    const cf = krSyncFields(krRef); const cHash = await stateHash(cf);
    const outcome = threeWay(st?.synced_hash ?? null, nHash, cHash);
    const moved = found.oid !== targetOid;
    if (outcome === 'igual') {
      plan.counts.krs[moved ? 'atualizados' : 'sem_mudanca']++;
      if (krRef.notion_progress !== notion_progress) krRef.notion_progress = notion_progress;
      if (moved || !st || st.synced_hash !== nHash || st.sync_status !== 'ok')
        setState({ ...base, local_id: krRef.id, local_parent_id: targetOid, synced_hash: nHash, synced_snapshot: nf, sync_status: 'ok' });
    } else if (outcome === 'notion') {
      const br = breakerAllows('krs', pid, st); if (!br) continue;
      const changed = diffKeys(nf, cf);
      Object.assign(krRef, nf, { notion_progress });
      setState({ ...base, ...br, local_id: krRef.id, local_parent_id: targetOid, synced_hash: nHash, synced_snapshot: nf, last_change_origin: 'notion', sync_status: 'ok' });
      plan.counts.krs.atualizados++;
      plan.logs.push({ entity: 'krs', external_id: pid, action: 'atualizado', fields_changed: changed });
    } else if (outcome === 'central') {
      plan.counts.krs.pendente_push++;
      if (st?.sync_status !== 'pendente_push' || moved) setState({ ...base, local_id: krRef.id, local_parent_id: targetOid, sync_status: 'pendente_push', last_change_origin: 'central' });
    } else {
      plan.counts.krs.conflitos++;
      const fields = diffKeys(nf, cf);
      review('krs', pid, 'conflito', krRef.title, `Alterado no Notion e na Central: ${fields.join(', ')}`,
        { local_id: krRef.id, local_parent_id: targetOid, fields, base: st?.synced_snapshot ?? null, notion: nf, central: cf, notion_progress, notion_hash: nHash });
      plan.counts.krs.revisao--;
      setState({ ...base, local_id: krRef.id, local_parent_id: targetOid, sync_status: 'conflito' });
      plan.logs.push({ entity: 'krs', external_id: pid, action: 'conflito', fields_changed: fields });
    }
  }

  // Grava os objetives tocados: novos viram create; existentes só se algo mudou.
  for (const [id, w] of work) {
    const notionKrs = w.krs.filter((k) => k.external_ref);
    const cycle = notionKrs.length ? cycleFromPeriods(notionKrs.map((k) => k.period_start)) : w.obj.cycle;
    if (w.isNew) {
      if (!w.krs.length) continue; // nunca cria Objetivo vazio
      plan.objectiveCreates.push({ ...(w.obj as NewObjective), key_results: w.krs, cycle });
      continue;
    }
    const orig = local.objectives.find((o) => o.id === id)!;
    const patch: Partial<Objective> = {};
    if (w.obj.title !== orig.title) patch.title = w.obj.title;
    if (JSON.stringify(w.krs) !== JSON.stringify(orig.key_results)) patch.key_results = w.krs;
    if (cycle !== orig.cycle) patch.cycle = cycle;
    if (Object.keys(patch).length) {
      plan.objectiveUpdates.push({ id, patch });
      if (patch.title) { plan.counts.objetivos.atualizados++; plan.logs.push({ entity: 'objetivos', external_id: normalizePageId(orig.external_ref!), action: 'atualizado', fields_changed: ['title'] }); }
    } else plan.counts.objetivos.sem_mudanca++;
  }
  // Objetivo novo sem nenhum KR válido não deve deixar estado apontando para registro inexistente.
  const created = new Set(plan.objectiveCreates.map((o) => o.id));
  plan.states = plan.states.filter((s) => !(s.entity === 'objetivos' && s.local_id && [...work.values()].some((w) => w.isNew && w.obj.id === s.local_id) && !created.has(s.local_id)));
  plan.counts.objetivos.criados = plan.objectiveCreates.length;
  plan.logs = plan.logs.filter((l) => !(l.entity === 'objetivos' && l.action === 'criado' && ![...plan.objectiveCreates].some((o) => o.external_ref === notionRef(l.external_id))));

  plan.states = mergeStates(plan.states);
  return plan;
}

/** Comparação de três vias contra a base sincronizada. Sem base: iguais = 'igual', diferentes = conflito. */
export function threeWay(base: string | null, notion: string, central: string): 'igual' | 'notion' | 'central' | 'conflito' {
  if (notion === central) return 'igual';
  if (!base) return 'conflito';
  const n = notion !== base, c = central !== base;
  if (n && !c) return 'notion';
  if (!n && c) return 'central';
  return 'conflito';
}

/** Vários patches da mesma página numa execução viram um só (o último valor de cada campo vence). */
function mergeStates(list: StatePatch[]): StatePatch[] {
  const m = new Map<string, StatePatch>();
  for (const s of list) m.set(s.notion_page_id, { ...(m.get(s.notion_page_id) ?? {}), ...s });
  return [...m.values()];
}

function zero() { return { criados: 0, atualizados: 0, sem_mudanca: 0, revisao: 0, conflitos: 0, pendente_push: 0 }; }

export type { SyncStatus };
