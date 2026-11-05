import { actions } from '@/data/store';
import { repo } from '@/data';
import type { Institution, Settings } from '@/domain/types';
import type { NotionAdapter, NotionEntity, NotionPage } from './adapter';
import { nowIso } from '@/lib/utils';
import { isValidISODate } from '@/lib/time';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
export function resolveInstitution(name: string | null | undefined, insts: Institution[]): string | null {
  if (!name) return null;
  const n = norm(name);
  return insts.find((i) => norm(i.name) === n || norm(i.code) === n)?.id ?? null;
}

/** Aceita só datas ISO válidas (yyyy-mm-dd, com ou sem hora). Qualquer outra coisa vira null — nunca uma data inventada. */
export function isoDate(v: string | null | undefined): string | null {
  const d = v?.trim().slice(0, 10) ?? '';
  return /^\d{4}-\d{2}-\d{2}$/.test(d) && isValidISODate(d) ? d : null;
}

/** Motivo para o item ir à fila de revisão em vez de ser importado direto. */
export function reviewReason(entity: NotionEntity, page: NotionPage, mapping: Record<string, string>, insts: Institution[]): string | null {
  if (!resolveInstitution(page.properties[mapping.institution], insts)) return 'Sem instituição reconhecida';
  if (entity === 'reunioes' && !isoDate(page.properties[mapping.date])) return 'Reunião sem data válida';
  return null;
}

const TASK_STATUS: Record<string, string> = { 'a fazer': 'a_fazer', 'em andamento': 'em_andamento', aguardando: 'aguardando', concluida: 'concluida', concluído: 'concluida' };
const PRIO: Record<string, string> = { baixa: 'baixa', media: 'media', alta: 'alta', urgente: 'urgente' };

/** Converte e grava um item já com instituição. */
export async function importPage(entity: NotionEntity, page: NotionPage, mapping: Record<string, string>, institution_id: string, isDemo: boolean, override: { date?: string } = {}) {
  const p = (k: string) => page.properties[mapping[k]] ?? null;
  const ext = `notion:${page.id}`;
  const base = { is_demo: isDemo, external_ref: ext, institution_id };
  if (entity === 'tarefas') {
    await actions.create('tasks', { ...base, title: p('title') ?? '(sem título)', description: 'Importado do Notion (somente leitura).', priority: (PRIO[norm(p('priority') ?? '')] ?? 'media') as any, status: (TASK_STATUS[norm(p('status') ?? '')] ?? 'a_fazer') as any, due_date: isoDate(p('due_date')), category: 'Geral', checklist: [], recurrence: 'nenhuma', is_mission: false, mission_date: null, completed_at: null, history: [{ at: nowIso(), action: 'Importada do Notion' }] });
  } else if (entity === 'okrs') {
    await actions.create('objectives', { ...base, title: p('title') ?? '(sem título)', cycle: p('cycle') ?? '', owner: p('owner') ?? '', key_results: [] });
  } else {
    const date = isoDate(override.date) ?? isoDate(p('date'));
    if (!date) throw new Error('Reunião sem data: informe a data antes de importar.');
    await actions.create('meetings', { ...base, title: p('title') ?? '(sem título)', date, start: '00:00', end: '00:00', template: 'livre', agenda: '', decisions: p('decisions') ?? '', minutes: '', actions: [], participants: '' });
  }
}

const COLL = { tarefas: 'tasks', okrs: 'objectives', reunioes: 'meetings' } as const;

/** Leitura: importa itens com instituição reconhecida; envia o restante para a fila de revisão. */
export async function syncRead(adapter: NotionAdapter, settings: Settings, insts: Institution[]) {
  const summary: Record<string, { imported: number; review: number; skipped: number }> = {};
  for (const entity of ['tarefas', 'okrs', 'reunioes'] as NotionEntity[]) {
    const s = { imported: 0, review: 0, skipped: 0 };
    try {
      const pages = await adapter.list(entity);
      const mapping = settings.notion_mapping[entity] ?? {};
      const existing = new Set((await repo(COLL[entity]).list()).map((x: any) => x.external_ref).filter(Boolean));
      const queue = await repo('review_queue').list();
      const queued = new Set(queue.map((q) => q.external_id));
      for (const page of pages) {
        const ext = `notion:${page.id}`;
        if (existing.has(ext) || queued.has(page.id)) { s.skipped++; continue; }
        const reason = reviewReason(entity, page, mapping, insts);
        if (!reason) { await importPage(entity, page, mapping, resolveInstitution(page.properties[mapping.institution], insts)!, adapter.isDemo); s.imported++; }
        else {
          await actions.create('review_queue', { source: 'notion', entity, external_id: page.id, title: page.properties[mapping.title] ?? '(sem título)', payload: page.properties, reason, resolved: false, resolution: null, is_demo: adapter.isDemo });
          s.review++;
        }
      }
      await actions.create('sync_logs', { source: 'notion', direction: 'leitura', entity, status: s.review ? 'revisao' : 'sucesso', message: `${s.imported} importado(s), ${s.review} para revisão, ${s.skipped} já existente(s)`, is_demo_source: adapter.isDemo });
    } catch (e) {
      await actions.create('sync_logs', { source: 'notion', direction: 'leitura', entity, status: 'erro', message: (e as Error).message, is_demo_source: adapter.isDemo });
    }
    summary[entity] = s;
  }
  return summary;
}
