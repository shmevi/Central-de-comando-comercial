# Checklist de testes

Legenda: **[A]** coberto por teste automático (`npm test` ou `npm run test:e2e`) · **[M]** verificação manual.

## Geral
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
- [M] Indicadores de abertas/atrasadas/vencem hoje/entrevistas batem com Tarefas e Recrutamento

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

## Recrutamento
- [A] Candidato exige instituição; agendar entrevista move para "Entrevista agendada"
- [A] Conflito de horário entre entrevistas detectado
- [A] Horário não confirmado aparece como "a confirmar"; convite não inventa horário
- [M] Copiar convite (nada é enviado); aviso quando falta consentimento LGPD
- [M] Presença (pendente/confirmada/compareceu/faltou) e decisão atualizam a etapa do candidato
- [M] Prazo de retenção vencido sinalizado; exclusão do candidato remove também suas entrevistas

## Equipes e Feedbacks
- [M] Pessoa exige ao menos uma instituição; feedback exige instituição vinculada à pessoa
- [M] Restrição de acesso: com PIN definido, a aba Feedbacks pede PIN
- [M] Revisões com % de evolução; prazo vencido em destaque

## Reuniões / Treinamentos
- [M] Modelo preenche título, pauta e duração; encaminhamento exige responsável; "Criar tarefa" gera tarefa com a instituição da reunião
- [M] Treinamento: participantes filtrados pela instituição, presença e nota (0–10), progresso por trilha

## Sistemas e Melhorias / OKRs / Projetos
- [M] Melhoria só pode ser "implantada" na etapa Concluído e com data; mover para trás volta a "proposta"
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

## Supabase (quando configurado)
- [A] Feedback/entrevista/melhoria não podem apontar para pessoa/candidato/sistema de outro usuário (`npm run test:rls`)
- [M] Listas com mais de 1000 registros carregam completas (leitura paginada)
- [M] Sem `VITE_ALLOW_SIGNUP=true`, a tela de login não oferece "Criar conta"
- [M] Aplicar a migration em projeto novo; criar conta; seed criado uma única vez por usuário
- [A] Usuário B não vê nem altera dados de A, não forja `user_id`, não usa instituição de A; `anon` sem acesso (`npm run test:rls`)
- [M] Rodar *Advisors* de segurança do Supabase sem alertas de RLS
