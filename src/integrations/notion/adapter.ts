/**
 * Contrato do adaptador Notion — SOMENTE LEITURA.
 *
 * Escopo real: Tarefas e KRs/OKRs de um responsável. Reuniões não fazem parte desta integração.
 * Nenhum método escreve no Notion; a escrita (Central → Notion) será um contrato separado, em fase posterior.
 */

/** Tipos de propriedade usados pela integração, já normalizados (independentes do formato bruto da API/MCP). */
export type NotionPropertyValue =
  | { type: 'title'; text: string | null }
  | { type: 'rich_text'; text: string | null }
  | { type: 'status'; name: string | null; group: NotionStatusGroup | null }
  | { type: 'select'; name: string | null }
  | { type: 'multi_select'; names: string[] }
  | { type: 'date'; start: string | null; end: string | null }
  /** Propriedade People/Person: IDs estáveis dos usuários (sem "user://", 32 hex minúsculos). */
  | { type: 'people'; ids: string[] }
  | { type: 'number'; value: number | null }
  /** Relação: IDs das páginas relacionadas (32 hex minúsculos). */
  | { type: 'relation'; ids: string[] }
  /** Fórmula: já convertida para o formato de destino pelo adaptador (ex.: progresso em 0–100). */
  | { type: 'formula'; value: number | string | boolean | null }
  | { type: 'last_edited_time'; value: string };

export type NotionStatusGroup = 'to_do' | 'in_progress' | 'complete';

export interface NotionPage {
  /** ID da página (32 hex minúsculos). */
  id: string;
  url?: string | null;
  /** Metadado do sistema — existe mesmo quando a base não tem propriedade de "última edição". */
  last_edited_time: string;
  /** Quem editou por último (pessoa ou bot). Usado no futuro para descartar o eco das nossas escritas. */
  last_edited_by?: string | null;
  /** Data source a que a página pertence, quando a origem informa. Página de outra base é recusada. */
  parent_data_source_id?: string | null;
  archived?: boolean;
  properties: Record<string, NotionPropertyValue | undefined>;
}

/** Fontes que a integração lê. */
export type NotionSource = 'tarefas' | 'krs' | 'objetivos';

/** Filtro aplicado NA ORIGEM (barreira 1). O sincronizador valida de novo cada página (barreira 2). */
export interface NotionQuery {
  /** Data source a consultar (vem de settings.notion_config). Obrigatório: vazio = consulta recusada. */
  dataSourceId: string;
  /** Propriedade People que identifica o responsável. */
  personProperty: string;
  /** ID estável do responsável. Obrigatório: sem ele a consulta não é feita. */
  personId: string;
  /** Propriedade de status e grupos aceitos (escopo inicial: só itens ativos). */
  statusProperty?: string;
  statusGroups?: readonly NotionStatusGroup[];
  /** Só páginas editadas depois deste instante (sincronização incremental). */
  editedAfter?: string | null;
  cursor?: string | null;
  pageSize?: number;
}

export interface NotionQueryResult {
  pages: NotionPage[];
  next_cursor: string | null;
  has_more: boolean;
}

export interface NotionAdapter {
  readonly kind: 'mock' | 'mcp' | 'api';
  readonly isDemo: boolean;
  /** Consulta paginada com filtro na origem. */
  query(source: Exclude<NotionSource, 'objetivos'>, q: NotionQuery): Promise<NotionQueryResult>;
  /**
   * Busca páginas específicas por ID: Objetivos referenciados pelos KRs, ou itens já sincronizados que saíram do
   * filtro (ex.: tarefa concluída). Página inexistente ou sem acesso simplesmente não volta.
   */
  retrieve(source: NotionSource, ids: string[]): Promise<NotionPage[]>;
}

/** Lê todas as páginas de uma consulta, seguindo o cursor. Limite de páginas evita laço infinito com cursor ruim. */
export async function queryAll(adapter: NotionAdapter, source: Exclude<NotionSource, 'objetivos'>, q: NotionQuery, maxPages = 50): Promise<NotionPage[]> {
  if (!q.personId) throw new Error('Consulta ao Notion sem responsável configurado — recusada.');
  if (!q.dataSourceId) throw new Error('Consulta ao Notion sem data source configurado — recusada.');
  const out: NotionPage[] = [];
  let cursor: string | null = q.cursor ?? null;
  for (let i = 0; i < maxPages; i++) {
    const r = await adapter.query(source, { ...q, cursor });
    out.push(...r.pages);
    if (!r.has_more || !r.next_cursor) return out;
    cursor = r.next_cursor;
  }
  throw new Error(`Consulta ao Notion (${source}) excedeu ${maxPages} páginas de resultado.`);
}
