# Checklist de testes

Legenda: **[A]** coberto por teste automático (`npm test` ou `npm run test:e2e`) · **[M]** verificação manual.

## Geral
- [A] Testes de navegador rodam no **build de produção**, com a mesma `Content-Security-Policy` da Vercel/Netlify (`npm run test:e2e`)
- [A] Abrir uma rota interna direto (ex.: `/relatorios`) funciona — sem 404
- [A] Todas as 14 rotas abrem sem erro de console (desktop 1366px e celular 360px)
- [A] Nenhuma rota tem rolagem horizontal no celular
- [A] Dados persistem após recarregar a página
- [A] Primeiro `Tab` foca "Pular para o conteúdo"; foco visível em todos os controles
- [M] Alternar tema escuro/claro (cabeçalho e Configurações) e verificar legibilidade
- [M] Filtro global de instituição altera todas as telas; "Sem instituição" mostra só itens não classificados
- [M] Navegação inferior no celular + menu "Mais" com todos os módulos

## Hoje
- [A] Jornada = 8h48 (528 min); semana = 44h; status antes/em expediente/intervalo/encerrado/sem expediente
- [A] Missão do dia aceita no máximo 3 tarefas e avisa ao exceder
- [M] Rotina do dia gerada automaticamente em dia útil; bloco atual destacado com "Agora"
- [M] Anotação rápida: criar com Enter, excluir
- [M] Indicadores de abertas/atrasadas/vencem hoje/concluídas hoje batem com Tarefas

## Minha Rotina
- [A] Intervalo não pode ser excluído; bloco que invade o intervalo exige exceção explícita + motivo
- [M] Alterar status (planejado → em andamento → concluído / adiado); barra de progresso atualiza
- [M] Criar, editar e excluir bloco; validação fim > início; conflito entre blocos sinalizado
- [M] Visão semana mostra seg–sex e permite gerar dia; "Restaurar base" pede confirmação

## Agenda Semanal
- [M] Visões dia/semana/mês e navegação anterior/próximo/hoje
- [M] Foco modelo por dia (seg dados e metas … sex reuniões)
- [M] Evento sobreposto a entrevista/reunião mostra conflito no formulário e na grade
- [M] Aviso ao marcar evento no intervalo ou no fim de semana

## Tarefas
- [A] Tarefas iniciais 04/11, 05/11 e 06/11/2026 presentes uma única vez, sem recorrência
- [A] Validação de título; criar; concluir; busca; visão Kanban
- [A] Recorrência diária pula fim de semana; semanal +7; mensal respeita último dia do mês
- [A] Mover para "Concluída" pelo Kanban ou pelo formulário grava a data de conclusão (conta no relatório)
- [A] Reabrir e concluir de novo não duplica a recorrência; concluir com atraso não gera ocorrência já vencida
- [M] Checklist (adicionar, marcar, remover); histórico registra criação, edição e mudanças de status
- [M] Filtros por status, prioridade, categoria e atalhos (hoje, atrasadas, missão)
- [M] Arrastar entre colunas do Kanban ou usar o seletor "Mover"
- [M] Excluir pede confirmação

## Navegação e identidade
- [A] Recrutamento e Sistemas e Melhorias fora do menu e das rotas (dados preservados no banco)
- [A] Grupos da barra lateral abrem/fecham (aria-expanded), lembram o estado e o grupo da página atual fica aberto
- [A] Logo: escolher PNG, prévia, persistir após recarregar, recusar SVG disfarçado, remover e voltar ao monograma
- [A] Modo Supabase: logo no Storage na pasta do usuário; outro usuário não herda; conquistas em report_entries
- [A] Storage/RLS (PostgreSQL): bucket privado com limite e tipos; ninguém lê/grava/apaga a pasta de outro usuário
- [M] Fonte Capture It aparece na marca e nos títulos depois que o arquivo for adicionado em src/assets/fonts/

## Tarefas — origem
- [A] Todas / Rotina-Central / Notion (external_ref "notion:") com contadores; combina com busca, filtros, lista e Kanban
- [A] Filtrar não cria nem apaga tarefas

## Equipes e Feedbacks
- [M] Pessoa exige ao menos uma instituição; feedback exige instituição vinculada à pessoa
- [M] Restrição de acesso: com PIN definido, a aba Feedbacks pede PIN
- [M] Revisões com % de evolução; prazo vencido em destaque

## Reuniões / Treinamentos
- [M] Modelo preenche título, pauta e duração; encaminhamento exige responsável; "Criar tarefa" gera tarefa com a instituição da reunião
- [M] Treinamento: participantes filtrados pela instituição, presença e nota (0–10), progresso por trilha

## OKRs / Projetos
- [A] KR sem meta, ou meta igual ao valor inicial, não mostra progresso
- [M] OKR exige instituição e ciclo no formato 2026-T4
- [M] Projeto "em andamento" exige confirmação explícita; etapa com dependência pendente fica bloqueada

## Relatórios
- [A] "Não preenchido" distinto de zero; CSV com BOM e `;` (abre corretamente no Excel pt-BR)
- [A] Exportação CSV e PDF geram arquivo
- [M] Diário e semanal respeitam o filtro de instituição; gráfico com tabela equivalente

## Integrações
- [A] Leitura (demonstração) envia item sem instituição para a fila de revisão
- [A] Reunião sem data vai para a revisão (nunca recebe a data de hoje); prazos em formato inválido são descartados
- [M] Ativar leitura exige confirmação; escrita desativada por padrão e exige confirmação
- [M] Revisar: atribuir instituição e importar, ou descartar; segunda sincronização não duplica; log registra tudo

## Configurações
- [A] Jornada fora de ordem (ex.: intervalo depois do fim) é recusada
- [A] PIN guardado só como hash; links de sistemas só http(s) (bloqueia `javascript:` vindo de backup)
- [M] Alterar jornada recalcula carga efetiva; instituição com tarefas não pode ser excluída (só desativada)
- [M] Carregar/remover demonstração; exportar/importar backup JSON; apagar dados locais pede confirmação

## Supabase
- [A] Configuração: sem URL/chave no modo Supabase o app para e explica; chave secreta é recusada; URL `/rest/v1` é recusada
- [A] Leitura paginada: 1200 registros chegam completos; `user_id`/`created_at` nunca são enviados pelo app
- [A] Erros do banco em português (ex.: tabela ausente → “aplique a migration”)
- [A] Primeiro acesso interrompido é completado no acesso seguinte, sem duplicar
- [A] No navegador, contra Supabase simulado (`npm run test:supabase`): senha errada, “Esqueci minha senha”, login,
  primeiro acesso no banco, dados após recarregar, sair, isolamento entre dois usuários, link de recuperação → nova senha
- [A] RLS no PostgreSQL: usuário B não vê nem altera dados de A, não forja `user_id`, não referencia instituição/pessoa de A; `anon` sem acesso (`npm run test:rls`)
- [M] Projeto real: aplicar a migration, criar usuário com *Auto Confirm*, entrar, conferir o Security Advisor
- [M] Projeto real: “Esqueci minha senha” chega por e-mail e o link abre a tela de nova senha (exige Site URL/Redirect URLs)
- [M] Hospedagem: as variáveis `VITE_*` estão cadastradas e o site foi publicado de novo depois de mudá-las
