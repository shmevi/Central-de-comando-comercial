import type { NotionAdapter, NotionEntity, NotionPage } from './adapter';

/**
 * ADAPTADOR DE DEMONSTRAÇÃO. Não conecta a nenhum workspace real.
 * Retorna páginas fictícias, todas identificadas como demonstração.
 * A integração real via MCP é uma fase posterior.
 */
const DATA: Record<NotionEntity, NotionPage[]> = {
  tarefas: [
    { id: 'demo-t1', properties: { Nome: '[Demonstração] Revisar funil de matrículas', Status: 'A fazer', Prazo: null, Instituição: 'CPPEM', Prioridade: 'Alta' } },
    { id: 'demo-t2', properties: { Nome: '[Demonstração] Atualizar planilha de leads', Status: 'Em andamento', Prazo: null, Instituição: 'UNICIVE', Prioridade: 'Média' } },
    { id: 'demo-t3', properties: { Nome: '[Demonstração] Item sem instituição definida', Status: 'A fazer', Prazo: null, Instituição: null, Prioridade: 'Baixa' } },
  ],
  okrs: [
    { id: 'demo-o1', properties: { Objetivo: '[Demonstração] Objetivo importado', Ciclo: '2026-T4', Instituição: 'Colégio CPPEM', Responsável: 'Coordenação' } },
    { id: 'demo-o2', properties: { Objetivo: '[Demonstração] OKR sem instituição', Ciclo: '2026-T4', Instituição: null, Responsável: null } },
  ],
  reunioes: [
    { id: 'demo-r1', properties: { Título: '[Demonstração] Reunião importada', Data: null, Instituição: 'CPPEM', Decisões: 'Exemplo fictício' } },
  ],
};

export const mockNotionAdapter: NotionAdapter = {
  kind: 'mock',
  isDemo: true,
  async list(entity) {
    await new Promise((r) => setTimeout(r, 400));
    return DATA[entity].map((p) => ({ ...p, properties: { ...p.properties } }));
  },
};
