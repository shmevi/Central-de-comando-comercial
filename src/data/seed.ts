import { actions, load } from './store';
import { repo } from './index';
import { DEFAULT_SETTINGS, INITIAL_TASKS, INSTITUTIONS, baseRoutineBlocks } from '@/domain/defaults';
import type { Task } from '@/domain/types';
import { nowIso } from '@/lib/utils';
import type { RepositoryError } from './repository';
import { todayISO, addDays } from '@/lib/time';

/** Cria a configuração inicial na primeira execução (por usuário). */
let seeding: Promise<void> | null = null;
export function ensureSeed() {
  if (!seeding) seeding = doSeed().catch((e) => { seeding = null; throw e; });
  return seeding;
}
export function resetSeedGuard() { seeding = null; }
const isDuplicate = (e: unknown) => (e as RepositoryError)?.cause && ((e as RepositoryError).cause as { code?: string }).code === '23505';
/** Cria ignorando "já existe" (outra aba ou uma tentativa anterior chegou primeiro). */
async function createOnce<C extends Parameters<typeof repo>[0]>(c: C, input: any) {
  try { await repo(c).create(input); } catch (e) { if (!isDuplicate(e)) throw e; }
}

/**
 * Idempotente: cada passo confere o que já existe. As configurações são gravadas POR ÚLTIMO e servem
 * de marca de "primeiro acesso concluído" — se a conexão cair no meio, o próximo acesso completa o que faltou.
 */
async function doSeed() {
  if ((await repo('settings').list()).length) return;
  const insts = await repo('institutions').list();
  for (const i of INSTITUTIONS) if (!insts.some((x) => x.code === i.code)) await createOnce('institutions', { ...i });
  if (!(await repo('routine_templates').list()).length)
    await repo('routine_templates').create({ name: 'Rotina-base', weekday: null, blocks: baseRoutineBlocks(), is_default: true });
  const tasks = await repo('tasks').list();
  for (const t of INITIAL_TASKS) {
    if (tasks.some((x) => x.title === t.title && x.due_date === t.due_date)) continue;
    const task: Omit<Task, 'id' | 'created_at' | 'updated_at'> = {
      ...t, institution_id: null, status: 'a_fazer', checklist: [], recurrence: 'nenhuma',
      is_mission: false, mission_date: null, completed_at: null,
      history: [{ at: nowIso(), action: 'Criada', detail: 'Dado inicial do sistema' }],
    };
    await repo('tasks').create(task);
  }
  await createOnce('settings', { ...DEFAULT_SETTINGS });
}

/** Dados FICTÍCIOS para explorar o app. Todos marcados is_demo = true. */
export async function seedDemo() {
  await Promise.all(['institutions', 'people', 'candidates'].map((c) => load(c as any)));
  const insts = await repo('institutions').list();
  const inst = insts[0]?.id ?? null;
  const t = todayISO();
  const demo = { is_demo: true };
  const p1 = await actions.create('people', { ...demo, name: 'Pessoa Demonstração A', role: 'Consultor(a) comercial', email: '', phone: '', institution_ids: inst ? [inst] : [], active: true, notes: '' });
  await actions.create('people', { ...demo, name: 'Pessoa Demonstração B', role: 'Consultor(a) comercial', email: '', phone: '', institution_ids: insts.slice(0, 2).map((i) => i.id), active: true, notes: '' });
  await actions.create('feedbacks', { ...demo, person_id: p1.id, institution_id: inst, date: t, positives: 'Exemplo: boa abordagem inicial.', to_develop: 'Exemplo: contorno de objeções de preço.', action_plan: 'Exemplo: role-play semanal.', deadline: addDays(t, 14), status: 'aberto', reviews: [], confidential: true });
  for (const [n, stage] of [['Candidato(a) Demonstração 1', 'recebido'], ['Candidato(a) Demonstração 2', 'triagem'], ['Candidato(a) Demonstração 3', 'selecionado']] as const)
    await actions.create('candidates', { ...demo, name: n, phone: '', email: '', position: 'Consultor(a) de vendas', institution_id: inst, stage, source: 'Demonstração', notes: '', consent_lgpd: false, consent_at: null, retention_until: null, history: [] });
  await actions.create('objectives', { ...demo, title: 'Objetivo de demonstração', institution_id: inst, cycle: '2026-T4', owner: 'Coordenação', key_results: [{ id: 'kr1', title: 'Exemplo de KR com meta', start: 0, target: 100, current: 40, unit: 'matrículas' }, { id: 'kr2', title: 'Exemplo de KR sem meta definida', start: 0, target: null, current: null, unit: '' }] });
  await actions.create('systems', { ...demo, name: 'CRM (demonstração)', purpose: 'Exemplo de sistema', owner: '', institution_ids: inst ? [inst] : [], status: 'ativo', url: '' });
}

export async function removeDemo() {
  const cols = ['people', 'feedbacks', 'candidates', 'interviews', 'objectives', 'systems', 'tasks', 'projects', 'meetings', 'trainings', 'improvements', 'agenda_events', 'review_queue'] as const;
  for (const c of cols) {
    await load(c);
    const items = await repo(c).list();
    for (const i of items.filter((x) => x.is_demo)) await actions.remove(c, i.id);
  }
  // Estado de sincronização dos itens de demonstração. Tolerante: a tabela só existe depois da migration 0002.
  try {
    for (const s of (await repo('notion_sync_state').list()).filter((x) => x.is_demo)) await actions.remove('notion_sync_state', s.id);
  } catch { /* sem a 0002 não há estado para limpar */ }
}
