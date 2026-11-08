/**
 * Envio Central → Notion, lado do navegador:
 * 1) `pendingPushes` acha o que mudou NA CENTRAL desde a última sincronização (campo a campo, contra a base);
 * 2) a tela mostra a lista e pede confirmação explícita;
 * 3) `pushToNotion` envia pelo "escritor" (servidor no modo Supabase; demonstração no modo local) e grava o resultado
 *    na Central: estado de sincronização, conflitos (fila de revisão) e log com direção "escrita".
 * Nada é enviado sem a confirmação da tela, e o servidor recusa tudo se a escrita não estiver autorizada.
 */
import { actions } from '@/data/store';
import type { KeyResult, NotionConfig, NotionSyncState, Objective, Task } from '@/domain/types';
import { PRIORITY, TASK_STATUS } from '@/domain/labels';
import { fmtDate } from '@/lib/time';
import { nowIso } from '@/lib/utils';
import { normalizePageId, sortAttribution } from './config';
import { stateHash } from './hash';
import { mapKr, mapTask } from './mapping';
import { PUSH_FIELDS, type PushChange, type PushEntity, type PushResult } from './pushCore';
import type { NotionPage } from './adapter';

export interface PendingChange {
  state: NotionSyncState;
  entity: PushEntity;
  page_id: string;
  title: string;
  local_id: string;
  local_parent_id: string | null;
  fields: Record<string, unknown>;
  base: Record<string, unknown>;
  /** Todos os campos sincronizados da Central (para montar o conflito, se houver). */
  central: Record<string, unknown>;
  changes: { field: string; label: string; from: string; to: string }[];
}

export interface NotionWriter {
  isDemo: boolean;
  push(changes: PushChange[], config: NotionConfig): Promise<PushResult[]>;
}

const FIELD_LABEL: Record<string, string> = { title: 'Título', status: 'Status', priority: 'Prioridade', due_date: 'Prazo', attribution: 'Atribuição', target: 'Meta', current: 'Atual' };
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
function show(entity: PushEntity, field: string, v: unknown): string {
  if (v == null || v === '') return '—';
  if (entity === 'tarefas' && field === 'status') return TASK_STATUS[v as Task['status']] ?? String(v);
  if (entity === 'tarefas' && field === 'priority') return PRIORITY[v as Task['priority']]?.label ?? String(v);
  if (field === 'due_date') return fmtDate(String(v));
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
  return String(v);
}

const taskFields = (t: Task) => ({ title: t.title, status: t.status, priority: t.priority, due_date: t.due_date ?? null, attribution: sortAttribution(t.attribution) });
const krFields = (k: KeyResult) => ({ title: k.title, target: k.target ?? null, current: k.current ?? null, status: k.status ?? null, period_start: k.period_start ?? null, period_end: k.period_end ?? null });

/** O que mudou só na Central e pode ir ao Notion. Itens em conflito, revisão ou suspensos não entram. */
export function pendingPushes(states: NotionSyncState[], tasks: Task[], objectives: Objective[], isDemo: boolean): PendingChange[] {
  const out: PendingChange[] = [];
  for (const st of states) {
    if (st.entity !== 'tarefas' && st.entity !== 'krs') continue;
    if (!!st.is_demo !== isDemo || !st.local_id || !st.synced_snapshot) continue;
    if (st.sync_status !== 'ok' && st.sync_status !== 'pendente_push') continue;
    const entity = st.entity as PushEntity;
    let central: Record<string, unknown>; let title: string;
    if (entity === 'tarefas') {
      const t = tasks.find((x) => x.id === st.local_id); if (!t) continue;
      central = taskFields(t); title = t.title;
    } else {
      const o = objectives.find((x) => x.id === st.local_parent_id);
      const k = o?.key_results.find((x) => x.id === st.local_id); if (!k) continue;
      central = krFields(k); title = k.title;
    }
    const base = st.synced_snapshot as Record<string, unknown>;
    const fields: Record<string, unknown> = {}; const baseOut: Record<string, unknown> = {};
    for (const f of PUSH_FIELDS[entity]) {
      if (!(f in base)) continue; // campo que a última sincronização não registrou: sem base, não envia
      if (same(central[f], base[f])) continue;
      if (entity === 'krs' && f === 'status' && !central[f]) continue; // o Notion não aceita limpar o status
      fields[f] = central[f] ?? null; baseOut[f] = base[f] ?? null;
    }
    if (!Object.keys(fields).length) continue;
    out.push({
      state: st, entity, page_id: normalizePageId(st.notion_page_id), title, local_id: st.local_id, local_parent_id: st.local_parent_id ?? null,
      fields, base: baseOut, central,
      changes: Object.keys(fields).map((f) => ({ field: f, label: FIELD_LABEL[f] ?? f, from: show(entity, f, baseOut[f]), to: show(entity, f, fields[f]) })),
    });
  }
  return out;
}

