# Status: funcional × demonstração

## Funcional (dados reais do usuário, persistidos)
- **Hoje, Minha Rotina, Agenda, Tarefas** (com filtro de origem Todas / Rotina-Central / Notion) — CRUD completo, filtros, busca, conclusão,
  reagendamento, conflitos, persistência.
- **Equipes e Feedbacks, Treinamentos, Reuniões, OKRs, Projetos** — CRUD completo com validações.
- **Relatórios** diário (resumo, concluídas Central × Notion, conquistas, destaques, pendências para amanhã, anotação final)
  e semanal (principais concluídas, conquistas, evolução de OKRs, pendências, prioridades da próxima semana), com PDF/CSV.
- **Logo personalizada** (Supabase Storage) e **fonte de identidade** (aguarda o arquivo `Capture it`, ver `src/assets/fonts/`).
- **Removidos da interface:** Recrutamento e Sistemas e Melhorias. Os dados no banco foram preservados.
- **Relatórios** diário/semanal com exportação **CSV** e **PDF**.
- **Configurações** — jornada, instituições, categorias, foco semanal, modelo de rotina, tema, permissões, backup.
- **Persistência local** (navegador) pronta para uso.
- **Persistência Supabase + autenticação + RLS** — preparada para produção (falta só a validação num projeto real), com:
  - login por e-mail e senha, **“Esqueci minha senha”**, tela para definir senha a partir de link de convite ou de
    recuperação, mensagens em português e cadastro público desligado por padrão;
  - leitura paginada (sem corte em 1000 registros), primeiro acesso que se completa mesmo se a conexão cair;
  - bloqueio de configuração errada (sem URL/chave, URL da API em vez da do projeto, chave secreta).
  - **Como foi verificado:** a migration e as regras RLS rodam num PostgreSQL 16 real (`npm run test:rls`);
    o app inteiro roda no navegador em modo Supabase contra um Supabase **simulado** (`npm run test:supabase`).
    Ainda **não** rodou contra um projeto Supabase de verdade, porque nenhum foi criado ou conectado.

- **Integração Notion (modo Supabase)**: leitura REAL Notion → Central de Tarefas e KRs/OKRs ativos do responsável,
  pela Edge Function `notion-sync` (token só no servidor). Só para contas com vínculo em `notion_access`. Duas barreiras
  de responsável, deduplicação, três vias/conflitos, agrupamento de KRs por Objetivo.
- **Envio Central → Notion** (modo Supabase; demonstração no modo local): mudanças feitas na Central em tarefas
  (título, status, prioridade, prazo, atribuição) e KRs (título, status, meta, atual) ficam pendentes e só vão ao Notion
  com "Autorizar escrita no Notion" ligado e confirmação explícita a cada envio. O servidor confere responsável,
  base e valores; se o Notion mudou o mesmo campo, vira conflito (nada é sobrescrito).
- **Conteúdo das páginas do Notion**: o conteúdo de dentro da página (texto, listas, checklists) vira a descrição da
  tarefa; nos KRs aparecem "Descrição", "Motivo" e o conteúdo da página. Espelho somente leitura (Notion → Central),
  lido só das páginas do responsável; imagens, arquivos e bases internas aparecem como aviso "abra no Notion".
- **Feedback em números** (Equipes): lançamento mensal de leads, matrículas e valor por pessoa × instituição; conversão e
  ticket médio calculados (nunca gravados); página da pessoa com variação, média de 3 meses, média da equipe, gráficos e
  tabela; painel no feedback com os números congelados ao salvar. Tabela `person_metrics` (migration 0007).
- **Quadros iguais aos do Notion**: OKRs em "Kanban por Objetivo" (colunas = Objetivos, só KRs ativos, status no cartão)
  e Tarefas agrupadas por ATRIBUIÇÃO (70% / 20% / 10% / OFF WORK, só ativas) ou por status com os nomes do Notion.

- **Busca em tudo** (lupa no topo ou Ctrl+K): tarefas, pessoas, reuniões, agenda, OKRs, projetos, treinamentos e anotações, na instituição escolhida; abre o item encontrado. Feedbacks ficam de fora (podem ter PIN).
- **Telas enxutas**: Rotina (uma linha por bloco, círculo para concluir, menu "⋯"), Agenda (semana em lista no celular; excluir dentro do evento), OKRs (filtros recolhidos, cartão menor, abas no celular), Equipes (uma linha por pessoa; excluir dentro da pessoa) e Configurações em abas (Geral, Jornada, Organização, Dados).
- **Rotina**: "Dia de folga" apaga o dia e a tela Hoje não recria a rotina-base (migration 0008); mudar o intervalo na Jornada move o bloco "Intervalo" do modelo de rotina junto.
- **Tarefas organizadas por prazo**: abas Todas / Hoje / Atrasadas / Próximos 7 dias; lista agrupada (atrasadas, hoje, amanhã, 7 dias, depois, sem prazo; concluídas recolhidas); busca + filtros recolhidos com etiquetas removíveis; adicionar rápido (Enter); concluir com "Desfazer"; excluir dentro da tarefa; Kanban com abas no celular e menu "⋯" para mover.
- **Tela Hoje enxuta**: o que fazer agora, números que importam, Missão do dia, próximos itens e anotação rápida.
- **Desempenho**: abertura em uma onda de pedidos, telas pré-carregadas ao passar o mouse/tocar no menu, ações com
  resposta imediata (e desfeitas se o servidor recusar), logo otimizada e em cache, sincronização do Notion em lote.
  Detalhes em `ARQUITETURA.md` → "Desempenho".

## Demonstração (fictício, sempre identificado)
- **Integração Notion no modo local**: a mesma lógica roda sobre um adaptador *mock*; itens recebem o selo "Demonstração".
  No modo Supabase a leitura é **real** (ver "Funcional").
- **"Carregar demonstração"** (Configurações): pessoas, feedback, candidatos, OKR e sistema fictícios com selo
  "Demonstração", removíveis com um clique. Por padrão o app inicia **sem** dados fictícios.

## Limitações conhecidas / próximos passos
- O PIN de feedbacks é uma barreira de interface (guardado como hash SHA-256, mas um PIN curto é fácil de adivinhar
  por força bruta); a proteção real é login + RLS. Perfis com papéis diferentes
  (ex.: supervisor que lê só a própria equipe) exigem tabela de membros/papéis — ainda não modelado.
- Multiusuário compartilhando os mesmos dados (equipe) não está modelado: cada usuário tem seu próprio espaço.
- Cada pessoa que entra tem o próprio espaço de dados. Não há tela para administrar usuários dentro do app:
  usuários são criados e removidos no painel do Supabase (Authentication → Users).
- Arrastar e soltar nos Kanbans usa HTML5 drag (desktop); no celular e por teclado use o menu "⋯" do cartão.
- Notion: criar páginas novas (tarefa ou KR criados na Central) e mudar o Objetivo de um KR ainda não são enviados.
  A fórmula `Progresso` só é convertida para 0–100 quando confere com Meta/Atual; senão o progresso é calculado na Central.
- O log de sincronização mostra os 300 registros mais recentes (a exportação em Configurações leva todos).
- Os arquivos anexos citados no pedido (`prompt-central-comando-comercial.md` e `0001_central_comando.sql`) não
  estavam no repositório; o esquema foi escrito a partir do texto do pedido. Se houver diferenças, posso conciliar.
