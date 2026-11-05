# Arquitetura

## Visão geral

```
 Páginas (src/pages)  ──►  hooks/useCollection (src/data/store.ts)  ──►  Repository<T>
                                                                      ├─ LocalRepository    (localStorage)
                                                                      └─ SupabaseRepository (PostgREST + RLS)
```

- **A UI nunca chama o Supabase diretamente.** Ela usa `useCollection('<tabela>')`, que expõe
  `items / loading / error / create / update / remove / reload`. O repositório concreto é escolhido em
  `src/data/index.ts` conforme `DATA_MODE`.
- Campos em `snake_case` casam 1:1 com as colunas do banco (sem camada de mapeamento).
- `user_id` é preenchido pelo banco (`default auth.uid()`); políticas RLS restringem cada linha ao dono.
- Primeira execução por usuário: `ensureSeed()` cria configurações, as 3 instituições, a rotina-base e as
  3 tarefas iniciais (04, 05 e 06/11/2026), sem recorrência, sem nomes de candidatos e sem horários.
- **Escopo de instituição** global (cabeçalho): todas as telas filtram por instituição para não misturar dados.
  Candidatos, feedbacks e OKRs exigem instituição; o banco valida que a instituição pertence ao mesmo usuário.

## Stack

React 18 + TypeScript + Vite · Tailwind CSS · componentes no padrão shadcn/ui (Radix Dialog/Slot + CVA) ·
Lucide · Recharts · jsPDF (PDF) · Supabase JS · Vitest · Playwright (fumaça).

## Mapa de telas

| Rota | Módulo | Principais recursos |
|---|---|---|
| `/` | Hoje | saudação, status do expediente, barra 8h48, missão do dia (máx. 3), anotação rápida, rotina com bloco atual, próximas entrevistas, indicadores |
| `/rotina` | Minha Rotina | timeline editável, status (planejado/em andamento/concluído/adiado), intervalo protegido com exceção explícita, visões dia/semana, conflitos |
| `/agenda` | Agenda Semanal | foco por dia, visões dia/semana/mês, eventos + entrevistas + reuniões, detecção de conflitos |
| `/tarefas` | Tarefas | CRUD, instituição, prioridade, prazo, checklist, recorrência, histórico, lista/Kanban, filtros, busca |
| `/recrutamento` | Recrutamento | pipeline de 8 etapas, entrevistas, conflitos, presença, decisão, convite copiável (WhatsApp), LGPD |
| `/equipes` | Equipes e Feedbacks | pessoas multi-instituição, feedback (positivos, a desenvolver, plano, prazo, revisões), acesso restrito |
| `/treinamentos` | Treinamentos | catálogo, trilhas, presença e nota |
| `/reunioes` | Reuniões | modelos, pauta, decisões, ata, encaminhamentos (responsável e prazo) → tarefa |
| `/sistemas` | Sistemas e Melhorias | inventário, Kanban de 6 etapas, proposta × implantação confirmada |
| `/okrs` | OKRs | objetivos por instituição e ciclo; progresso só com meta válida |
| `/projetos` | Projetos | etapas, entregas, responsáveis, dependências; "em andamento" exige confirmação |
| `/relatorios` | Relatórios | diário/semanal, CSV e PDF, "Não preenchido" ≠ zero |
| `/integracoes` | Integrações | Notion (adaptador de demonstração), mapeamento de campos, fila de revisão, log |
| `/configuracoes` | Configurações | perfil, tema, jornada, instituições, foco semanal, categorias, modelo de rotina, permissões, dados |

## Modelo de dados

Todas as tabelas têm `id`, `user_id`, `created_at`, `updated_at`, `is_demo`, `external_ref`.
Tipos completos em `src/domain/types.ts`; DDL em `supabase/migrations/0001_central_comando.sql`.

| Tabela | Campos-chave | Regras no banco |
|---|---|---|
| institutions | code, name, color, active | único por usuário (code) |
| settings | jornada, categorias, foco semanal, mapeamento Notion, permissões | 1 por usuário |
| tasks | title, institution_id, priority, status, due_date, checklist[], recurrence, is_mission, history[] | enums via `check` |
| routine_templates | name, weekday, blocks[] | — |
| routine_blocks | date, start, end, status, is_break, break_exception(+motivo) | fim > início; exceção exige motivo |
| agenda_events | date, start, end, kind | `external_synced` sempre `false` |
| notes | date, text | — |
| people | name, role, institution_ids[] | — |
| feedbacks | person_id, institution_id, positives, to_develop, action_plan, deadline, reviews[] | — |
| candidates | name, stage, institution_id, consent_lgpd, retention_until, history[] | 8 etapas |
| interviews | candidate_id, date, start, end, attendance, time_confirmed, score, decision | horário confirmado exige início/fim; nota 0–10 |
| trainings | track, attendees[] | duração > 0 |
| meetings | agenda, decisions, minutes, actions[] | — |
| systems / improvements | inventário; stage, kind (proposta/implantada) | implantada ⇒ concluído + data |
| objectives | cycle, key_results[] (start/target/current) | — |
| projects | status, status_confirmed, steps[] (depends_on) | em andamento ⇒ confirmado |
| sync_logs / review_queue | log e fila de revisão do Notion | fila única por external_id |

Segurança: RLS habilitado e **forçado** em todas as tabelas, 4 políticas (select/insert/update/delete) com
`(select auth.uid()) = user_id`, acesso revogado de `anon`, e gatilho que impede referenciar instituição de outro usuário.

## Design system

Tokens em `src/styles/tokens.css` (canais RGB, consumidos pelo Tailwind em `tailwind.config.js`):

| Token | Escuro (padrão) | Uso |
|---|---|---|
| `--bg` / `--surface` / `--surface-2` / `--border` | #0B0B0D / #141416 / #1C1C20 / #2A2A30 | fundos e bordas |
| `--gold-100/300/700` | #F3D88E / #D4AF5A / #8C6B2E | gradiente dos botões primários e monograma |
| `--orange` | #E9852B | apoio, avisos, selo "Demonstração" |
| `--fg` / `--muted` | #F3EFE6 / #A39E92 | texto creme e cinza-quente |
| `--chart-1` | #B08A3D | barras (validado para contraste e banda de luminosidade) |

- Títulos e botões: **Barlow Condensed**, caixa alta, negrito. Texto: **Inter**.
- Botão primário: gradiente dourado com texto escuro; secundário: contorno dourado; raios 12–16px.
- Modo claro (`data-theme="light"`) com tons de dourado escurecidos para manter contraste AA.
- Monograma "CP" (sem reproduzir o leão do site). Foco visível em todos os controles; link "Pular para o conteúdo".

## Integração Notion

`NotionAdapter` (`src/integrations/notion/adapter.ts`) define só leitura. Nesta fase existe apenas
`mockNotionAdapter`, que retorna páginas fictícias marcadas como demonstração. A sincronização:
1. lê tarefas, OKRs e reuniões; 2. usa o mapeamento de campos; 3. importa itens com instituição reconhecida;
4. manda itens sem instituição para a **fila de revisão**; 5. ignora IDs já importados; 6. grava no **log**.
A escrita está desativada; a chave de autorização exige confirmação e nenhuma operação de escrita foi implementada.
A troca para MCP real é implementar um novo `NotionAdapter` com `kind: 'mcp'` e `isDemo: false`.
