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

- **Componentes compartilhados** (`src/components/ui`): `KanbanBoard` (Tarefas),
  `useDraft` (estado dos formulários), `SearchInput`, `DateNav`, `useConfirm().confirmDelete`, `ErrorBoundary`.

## Desempenho

- **Store** (`src/data/store.ts`): cada coleção é carregada uma vez; pedidos repetidos ao mesmo tempo viram um só
  (`inflight`), respostas de uma sessão anterior são descartadas (`generation`). `update` e `remove` são **otimistas**:
  a tela muda na hora e volta ao estado anterior se o servidor recusar.
- **Abertura**: `prefetch(HOME_DATA)` (`src/data/prefetch.ts`) pede os dados da tela inicial em paralelo enquanto o
  `ensureSeed` confere a primeira execução — uma única "onda" de pedidos.
- **Rotas**: páginas em `React.lazy` (`src/app/routes.ts`). Passar o mouse, focar ou tocar num item do menu já baixa o
  código e os dados daquela tela (`prefetchRoute`); depois de ~1,5 s ocioso as telas leves são baixadas em segundo plano
  (`prefetchIdle`, desligado em economia de dados/2G). Telas com gráficos (Relatórios, pessoa) só sob demanda.
- **Supabase** (`src/data/supabaseRepository.ts`): a 1ª página traz a contagem (`count: 'exact'`) e as demais páginas
  (500 linhas) vêm em paralelo; sem contagem, cai na paginação sequencial. `RECENT_LIMIT` (`sync_logs`: 300 mais
  recentes) evita carregar o log inteiro — a exportação usa `list({ all: true })`. `createMany` grava em lotes de 200.
- **Notion**: a sincronização grava em lote (`createMany`) e atualiza com concorrência limitada (`pool`, 6); o envio
  processa até 4 itens em paralelo e grava o progresso uma vez por objetivo.
- **Logo** (`src/data/branding.ts`): o upload é reduzido para no máximo 512 px em WebP; uma logo antiga pesada é
  otimizada uma vez em segundo plano (a original fica no Storage). A imagem fica em cache no navegador
  (`ccc:logo-cache:<caminho>`), então não é baixada a cada abertura; o ícone do atalho é gerado quando o navegador está ocioso.

## Busca em tudo

`src/features/search/`: `searchIndex.ts` (puro e testado: sem acento, todas as palavras, título primeiro, 5 por grupo) e
`GlobalSearch.tsx` (lupa no topo e Ctrl+K). Lê as coleções só quando a busca abre, respeita a instituição do topo e
abre o item por link: `/tarefas?tarefa=`, `/reunioes?reuniao=`, `/agenda?data=`, `/okrs?objetivo=`, `/equipes/<id>`.

## Rotina: folga e intervalo

- `features/routine/offDays.ts`: dias apagados de propósito ("Dia de folga") ficam em `settings.routine_off_dates`
  (migration 0008; até 60 dias). Antes da 0008 no banco, a marca fica só no navegador — nada quebra.
- `features/routine/templateBreak.ts`: salvar a Jornada move o bloco "Intervalo" do modelo de rotina e avisa se ele
  passar a encostar em outro bloco (sem mexer nos outros). No editor do modelo, o horário do intervalo fica travado.

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
| `/equipes` | Equipes e Feedbacks | pessoas multi-instituição; aba **Números** (lançamento mensal); feedback (positivos, a desenvolver, plano, prazo, revisões, números congelados), acesso restrito |
| `/equipes/:id` | Números da pessoa | mês com variação, média de 3 meses, média da equipe (mesma instituição e mês), gráficos de conversão e ticket, tabela mês a mês |
| `/treinamentos` | Treinamentos | catálogo, trilhas, presença e nota |
| `/reunioes` | Reuniões | modelos, pauta, decisões, ata, encaminhamentos (responsável e prazo) → tarefa |
| `/okrs` | OKRs | objetivos por instituição e ciclo; progresso só com meta válida |
| `/projetos` | Projetos | etapas, entregas, responsáveis, dependências; "em andamento" exige confirmação |
| `/relatorios` | Relatórios | diário/semanal, CSV e PDF, "Não preenchido" ≠ zero |
| `/integracoes` | Integrações | Notion (real no modo Supabase; demonstração no modo local), mapeamento de campos, fila de revisão, log |
| `/configuracoes` | Configurações | perfil, tema, jornada, instituições, foco semanal, categorias, modelo de rotina, permissões, dados |

## Modelo de dados

Todas as tabelas têm `id`, `user_id`, `created_at`, `updated_at`, `is_demo`, `external_ref`.
Tipos completos em `src/domain/types.ts`; DDL em `supabase/migrations/` (0001 base, 0002 Notion, 0003 relatórios/logo, 0004 logo 5 MB, 0005 vínculo Notion, 0006 atribuição, 0007 números da equipe, 0008 dias sem rotina — `settings.routine_off_dates`).

