-- =====================================================================
-- Central de Comando Comercial — esquema inicial (PostgreSQL / Supabase)
-- Tabelas tipadas, RLS por usuário (user_id = auth.uid()).
-- NÃO aplicar em projeto existente sem autorização explícita.
-- Os nomes de colunas casam 1:1 com src/domain/types.ts.
-- =====================================================================

create extension if not exists pgcrypto;

-- Função genérica para updated_at
create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end; $$;

-- Colunas comuns em todas as tabelas
-- id, user_id (default auth.uid()), created_at, updated_at, is_demo, external_ref

create table public.institutions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  is_demo boolean not null default false, external_ref text,
  code text not null, name text not null, color text not null default '#A39E92', active boolean not null default true,
  unique (user_id, code)
);

create table public.settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade unique,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  is_demo boolean not null default false, external_ref text,
  theme text not null default 'dark' check (theme in ('dark','light','system')),
  workday_start text not null default '12:12', workday_end text not null default '22:00',
  break_start text not null default '18:00', break_end text not null default '19:00',
  daily_minutes int not null default 528, weekly_minutes int not null default 2640,
  categories jsonb not null default '[]', weekly_focus jsonb not null default '{}',
  notion_enabled boolean not null default false, notion_write_enabled boolean not null default false,
  notion_mapping jsonb not null default '{}', display_name text not null default 'Coordenador',
  permissions jsonb not null default '{"feedbacks_restricted": true, "feedback_pin": ""}'
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  is_demo boolean not null default false, external_ref text,
  title text not null check (length(trim(title)) > 0), description text not null default '',
  institution_id uuid references public.institutions(id) on delete set null,
  priority text not null default 'media' check (priority in ('baixa','media','alta','urgente')),
  status text not null default 'a_fazer' check (status in ('a_fazer','em_andamento','aguardando','concluida','cancelada')),
  due_date date, category text not null default 'Geral', checklist jsonb not null default '[]',
  recurrence text not null default 'nenhuma' check (recurrence in ('nenhuma','diaria','semanal','mensal')),
  is_mission boolean not null default false, mission_date date, completed_at timestamptz,
  history jsonb not null default '[]'
);

create table public.routine_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  is_demo boolean not null default false, external_ref text,
  name text not null, weekday int check (weekday between 0 and 6), blocks jsonb not null default '[]', is_default boolean not null default false
);

create table public.routine_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  is_demo boolean not null default false, external_ref text,
  date date not null, start text not null, "end" text not null, title text not null, category text not null default 'Geral',
  status text not null default 'planejado' check (status in ('planejado','em_andamento','concluido','adiado')),
  notes text not null default '', is_break boolean not null default false,
  break_exception boolean not null default false, break_exception_reason text not null default '',
  institution_id uuid references public.institutions(id) on delete set null,
  check ("end" > start),
  check (not break_exception or length(trim(break_exception_reason)) > 0)
);

create table public.agenda_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  is_demo boolean not null default false, external_ref text,
  title text not null, date date not null, start text not null, "end" text not null,
  kind text not null default 'compromisso' check (kind in ('compromisso','reuniao','entrevista','treinamento','foco')),
  institution_id uuid references public.institutions(id) on delete set null,
  location text not null default '', notes text not null default '',
  external_synced boolean not null default false check (external_synced = false)
);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  is_demo boolean not null default false, external_ref text,
  date date not null, text text not null
);

create table public.people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  is_demo boolean not null default false, external_ref text,
  name text not null, role text not null default '', email text not null default '', phone text not null default '',
  institution_ids uuid[] not null default '{}', active boolean not null default true, notes text not null default ''
);

create table public.feedbacks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  is_demo boolean not null default false, external_ref text,
  person_id uuid not null references public.people(id) on delete cascade,
  institution_id uuid references public.institutions(id) on delete set null,
  date date not null, positives text not null default '', to_develop text not null default '', action_plan text not null default '',
  deadline date, status text not null default 'aberto' check (status in ('aberto','em_acompanhamento','concluido')),
  reviews jsonb not null default '[]', confidential boolean not null default true
);

create table public.candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  is_demo boolean not null default false, external_ref text,
  name text not null, phone text not null default '', email text not null default '', position text not null default '',
  institution_id uuid references public.institutions(id) on delete set null,
  stage text not null default 'recebido' check (stage in ('recebido','triagem','selecionado','entrevista_agendada','entrevistado','aprovado','banco_talentos','reprovado')),
  source text not null default '', notes text not null default '',
  consent_lgpd boolean not null default false, consent_at timestamptz, retention_until date,
  history jsonb not null default '[]'
);

