-- =====================================================================
-- 0002 — Infraestrutura da sincronização Notion ↔ Central
--
-- Escopo: Tarefas e KRs/OKRs de UM responsável no Notion (ID estável em settings.notion_config).
-- Esta migration só prepara o banco. Ela não lê nem escreve no Notion e não guarda segredos:
-- o token do Notion NUNCA fica em tabela acessível pelo frontend (vai para os segredos do servidor).
--
-- Idempotente o suficiente para ser reaplicada num banco de teste; aplique em produção uma única vez,
-- depois da 0001.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Garantia contra duplicidade de external_ref (por usuário, quando preenchido)
--    Antes de criar os índices, recusa com mensagem clara se já houver duplicatas,
--    em vez de deixar o CREATE UNIQUE INDEX falhar com um erro genérico.
-- ---------------------------------------------------------------------
do $$
declare t text; n int;
begin
  foreach t in array array['tasks', 'objectives'] loop
    execute format(
      'select count(*) from (select 1 from public.%I where external_ref is not null group by user_id, external_ref having count(*) > 1) d', t)
      into n;
    if n > 0 then
      raise exception 'Migration 0002 interrompida: % grupo(s) de external_ref duplicado em public.%. Resolva as duplicatas antes de aplicar.', n, t
        using hint = format('select user_id, external_ref, count(*) from public.%I where external_ref is not null group by 1, 2 having count(*) > 1;', t);
    end if;
  end loop;
end $$;

create unique index if not exists tasks_external_ref_uniq
  on public.tasks (user_id, external_ref) where external_ref is not null;
create unique index if not exists objectives_external_ref_uniq
  on public.objectives (user_id, external_ref) where external_ref is not null;

-- ---------------------------------------------------------------------
-- 2. Estado de sincronização por página do Notion (tarefa, KR ou objetivo)
-- ---------------------------------------------------------------------
create table if not exists public.notion_sync_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  is_demo boolean not null default false, external_ref text,

  entity text not null check (entity in ('tarefas', 'krs', 'objetivos')),
  -- Registro local correspondente. Para KR é o id do KR dentro de objectives.key_results (jsonb),
  -- por isso não há chave estrangeira. null = ainda não importado (ex.: aguardando revisão).
  local_id text,
  local_parent_id text,                 -- KR: id do objective local que o contém
  notion_page_id text not null,
  notion_parent_id text,                -- KR: página do Objetivo (VISÃO) a que pertence
  pinned_parent_id text,                -- KR com vários Objetivos: escolha registrada na revisão

  synced_hash text,                     -- SHA-256 do último estado em que os dois lados concordavam
  synced_snapshot jsonb,                -- esse mesmo estado (base para conflitos campo a campo)
  last_notion_edited_time timestamptz,
  last_central_updated_at timestamptz,
  last_synced_at timestamptz,
  last_change_origin text check (last_change_origin in ('notion', 'central')),
  echo_edited_time timestamptz,         -- last_edited_time devolvido pela nossa própria escrita (anti-eco)

  sync_status text not null default 'ok' check (sync_status in (
    'ok', 'pendente_push', 'conflito', 'revisao', 'suspenso', 'fora_do_escopo', 'removido_no_notion', 'removido_na_central')),

  -- Disjuntor anti-loop: escritas do mesmo item numa janela de tempo
  write_count_window int not null default 0 check (write_count_window >= 0),
  write_window_started_at timestamptz,

  unique (user_id, notion_page_id)
);

