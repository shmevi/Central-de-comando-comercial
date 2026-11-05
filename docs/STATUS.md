# Status: funcional × demonstração

## Funcional (dados reais do usuário, persistidos)
- **Hoje, Minha Rotina, Agenda, Tarefas, Recrutamento** (MVP) — CRUD completo, filtros, busca, conclusão,
  reagendamento, conflitos, persistência.
- **Equipes e Feedbacks, Treinamentos, Reuniões, Sistemas e Melhorias, OKRs, Projetos** — CRUD completo com validações.
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

## Demonstração (fictício, sempre identificado)
- **Integração Notion**: adaptador *mock*. Nenhum workspace real é acessado e não existe escrita.
  Itens importados recebem o selo "Demonstração".
- **"Carregar demonstração"** (Configurações): pessoas, feedback, candidatos, OKR e sistema fictícios com selo
  "Demonstração", removíveis com um clique. Por padrão o app inicia **sem** dados fictícios.

## Limitações conhecidas / próximos passos
- O PIN de feedbacks é uma barreira de interface (guardado como hash SHA-256, mas um PIN curto é fácil de adivinhar
  por força bruta); a proteção real é login + RLS. Perfis com papéis diferentes
  (ex.: supervisor que lê só a própria equipe) exigem tabela de membros/papéis — ainda não modelado.
- Multiusuário compartilhando os mesmos dados (equipe) não está modelado: cada usuário tem seu próprio espaço.
- Se você apagar todos os blocos de rotina de hoje, a tela Hoje gera a rotina-base de novo ao abrir.
- Mudar o horário do intervalo em Configurações não altera o bloco "Intervalo" do modelo de rotina: ajuste os dois.
- Cada pessoa que entra tem o próprio espaço de dados. Não há tela para administrar usuários dentro do app:
  usuários são criados e removidos no painel do Supabase (Authentication → Users).
- Arrastar e soltar nos Kanbans usa HTML5 drag (desktop); no celular e por teclado use o seletor "Mover".
- Adaptador Notion real via MCP: implementar `NotionAdapter` com `kind: 'mcp'` (somente leitura primeiro).
- Os arquivos anexos citados no pedido (`prompt-central-comando-comercial.md` e `0001_central_comando.sql`) não
  estavam no repositório; o esquema foi escrito a partir do texto do pedido. Se houver diferenças, posso conciliar.