create table public.interviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  is_demo boolean not null default false, external_ref text,
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  institution_id uuid references public.institutions(id) on delete set null,
  date date not null, start text not null default '', "end" text not null default '',
  location text not null default '', interviewer text not null default '',
  attendance text not null default 'pendente' check (attendance in ('pendente','confirmada','recusada','compareceu','faltou')),
  time_confirmed boolean not null default false, evaluation text not null default '',
  score numeric check (score between 0 and 10),
  decision text not null default 'pendente' check (decision in ('pendente','aprovado','banco_talentos','reprovado')),
  check (not time_confirmed or (start <> '' and "end" <> ''))
);

create table public.trainings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  is_demo boolean not null default false, external_ref text,
  title text not null, track text not null check (track in ('atendimento','objecoes','negociacao','crm','fechamento','outro')),
  institution_id uuid references public.institutions(id) on delete set null,
  date date, duration_min int not null default 60 check (duration_min > 0), description text not null default '',
  attendees jsonb not null default '[]'
);

create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  is_demo boolean not null default false, external_ref text,
  title text not null, institution_id uuid references public.institutions(id) on delete set null,
  date date not null, start text not null, "end" text not null, template text not null default 'livre',
  agenda text not null default '', decisions text not null default '', minutes text not null default '',
  actions jsonb not null default '[]', participants text not null default ''
);

create table public.systems (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  is_demo boolean not null default false, external_ref text,
  name text not null, purpose text not null default '', owner text not null default '',
  institution_ids uuid[] not null default '{}',
  status text not null default 'ativo' check (status in ('ativo','em_avaliacao','descontinuado')), url text not null default ''
);

create table public.improvements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  is_demo boolean not null default false, external_ref text,
  title text not null, description text not null default '',
  system_id uuid references public.systems(id) on delete set null,
  institution_id uuid references public.institutions(id) on delete set null,
  stage text not null default 'backlog' check (stage in ('backlog','analise','planejado','desenvolvimento','testes','concluido')),
  kind text not null default 'proposta' check (kind in ('proposta','implantada')),
  implemented_at date, impact text not null default '',
  check (kind = 'proposta' or (stage = 'concluido' and implemented_at is not null))
);

create table public.objectives (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  is_demo boolean not null default false, external_ref text,
  title text not null, institution_id uuid references public.institutions(id) on delete set null,
  cycle text not null default '', owner text not null default '', key_results jsonb not null default '[]'
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  is_demo boolean not null default false, external_ref text,
  name text not null, institution_id uuid references public.institutions(id) on delete set null,
  owner text not null default '', description text not null default '',
  status text not null default 'proposto' check (status in ('proposto','em_andamento','pausado','concluido')),
  status_confirmed boolean not null default false,
  start_date date, end_date date, steps jsonb not null default '[]',
  check (status <> 'em_andamento' or status_confirmed)
);

create table public.sync_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  is_demo boolean not null default false, external_ref text,
  source text not null default 'notion', direction text not null check (direction in ('leitura','escrita')),
  entity text not null, status text not null check (status in ('sucesso','erro','revisao')),
  message text not null default '', is_demo_source boolean not null default true
);

create table public.review_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  is_demo boolean not null default false, external_ref text,
  source text not null default 'notion', entity text not null check (entity in ('tarefas','okrs','reunioes')),
  external_id text not null, title text not null default '', payload jsonb not null default '{}',
  resolved boolean not null default false, resolution text check (resolution in ('importado','descartado')),
  unique (user_id, source, external_id)
);

-- ---------------------------------------------------------------------
-- RLS, gatilhos e índices para todas as tabelas
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['institutions','settings','tasks','routine_templates','routine_blocks','agenda_events','notes',
    'people','feedbacks','candidates','interviews','trainings','meetings','systems','improvements','objectives',
    'projects','sync_logs','review_queue']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t || '_select_own', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', t || '_insert_own', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t || '_update_own', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', t || '_delete_own', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_updated_at', t);
    execute format('create index %I on public.%I (user_id)', t || '_user_idx', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

create index tasks_due_idx on public.tasks (user_id, due_date);
create index routine_blocks_date_idx on public.routine_blocks (user_id, date);
create index interviews_date_idx on public.interviews (user_id, date);
create index meetings_date_idx on public.meetings (user_id, date);
create index agenda_events_date_idx on public.agenda_events (user_id, date);

-- Integridade entre instituições: a FK de instituição precisa pertencer ao mesmo usuário.
create or replace function public.check_institution_owner() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.institution_id is not null and not exists (
    select 1 from public.institutions i where i.id = new.institution_id and i.user_id = new.user_id) then
    raise exception 'Instituição inválida para este usuário';
  end if;
  return new;
end; $$;

do $$
declare t text;
begin
  foreach t in array array['tasks','routine_blocks','agenda_events','feedbacks','candidates','interviews','trainings',
    'meetings','improvements','objectives','projects']
  loop
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.check_institution_owner()', t || '_inst_owner', t);
  end loop;
end $$;
