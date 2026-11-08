import { actions, getError, getItems, load } from './store';
import { repo } from './index';
import { DEFAULT_SETTINGS, INITIAL_TASKS, INSTITUTIONS, baseRoutineBlocks } from '@/domain/defaults';
import type { Task } from '@/domain/types';
import { nowIso, pool } from '@/lib/utils';
import type { RepositoryError } from './repository';
import { todayISO, addDays } from '@/lib/time';
import { periodMonths } from '@/lib/metrics';

/** Cria a configuração inicial na primeira execução (por usuário). Resolve `true` se criou algo. */
let seeding: Promise<boolean> | null = null;
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
async function doSeed(): Promise<boolean> {
  // Pelo cache: a mesma leitura serve para a tela (antes eram duas leituras de settings, uma depois da outra).
  await load('settings');
  const err = getError('settings');
  if (err) throw new Error(err);
  if (getItems('settings').length) return false;
  // Leituras e criações independentes vão em paralelo (antes: uma por vez, ~20 idas e voltas no 1º acesso).
  const [insts, templates, tasks] = await Promise.all([repo('institutions').list(), repo('routine_templates').list(), repo('tasks').list()]);
  const newTask = (t: (typeof INITIAL_TASKS)[number]): Omit<Task, 'id' | 'created_at' | 'updated_at'> => ({
    ...t, institution_id: null, status: 'a_fazer', checklist: [], recurrence: 'nenhuma',
    is_mission: false, mission_date: null, completed_at: null,
    history: [{ at: nowIso(), action: 'Criada', detail: 'Dado inicial do sistema' }],
  });
  await Promise.all([
    ...INSTITUTIONS.filter((i) => !insts.some((x) => x.code === i.code)).map((i) => createOnce('institutions', { ...i })),
    ...(templates.length ? [] : [repo('routine_templates').create({ name: 'Rotina-base', weekday: null, blocks: baseRoutineBlocks(), is_default: true })]),
    ...INITIAL_TASKS.filter((t) => !tasks.some((x) => x.title === t.title && x.due_date === t.due_date)).map((t) => repo('tasks').create(newTask(t))),
  ]);
  // Por último, de propósito: marca "primeiro acesso concluído".
  await createOnce('settings', { ...DEFAULT_SETTINGS });
  await load('settings', true); // o cache passa a ver as configurações recém-criadas
  return true;
}

/** Dados FICTÍCIOS para explorar o app. Todos marcados is_demo = true. */
export async function seedDemo() {
  await Promise.all(['institutions', 'people'].map((c) => load(c as any)));
  const insts = await repo('institutions').list();
  const inst = insts[0]?.id ?? null;
  const t = todayISO();
  const demo = { is_demo: true };
  const p1 = await actions.create('people', { ...demo, name: 'Pessoa Demonstração A', role: 'Consultor(a) comercial', email: '', phone: '', institution_ids: inst ? [inst] : [], active: true, notes: '' });
  const p2 = await actions.create('people', { ...demo, name: 'Pessoa Demonstração B', role: 'Consultor(a) comercial', email: '', phone: '', institution_ids: insts.slice(0, 2).map((i) => i.id), active: true, notes: '' });
  // Números FICTÍCIOS (is_demo): últimos 6 meses fechados + o atual. Um mês sem lançamento e um sem valor, de propósito.
  if (inst) try {
    const months = periodMonths(t);
    const sample: [number, number, number | null][] = [[38, 9, 10800], [42, 11, 13750], [35, 8, null], [44, 12, 15600], [40, 10, 12500], [46, 13, 16900], [12, 3, 3900]];
    const sampleB: [number, number, number | null][] = [[30, 6, 7200], [33, 8, 9600], [31, 7, 8400], [36, 9, 11700], [34, 8, 10400], [37, 10, 13000], [9, 2, 2600]];
    await actions.createMany('person_metrics', months.flatMap((m, i) => [
      ...(i !== 2 ? [{ ...demo, person_id: p1.id, institution_id: inst, month: m, leads: sample[i][0], enrollments: sample[i][1], revenue: sample[i][2], notes: '' }] : []),
      { ...demo, person_id: p2.id, institution_id: inst, month: m, leads: sampleB[i][0], enrollments: sampleB[i][1], revenue: sampleB[i][2], notes: '' },
    ]));
  } catch { /* banco sem a migration 0007: a demonstração segue sem números */ }
  await actions.create('feedbacks', { ...demo, person_id: p1.id, institution_id: inst, date: t, positives: 'Exemplo: boa abordagem inicial.', to_develop: 'Exemplo: contorno de objeções de preço.', action_plan: 'Exemplo: role-play semanal.', deadline: addDays(t, 14), status: 'aberto', reviews: [], confidential: true });
  await actions.create('objectives', { ...demo, title: 'Objetivo de demonstração', institution_id: inst, cycle: '2026-T4', owner: 'Coordenação', key_results: [{ id: 'kr1', title: 'Exemplo de KR com meta', start: 0, target: 100, current: 40, unit: 'matrículas' }, { id: 'kr2', title: 'Exemplo de KR sem meta definida', start: 0, target: null, current: null, unit: '' }] });
}

export async function removeDemo() {
  // Números primeiro (dependem das pessoas). Tolerante: a tabela só existe depois da migration 0007.
  try {
    await load('person_metrics');
    await pool((await repo('person_metrics').list()).filter((x) => x.is_demo), 6, (m) => actions.remove('person_metrics', m.id));
  } catch { /* sem a 0007 não há números para limpar */ }
  const cols = ['people', 'feedbacks', 'candidates', 'interviews', 'objectives', 'systems', 'tasks', 'projects', 'meetings', 'trainings', 'improvements', 'agenda_events', 'review_queue'] as const;
  for (const c of cols) {
    await load(c);
    const items = await repo(c).list();
    await pool(items.filter((x) => x.is_demo), 6, (i) => actions.remove(c, i.id));
  }
  // Estado de sincronização dos itens de demonstração. Tolerante: a tabela só existe depois da migration 0002.
  try {
    await pool((await repo('notion_sync_state').list()).filter((x) => x.is_demo), 6, (s) => actions.remove('notion_sync_state', s.id));
  } catch { /* sem a 0002 não há estado para limpar */ }
}
