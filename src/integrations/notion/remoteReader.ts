/**
 * Leitura REAL do Notion no modo Supabase: o navegador chama a Edge Function notion-sync (modo "read").
 * O token do Notion fica só no servidor; aqui só passa a sessão do usuário (JWT), como em qualquer chamada.
 * A leitura não escreve no Notion; a gravação na Central é feita depois, por sync.ts, com a sessão do usuário (RLS).
 * O envio (createRemoteNotionWriter) só acontece depois da confirmação explícita na tela.
 */
import type { NotionPage } from './adapter';
import type { NotionRead } from './pipeline';
import type { NotionReader } from './sync';
import type { NotionWriter } from './push';
import type { PushResult } from './pushCore';

/** Mesmo formato de `supabase.functions.invoke` (injetado para os testes). */
export type InvokeFn = (name: string, opts: { body: Record<string, unknown> }) => Promise<{ data: unknown; error: unknown }>;

const isPageList = (x: unknown): x is NotionPage[] =>
  Array.isArray(x) && x.every((p) => p && typeof p === 'object' && typeof (p as NotionPage).id === 'string' && typeof (p as NotionPage).properties === 'object');

/** Mensagem do servidor (campo "error" do JSON) quando a função responde com erro. */
async function serverMessage(error: unknown): Promise<string> {
  const ctx = (error as { context?: unknown })?.context;
  if (ctx instanceof Response) {
    try { const j = await ctx.clone().json(); if (j && typeof j.error === 'string') return j.error; } catch { /* sem JSON */ }
    if (ctx.status === 404) return 'A função de leitura do Notion (notion-sync) não está publicada no Supabase.';
    return `A leitura do Notion falhou (${ctx.status}).`;
  }
  const msg = (error as Error)?.message ?? '';
  if (/Failed to send|fetch/i.test(msg)) return 'Não foi possível falar com o servidor de leitura do Notion. Verifique a conexão e tente de novo.';
  return msg || 'A leitura do Notion falhou.';
}

export function createRemoteNotionReader(invoke: InvokeFn): NotionReader {
  return {
    kind: 'api',
    isDemo: false,
    async read() {
      // O servidor lê a configuração e o estado direto do banco (com o JWT do usuário); o corpo só escolhe o modo.
      const { data, error } = await invoke('notion-sync', { body: { mode: 'read' } });
      if (error) throw new Error(await serverMessage(error));
      const d = data as { mode?: string; person_id?: string; read?: Partial<NotionRead> } | null;
      const r = d?.read;
      if (!d || d.mode !== 'read' || typeof d.person_id !== 'string' || !r || !isPageList(r.tarefas) || !isPageList(r.krs) || !isPageList(r.objetivos))
        throw new Error('Resposta inesperada do servidor de leitura do Notion. Nada foi gravado.');
      const missing = Array.isArray(r.missing) ? r.missing.filter((x): x is string => typeof x === 'string') : [];
      const counts = r.counts ?? { tarefas: { consulta: r.tarefas.length, rastreadas: 0 }, krs: { consulta: r.krs.length, rastreadas: 0 }, objetivos: r.objetivos.length };
      return { person_id: d.person_id, read: { tarefas: r.tarefas, krs: r.krs, objetivos: r.objetivos, missing, counts } };
    },
  };
}

/**
 * Envio REAL ao Notion (modo Supabase): a Edge Function, modo "push", valida e grava — o token fica no servidor.
 * O servidor confere de novo a autorização de escrita, o vínculo da conta e o responsável de cada página.
 */
export function createRemoteNotionWriter(invoke: InvokeFn): NotionWriter {
  return {
    isDemo: false,
    async push(changes) {
      const { data, error } = await invoke('notion-sync', { body: { mode: 'push', changes } });
      if (error) throw new Error(await serverMessage(error));
      const d = data as { mode?: string; results?: unknown } | null;
      if (!d || d.mode !== 'push' || !Array.isArray(d.results)) throw new Error('Resposta inesperada do servidor ao enviar ao Notion. Confira o log antes de tentar de novo.');
      return d.results as PushResult[];
    },
  };
}