> **Recrutamento** e **Sistemas e Melhorias** foram retirados da interface (menu, rotas e telas). As tabelas
> `candidates`, `interviews`, `systems` e `improvements` **continuam no banco com os dados intactos** e entram no backup.

| Tabela (0007) | Campos-chave | Regras |
|---|---|---|
| person_metrics | person_id, institution_id, month (dia 1), leads, enrollments, revenue (opcional), notes | RLS por usuário; 1 por pessoa × instituição × mês; valores ≥ 0; pessoa e instituição do mesmo usuário; apagar instituição com lançamentos é recusado |
| feedbacks.metrics_snapshot | `{ taken_at, institution_id, months[] }` só com valores digitados | default `{}` (inserts antigos continuam válidos) |

**Feedback em números** (`src/lib/metrics.ts`, funções puras): conversão = matrículas ÷ leads; ticket = valor ÷ matrículas —
sempre calculados, nunca gravados. Divisor 0 ou valor vazio → "—"; mês sem lançamento fica vazio (sem zero ou estimativa);
somas antes de dividir (média ponderada); matrículas > leads é aceito e só sinalizado. Período: 6 meses fechados + mês atual.
Variação: p.p. na conversão e % no ticket; média de 3 meses = 3 meses anteriores com lançamento; média da equipe só com
outras pessoas na mesma instituição e mês. Telas sem meta e sem cor de bom/ruim.

| Tabela (0003) | Campos-chave | Regras |
|---|---|---|
| report_entries | date, kind (conquista, destaque, pendencia, anotacao, prioridade), text, institution_id | RLS por usuário; texto 1–4000 caracteres |
| settings.logo_path | caminho no bucket `branding` | sem URL/`data:`; Storage só na pasta `<user_id>/` |

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

- Títulos (h1–h4, títulos de cartão, marca): **Capture It** (reserva: Barlow Condensed). Texto, botões, etiquetas e campos: **Inter**.
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

Servidor: Edge Function `supabase/functions/notion-sync` (lógica em `serverHandler.ts`, adaptador da API oficial em
`apiAdapter.ts` — nenhum dos dois é importado por tela, então não vão para o navegador). Lê o Notion com o token do
Edge Secret `NOTION_TOKEN` e a Central com o JWT de quem chamou (RLS). Só atende quem tem vínculo em
`public.notion_access` (conta ↔ pessoa no Notion, criado pelo administrador) e usa **sempre** o `person_id` desse
vínculo — o ID digitado nas Configurações não permite ler outra pessoa. Modos (ambos somente leitura do Notion):
`dry_run` (padrão; contagens e IDs) e `read` (páginas do responsável, minimizadas por `clientRead`: só as propriedades
usadas, sem corresponsáveis; páginas de outra pessoa viram esqueleto sem dados). No modo Supabase, o botão
"Sincronizar" da tela Integrações chama o modo `read` (`remoteReader.ts`) e o navegador planeja e grava **na Central**
com a sessão do usuário (`sync.ts`). No modo local continua o adaptador de demonstração. Modo `push` (único caminho
de escrita): exige `settings.notion_enabled` e `notion_write_enabled` (lidos com o JWT de quem chamou), valida em
`pushCore.ts` (campos permitidos, página da base e do responsável, opções existentes, anti-sobrescrita contra a base) e faz
`PATCH /pages/{id}` só com as propriedades alteradas. O navegador monta as pendências (`push.ts`) e só envia depois da
confirmação na tela (`features/notion/PushPanel.tsx`). Conteúdo das páginas: `blocks.ts` converte os blocos
(`GET /blocks/{id}/children`, até 300 blocos e 2 níveis) em texto; `readNotion({ bodies: true })` só lê o conteúdo de
páginas que passaram pela barreira 2; o plano espelha em `tasks.description` e em `description`/`reason`/`notion_body`
do KR, fora das três vias (somente leitura na Central; nunca enviado ao Notion). `dry_run: false` é recusado. Deploy:
`npm run build:edge` gera `supabase/functions/notion-sync/dist/index.js` (bundle único, sem dependências) para enviar
ao Supabase.

Banco: migration `0002_notion_sync.sql` (`notion_sync_state`, unicidade de `external_ref`, `review_queue.kind`,
`sync_logs.external_id/fields_changed`, `settings.notion_config`). O token do Notion **nunca** fica no banco nem no
frontend. Migration `0005_notion_access.sql`: tabela de vínculo (o usuário só lê a própria linha; não cria nem altera).
Migration `0006_tarefas_atribuicao.sql`: `tasks.attribution` (ATRIBUIÇÃO do Notion). Tarefas sincronizadas antes dela
adotam a atribuição do Notion sem conflito (base antiga sem o campo).
