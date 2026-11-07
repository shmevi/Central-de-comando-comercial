# Arquitetura

## Visão geral

```
 Páginas (src/pages)  ──►  hooks/useCollection (src/data/store.ts)  ──►  Repository<T>
                                                                      ├─ LocalRepository    (localStorage)
                                                                      └─ SupabaseRepository (PostgREST + RLS)
```

- **Configuração** (`src/data/config.ts`): decide o modo pelas variáveis `VITE_*` e recusa configuração perigosa.
- **A UI nunca chama o Supabase diretamente.** Ela usa `useCollection('<tabela>')`, que expõe
  `items / loading / error / create / update / remove / reload`. O repositório concreto é escolhido em
  `src/data/index.ts` conforme `DATA_MODE`.
- Campos em `snake_case` casam 1:1 com as colunas do banco (sem camada de mapeamento).
- `user_id` é preenchido pelo banco (`default auth.uid()`); políticas RLS restringem cada linha ao dono.
- Primeira execução por usuário: `ensureSeed()` cria configurações, as 3 instituições, a rotina-base e as
  3 tarefas iniciais (04, 05 e 06/11/2026), sem recorrência, sem nomes de candidatos e sem horários.
- **Escopo de instituição** global (cabeçalho): todas as telas filtram por instituição para não misturar dados.
  Candidatos, feedbacks e OKRs exigem instituição; o banco valida que a instituição pertence ao mesmo usuário.

- **Componentes compartilhados** (`src/components/ui`): `KanbanBoard` (Tarefas, Recrutamento, Melhorias),
  `useDraft` (estado dos formulários), `SearchInput`, `DateNav`, `useConfirm().confirmDelete`, `ErrorBoundary`.

## Stack

React 18 + TypeScript + Vite · Tailwind CSS · componentes no padrão shadcn/ui (Radix Dialog/Slot + CVA) ·
Lucide · Recharts · jsPDF (PDF) · Supabase JS · fontes Inter e Barlow Condensed embutidas (@fontsource) · Vitest · Playwright.

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

## Integração Notion (Notion → Central, somente leitura)

Escopo: **Tarefas e KRs/OKRs de um responsável**, identificado pelo **ID estável do usuário no Notion** — nunca
pelo nome. O ID do responsável e os IDs das bases ficam **só** em `settings.notion_config` (tela Integrações → Campos);
não há valor padrão no código. Faltando qualquer um, a sincronização não roda (fail-closed). Reuniões não fazem parte da integração. Arquivos em `src/integrations/notion/`:

| Arquivo | Papel |
|---|---|
| `config.ts` | Validação fail-closed da configuração, nomes das propriedades, mapeamentos aprovados de status/prioridade |
| `adapter.ts` | Contrato somente leitura: propriedades tipadas, pessoas com ID, paginação, `last_edited_time`, filtro na origem |
| `mockAdapter.ts` | Dados fictícios (selo "Demonstração") cobrindo todos os casos de escopo, valores desconhecidos e KRs |
| `mapping.ts` | Conversões puras Notion → Central; valor fora do mapeamento nunca recebe padrão |
| `hash.ts` | Estado canônico + SHA-256 dos campos sincronizados |
| `plan.ts` | Planejador puro: barreira 2, identidade por `external_ref`, três vias, agrupamento de KRs, disjuntor |
| `sync.ts` | Orquestra consulta → plano → gravação local; resolve itens da fila |

Regras: (1) **barreira 1** — a consulta filtra pelo ID do responsável e pelos grupos de status ativos;
**barreira 2** — cada página é validada de novo antes de qualquer gravação; páginas fora do escopo não geram item,
revisão nem log com dados delas. (2) Identidade `external_ref = notion:<page_id>`; título nunca é identidade.
(3) Itens do Notion têm `institution_id = null` e aparecem em qualquer filtro de instituição (`scopeMatchesItem`);
registros normais seguem o filtro antigo. (4) Fila de revisão por `kind`: `valor_desconhecido`, `kr_sem_objetivo`,
`kr_multiplos_objetivos`, `conflito`. (5) Três vias contra a base sincronizada: só o Notion mudou → aplica; só a
Central → `pendente_push`; os dois → conflito, nada sobrescrito. (6) Item apagado na Central não é recriado;
item que sumiu do Notion não é apagado na Central. (7) KRs são agrupados pelo Objetivo (base VISÃO); o título do
Objetivo é somente leitura na Central porque a página é compartilhada.

Banco: migration `0002_notion_sync.sql` (`notion_sync_state`, unicidade de `external_ref`, `review_queue.kind`,
`sync_logs.external_id/fields_changed`, `settings.notion_config`). O token do Notion **nunca** fica no banco nem no
frontend. A escrita (Central → Notion) e o adaptador real (API do Notion num componente servidor) são fases posteriores.