/** Campos sincronizados como ficaram no Notion (mesmo formato da base). */
function snapshotOf(entity: PushEntity, page: NotionPage, fallback: Record<string, unknown>): { snap: Record<string, unknown>; progress?: number | null } {
  if (entity === 'tarefas') { const m = mapTask(page); return { snap: m.ok ? m.fields : fallback }; }
  const m = mapKr(page);
  return m.ok ? { snap: m.fields.fields, progress: m.fields.notion_progress } : { snap: fallback };
}

export interface PushSummary { enviados: number; sem_mudanca: number; conflitos: number; recusados: number; erros: number; mensagens: string[] }

export async function pushToNotion(writer: NotionWriter, pending: PendingChange[], config: NotionConfig, objectives: Objective[]): Promise<PushSummary> {
  const sum: PushSummary = { enviados: 0, sem_mudanca: 0, conflitos: 0, recusados: 0, erros: 0, mensagens: [] };
  if (!pending.length) return sum;
  const results = await writer.push(pending.map((p) => ({ entity: p.entity, page_id: p.page_id, fields: p.fields, base: p.base })), config);
  const now = nowIso();
  for (const p of pending) {
    const res = results.find((r) => normalizePageId(r.page_id) === p.page_id && r.entity === p.entity);
    const log = (status: 'sucesso' | 'erro' | 'revisao', message: string, fields: string[] | null) =>
      actions.create('sync_logs', { source: 'notion', direction: 'escrita', entity: p.entity, external_id: p.page_id, fields_changed: fields, status, message, is_demo_source: writer.isDemo });
    if (!res) { sum.erros++; await log('erro', `Sem resposta do Notion para: ${p.title}`, null); continue; }
    if ((res.status === 'enviado' || res.status === 'sem_mudanca') && res.page) {
      const { snap, progress } = snapshotOf(p.entity, res.page, { ...p.base, ...p.fields });
      await actions.update('notion_sync_state', p.state.id, {
        synced_hash: await stateHash(snap), synced_snapshot: snap, sync_status: same(pick(snap, PUSH_FIELDS[p.entity]), pick(p.central, PUSH_FIELDS[p.entity])) ? 'ok' : 'pendente_push',
        last_notion_edited_time: res.page.last_edited_time, echo_edited_time: res.page.last_edited_time,
        last_change_origin: 'central', last_synced_at: now,
      });
      if (p.entity === 'krs' && progress !== undefined) { // progresso (fórmula) recalculado pelo Notion
        const o = objectives.find((x) => x.id === p.local_parent_id);
        if (o && o.key_results.some((k) => k.id === p.local_id && k.notion_progress !== progress))
          await actions.update('objectives', o.id, { key_results: o.key_results.map((k) => (k.id === p.local_id ? { ...k, notion_progress: progress } : k)) });
      }
      if (res.status === 'enviado') { sum.enviados++; await log('sucesso', `Enviado ao Notion: ${p.title}`, res.written ?? Object.keys(p.fields)); }
      else sum.sem_mudanca++;
      continue;
    }
    if (res.status === 'conflito' && res.page) {
      sum.conflitos++;
      const { snap: notion, progress } = snapshotOf(p.entity, res.page, {});
      const fields = res.conflicts ?? Object.keys(p.fields);
      await actions.update('notion_sync_state', p.state.id, { sync_status: 'conflito' });
      await actions.create('review_queue', {
        source: 'notion', entity: p.entity, kind: 'conflito', external_id: p.page_id, title: p.title,
        reason: `Alterado no Notion e na Central: ${fields.map((f) => FIELD_LABEL[f] ?? f).join(', ')}. Nada foi enviado.`,
        payload: { local_id: p.local_id, local_parent_id: p.local_parent_id, fields, base: p.state.synced_snapshot, notion, central: p.central, notion_hash: await stateHash(notion), notion_progress: progress ?? null },
        resolved: false, resolution: null, is_demo: writer.isDemo,
      });
      await log('revisao', `Conflito ao enviar (nada sobrescrito): ${p.title}`, fields);
      continue;
    }
    if (res.status === 'recusado') sum.recusados++; else sum.erros++;
    const msg = `${p.title}: ${res.message ?? 'não enviado'}`;
    if (!sum.mensagens.includes(res.message ?? '')) sum.mensagens.push(res.message ?? '');
    await log('erro', `Não enviado — ${msg}`, Object.keys(p.fields));
  }
  sum.mensagens = sum.mensagens.filter(Boolean);
  return sum;
}

const pick = (o: Record<string, unknown>, keys: readonly string[]) => Object.fromEntries(keys.map((k) => [k, o[k] ?? null]));
