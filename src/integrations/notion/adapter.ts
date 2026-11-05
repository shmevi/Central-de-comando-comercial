/** Contrato do adaptador Notion. Fase 1: somente leitura. */
export type NotionEntity = 'tarefas' | 'okrs' | 'reunioes';
export interface NotionPage { id: string; properties: Record<string, string | null> }
export interface NotionAdapter {
  readonly kind: 'mock' | 'mcp';
  readonly isDemo: boolean;
  list(entity: NotionEntity): Promise<NotionPage[]>;
}
