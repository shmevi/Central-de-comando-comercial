/**
 * Lógica HTTP da Edge Function notion-sync — SÓ PARA O SERVIDOR (nenhuma tela importa este arquivo).
 *
 * Dois modos, os dois SOMENTE LEITURA do Notion (não existe aqui nenhum caminho de escrita no Notion):
 * - "dry_run" (padrão): lê, filtra o responsável, converte e calcula o plano. Devolve só contagens e IDs.
 * - "read": devolve as páginas do responsável (já filtradas e minimizadas, ver clientRead) para o navegador
 *   planejar e gravar NA CENTRAL com a sessão do próprio usuário (RLS). O servidor não grava em lugar nenhum.
 * Pedido com dry_run=false (escrita) é recusado (403).
 *
 * Quem pode ler: só a conta com vínculo em public.notion_access (criado pelo administrador). O person_id usado
 * é SEMPRE o do vínculo, nunca o digitado nas Configurações — assim ninguém lê as tarefas de outra pessoa com o
 * token compartilhado do workspace.
 *
 * Segurança:
 * - token do Notion só de variável de ambiente do servidor (Edge Secret NOTION_TOKEN); nunca em resposta ou log;
 * - os dados da Central são lidos COM O JWT DE QUEM CHAMOU (RLS do Postgres): cada pessoa só lê o que é dela;
 * - a resposta traz contagens e IDs de página do responsável — nenhum título ou conteúdo de página.
 */
import type { NotionSyncState, Objective, ReviewQueueItem, Settings, Task } from '@/domain/types';
import type { NotionAdapter } from './adapter';
import { createNotionApiAdapter } from './apiAdapter';
import { checkNotionConfig, describeConfigProblem, resolveNotionConfig } from './config';
import { clientRead, dryRunReport, readAndPlan, readNotion } from './pipeline';

export interface HandlerDeps {
  env: (key: string) => string | undefined;
  fetch?: typeof fetch;
  /** Testes injetam um adaptador falso; em produção é a API do Notion. */
  makeAdapter?: (token: string, ds: { tarefas: string; krs: string; objetivos: string }) => NotionAdapter;
  now?: () => string;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } });

/** Lê uma tabela pelo PostgREST com o JWT do chamador (RLS), em páginas. */
async function readTable<T>(f: typeof fetch, base: string, apikey: string, auth: string, table: string, order = 'id'): Promise<T[]> {
  const out: T[] = [];
  const size = 500;
  for (let from = 0; ; from += size) {
    const res = await f(`${base}/rest/v1/${table}?select=*&order=${order}.asc`, {
      headers: { apikey, Authorization: auth, Range: `${from}-${from + size - 1}`, 'Range-Unit': 'items', Prefer: 'count=none' },
    });
    if (!res.ok) throw new Error(`Falha ao ler ${table} da Central (${res.status}).`);
    const rows = (await res.json()) as T[];
    out.push(...rows);
    if (rows.length < size) return out;
  }
}

export async function handleNotionSync(req: Request, deps: HandlerDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' });
  const auth = req.headers.get('Authorization') ?? '';
  if (!/^Bearer\s+\S+/.test(auth)) return json(401, { error: 'Sessão ausente.' });

  let body: { dry_run?: unknown; mode?: unknown } = {};
  try { body = (await req.json()) ?? {}; } catch { /* corpo vazio = padrão */ }
  if (body.dry_run === false) return json(403, { error: 'Escrita desativada nesta versão: apenas leitura.' });
  const mode = body.mode ?? 'dry_run';
  if (mode !== 'dry_run' && mode !== 'read') return json(400, { error: 'Modo inválido. Use "dry_run" ou "read".' });

  const token = deps.env('NOTION_TOKEN');
  if (!token) return json(503, { error: 'NOTION_TOKEN não configurado no servidor (Edge Secret). Nada foi lido.' });
  const base = deps.env('SUPABASE_URL');
  const apikey = req.headers.get('apikey') ?? deps.env('SUPABASE_ANON_KEY') ?? '';
  if (!base || !apikey) return json(500, { error: 'Configuração do servidor incompleta (SUPABASE_URL / chave publicável).' });

  const f = deps.fetch ?? fetch;
  try {
    // Vínculo conta ↔ pessoa no Notion (lido com o JWT de quem chamou: cada um só enxerga o próprio).
    const access = (await readTable<{ user_id: string; person_id: string }>(f, base, apikey, auth, 'notion_access', 'user_id'))[0];
    if (!access?.person_id) return json(403, { error: 'Esta conta ainda não está liberada para ler o Notion. Peça ao administrador para criar o vínculo (tabela notion_access). Nada foi lido.' });

    const [settingsRows, tasks, objectives, allStates, reviews] = await Promise.all([
      readTable<Settings>(f, base, apikey, auth, 'settings'),
      readTable<Task>(f, base, apikey, auth, 'tasks'),
      readTable<Objective>(f, base, apikey, auth, 'objectives'),
      readTable<NotionSyncState>(f, base, apikey, auth, 'notion_sync_state'),
      readTable<ReviewQueueItem>(f, base, apikey, auth, 'review_queue'),
    ]);
    // O responsável é SEMPRE o do vínculo. O que estiver digitado nas Configurações é ignorado aqui.
    const config = { ...resolveNotionConfig(settingsRows[0] ?? null), person_id: access.person_id };
    // Itens de demonstração têm IDs fictícios: não são buscados no Notion real.
    const states = allStates.filter((s) => !s.is_demo);
    const check = checkNotionConfig(config); // fail-closed: sem IDs, nenhuma chamada ao Notion
    if (!check.ok) return json(422, { error: `Configuração do Notion incompleta (${describeConfigProblem(check)}). Nada foi lido.` });

    const ds = { tarefas: config.tasks_data_source_id, krs: config.krs_data_source_id, objetivos: config.objectives_data_source_id };
    const adapter = deps.makeAdapter ? deps.makeAdapter(token, ds) : createNotionApiAdapter({ token, dataSources: ds, fetch: f });
    const now = deps.now ? deps.now() : new Date().toISOString();
    if (mode === 'read') {
      const read = await readNotion(adapter, config, states);
      return json(200, { mode: 'read', gerado_em: now, person_id: config.person_id, read: clientRead(read, config) });
    }
    let n = 0;
    const { read, plan } = await readAndPlan(adapter, config, { tasks, objectives, states, reviews }, { now, newId: () => `dry-run-${++n}` });
    return json(200, { mode: 'dry_run', dry_run: true, gerado_em: now, report: dryRunReport(read, plan, config) });
  } catch (e) {
    // Só a mensagem (que nunca contém o token); sem stack nem corpo de resposta do Notion.
    return json(502, { error: (e as Error).message });
  }
}