alter table public.notion_sync_state enable row level security;
alter table public.notion_sync_state force row level security;
drop policy if exists notion_sync_state_select_own on public.notion_sync_state;
drop policy if exists notion_sync_state_insert_own on public.notion_sync_state;
drop policy if exists notion_sync_state_update_own on public.notion_sync_state;
drop policy if exists notion_sync_state_delete_own on public.notion_sync_state;
create policy notion_sync_state_select_own on public.notion_sync_state for select to authenticated using ((select auth.uid()) = user_id);
create policy notion_sync_state_insert_own on public.notion_sync_state for insert to authenticated with check ((select auth.uid()) = user_id);
create policy notion_sync_state_update_own on public.notion_sync_state for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy notion_sync_state_delete_own on public.notion_sync_state for delete to authenticated using ((select auth.uid()) = user_id);
drop trigger if exists notion_sync_state_updated_at on public.notion_sync_state;
create trigger notion_sync_state_updated_at before update on public.notion_sync_state
  for each row execute function public.set_updated_at();
create index if not exists notion_sync_state_user_idx on public.notion_sync_state (user_id);
create index if not exists notion_sync_state_status_idx on public.notion_sync_state (user_id, sync_status);
revoke all on public.notion_sync_state from anon;
grant select, insert, update, delete on public.notion_sync_state to authenticated;

-- ---------------------------------------------------------------------
-- 3. Fila de revisão: tipos de motivo e reentrada do mesmo item
-- ---------------------------------------------------------------------
-- Registros antigos (criados pela integração de demonstração) recebem o tipo legado 'instituicao'.
-- O default é MANTIDO: o código antigo em Production insere sem informar kind e continua funcionando.
-- A integração nova sempre informa kind explicitamente.
alter table public.review_queue add column if not exists kind text not null default 'instituicao';
alter table public.review_queue drop constraint if exists review_queue_kind_check;
alter table public.review_queue add constraint review_queue_kind_check check (kind in (
  'conflito', 'kr_multiplos_objetivos', 'kr_sem_objetivo', 'valor_desconhecido',
  'instituicao', 'reuniao_sem_data'   -- legados: não são mais criados pela integração
));

-- Entidades: 'krs' e 'objetivos' passam a existir; 'okrs' e 'reunioes' ficam só para registros antigos.
alter table public.review_queue drop constraint if exists review_queue_entity_check;
alter table public.review_queue add constraint review_queue_entity_check
  check (entity in ('tarefas', 'krs', 'objetivos', 'okrs', 'reunioes'));

alter table public.review_queue drop constraint if exists review_queue_resolution_check;
alter table public.review_queue add constraint review_queue_resolution_check check (resolution in (
  'importado', 'descartado', 'manter_notion', 'manter_central', 'objetivo_escolhido'));

-- O unique antigo (user_id, source, external_id) impedia que um item já revisado voltasse à fila
-- por outro motivo ou num evento posterior. Passa a valer só entre pendências abertas do MESMO tipo.
do $$
declare c text;
begin
  select con.conname into c
    from pg_constraint con
   where con.conrelid = 'public.review_queue'::regclass and con.contype = 'u'
     and (select array_agg(att.attname::text order by att.attname)
            from unnest(con.conkey) k join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k)
         = array['external_id', 'source', 'user_id'];
  if c is not null then execute format('alter table public.review_queue drop constraint %I', c); end if;
end $$;
create unique index if not exists review_queue_open_uniq
  on public.review_queue (user_id, source, external_id, kind) where not resolved;

-- ---------------------------------------------------------------------
-- 4. Log: qual item e quais campos (sem dados de outros responsáveis — isso é garantido no app)
-- ---------------------------------------------------------------------
alter table public.sync_logs add column if not exists external_id text;
alter table public.sync_logs add column if not exists fields_changed jsonb;
create index if not exists sync_logs_external_idx on public.sync_logs (user_id, external_id) where external_id is not null;

-- ---------------------------------------------------------------------
-- 5. Configuração da integração (sem segredos)
--    { person_id, person_name, tasks_data_source_id, krs_data_source_id, objectives_data_source_id,
--      cursors: { tarefas, krs }, last_sync_at }
-- ---------------------------------------------------------------------
alter table public.settings add column if not exists notion_config jsonb not null default '{}';
