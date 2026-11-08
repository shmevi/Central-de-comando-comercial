import { describe, it, expect } from 'vitest';
import { blockLine, finishBody, readBody, MAX_BODY_CHARS } from './blocks';
import { createNotionApiAdapter, toUuid } from './apiAdapter';
import { createMockNotionAdapter, mockData, MOCK_IDS as I, MOCK_NOTION_CONFIG as CFG } from './mockAdapter';
import { planNotionSync } from './plan';
import { pendingPushes } from './push';
import { handleNotionSync } from './serverHandler';
import type { NotionSyncState, Objective, Task } from '@/domain/types';

const rt = (s: string) => [{ plain_text: s }];
const blk = (type: string, v: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({ object: 'block', id: `b-${type}-${Math.random()}`, type, has_children: false, [type]: v, ...extra });

describe('Conteúdo da página do Notion → texto', () => {
  it('converte os blocos comuns', () => {
    expect(blockLine(blk('paragraph', { rich_text: rt('Guru - itallo') }))).toBe('Guru - itallo');
    expect(blockLine(blk('heading_2', { rich_text: rt('Etapas') }))).toBe('## Etapas');
    expect(blockLine(blk('bulleted_list_item', { rich_text: rt('Leads') }))).toBe('• Leads');
    expect(blockLine(blk('numbered_list_item', { rich_text: rt('Passo') }), 3)).toBe('3. Passo');
    expect(blockLine(blk('to_do', { rich_text: rt('Ligar'), checked: true }))).toBe('[x] Ligar');
    expect(blockLine(blk('to_do', { rich_text: rt('Ligar'), checked: false }))).toBe('[ ] Ligar');
    expect(blockLine(blk('callout', { rich_text: rt('Atenção'), icon: { emoji: '⚠️' } }))).toBe('⚠️ Atenção');
    expect(blockLine(blk('child_database', { title: 'Rituais' }))).toBe('[base do Notion: Rituais — abra no Notion]');
    expect(blockLine(blk('image', { caption: [] }))).toBe('[imagem — abra no Notion]');
    expect(blockLine(blk('column_list'))).toBeNull();
  });
  it('lê filhos com recuo, segue a paginação e não entra em base/página interna', async () => {
    const tree: Record<string, { results: any[]; has_more?: boolean; next_cursor?: string }[]> = {
      page: [
        { results: [blk('paragraph', { rich_text: rt('Linha 1') }), { ...blk('toggle', { rich_text: rt('Detalhes') }), id: 'tg', has_children: true }], has_more: true, next_cursor: 'c2' },
        { results: [blk('numbered_list_item', { rich_text: rt('a') }), blk('numbered_list_item', { rich_text: rt('b') }), { ...blk('child_database', { title: 'Base' }), id: 'db', has_children: true }] },
      ],
      tg: [{ results: [blk('bulleted_list_item', { rich_text: rt('dentro') })] }],
      db: [{ results: [blk('paragraph', { rich_text: rt('NÃO DEVE APARECER') })] }],
    };
    const calls: string[] = [];
    const body = await readBody(async (id, cursor) => { calls.push(`${id}:${cursor}`); const pages = tree[id]; return cursor === 'c2' ? pages[1] : pages[0]; }, 'page');
    expect(body).toBe('Linha 1\n▸ Detalhes\n  • dentro\n1. a\n2. b\n[base do Notion: Base — abra no Notion]');
    expect(calls).not.toContain('db:null');
  });
  it('limita o tamanho', () => {
    const s = finishBody(['x'.repeat(MAX_BODY_CHARS + 50)]);
    expect(s.endsWith('… (continua no Notion)')).toBe(true);
    expect(s.length).toBeLessThan(MAX_BODY_CHARS + 40);
  });
  it('API: GET /blocks/{id}/children (somente leitura)', async () => {
    const calls: { method: string; url: string }[] = [];
    const f = (async (url: string, init: RequestInit = {}) => {
      calls.push({ method: init.method ?? 'GET', url });
      return new Response(JSON.stringify({ results: [blk('paragraph', { rich_text: rt('Oi') })], has_more: false }));
    }) as unknown as typeof fetch;
    const a = createNotionApiAdapter({ token: 't', dataSources: { tarefas: CFG.tasks_data_source_id, krs: CFG.krs_data_source_id, objetivos: CFG.objectives_data_source_id }, fetch: f });
    expect(await a.body!(I.t_responsavel)).toBe('Oi');
    expect(calls).toEqual([{ method: 'GET', url: `https://api.notion.com/v1/blocks/${toUuid(I.t_responsavel)}/children?page_size=100` }]);
  });
});

describe('Conteúdo: privacidade e espelho na Central', () => {
  it('servidor lê e devolve o conteúdo SÓ das páginas do responsável', async () => {
    const asked: string[] = [];
    const base = createMockNotionAdapter({ leaky: true });
    const f = (async (url: string) => {
      const t = new URL(url).pathname.split('/').pop();
      return new Response(JSON.stringify(t === 'settings' ? [{ id: 's', notion_config: CFG }] : t === 'notion_access' ? [{ user_id: 'u', person_id: CFG.person_id }] : []));
    }) as unknown as typeof fetch;
    const r = await handleNotionSync(new Request('https://x', { method: 'POST', headers: { Authorization: 'Bearer eyJ.u.t', apikey: 'k' }, body: JSON.stringify({ mode: 'read' }) }), {
      env: (k) => ({ SUPABASE_URL: 'https://e.supabase.co', NOTION_TOKEN: 'tok' } as Record<string, string>)[k], fetch: f,
      makeAdapter: () => ({ ...base, body: (id: string) => { asked.push(id); return base.body!(id); } }),
    });
    const text = await r.text();
    expect(asked).not.toContain(I.t_so_outra);   // nem é pedido ao Notion
    expect(asked).not.toContain(I.t_sem_responsavel);
    expect(text).not.toContain('Conteúdo privado de outra pessoa');
    const { read } = JSON.parse(text);
    expect(read.tarefas.find((p: any) => p.id === I.t_responsavel).body).toContain('Conferir as etapas do funil');
    expect(read.krs.find((p: any) => p.id === I.k_normal).body).toContain('Como medir');
  });
  it('plano: tarefa recebe a descrição; KR recebe Descrição/Motivo/conteúdo; nada vira conflito nem envio', async () => {
    const data = mockData();
    const task = { ...data.tarefas.find((p) => p.id === I.t_responsavel)!, body: 'Texto da página' };
    const kr = { ...data.krs.find((p) => p.id === I.k_normal)!, body: 'Conteúdo do KR' };
    const obj = data.objetivos.find((p) => p.id === I.o1)!;
    const now = '2026-11-08T10:00:00.000Z'; let n = 0;
    const first = await planNotionSync({ config: CFG, notion: { tarefas: [task], krs: [kr], objetivos: [obj] }, local: { tasks: [], objectives: [], states: [], reviews: [] }, isDemo: true, now, newId: () => `id${++n}` });
    expect(first.taskCreates[0].description).toBe('Texto da página');
    const k = first.objectiveCreates[0].key_results[0];
    expect([k.description, k.reason, k.notion_body]).toEqual(['[Demonstração] Matrículas do trimestre', null, 'Conteúdo do KR']);

    // Segunda leitura: o conteúdo mudou no Notion → só o espelho é atualizado (sem conflito)
    const tasks = first.taskCreates.map((t) => ({ ...t, created_at: now, updated_at: now })) as Task[];
    const objectives = first.objectiveCreates.map((o) => ({ ...o, created_at: now, updated_at: now })) as Objective[];
    const states = first.states.map((s, i) => ({ id: `s${i}`, ...s })) as unknown as NotionSyncState[];
    const second = await planNotionSync({ config: CFG, notion: { tarefas: [{ ...task, body: 'Texto novo' }], krs: [{ ...kr, body: 'KR novo' }], objetivos: [obj] }, local: { tasks, objectives, states, reviews: [] }, isDemo: true, now, newId: () => `x${++n}` });
    expect(second.reviews).toEqual([]);
    expect(second.taskUpdates).toEqual([{ id: tasks[0].id, patch: { description: 'Texto novo' } }]);
    expect(second.objectiveUpdates[0].patch.key_results![0].notion_body).toBe('KR novo');
    // Leitura sem conteúdo (body indefinido) não apaga o que a Central já tem
    const third = await planNotionSync({ config: CFG, notion: { tarefas: [{ ...task, body: undefined }], krs: [], objetivos: [] }, local: { tasks, objectives, states, reviews: [] }, isDemo: true, now, newId: () => 'y' });
    expect(third.taskUpdates).toEqual([]);
    // Descrição nunca é enviada ao Notion
    expect(pendingPushes(states, [{ ...tasks[0], description: 'mudei na Central' }], objectives, true)).toEqual([]);
  });
});
