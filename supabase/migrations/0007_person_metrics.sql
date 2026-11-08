-- =====================================================================
-- 0007 — Feedback em números: lançamentos mensais por pessoa × instituição
--
-- Só os valores DIGITADOS são gravados (leads, matrículas, valor). Conversão (matrículas ÷ leads) e ticket médio
-- (valor ÷ matrículas) são SEMPRE calculados na tela — nunca gravados aqui.
-- Mês sem lançamento = sem linha (nada de zero ou estimativa).
--
-- Também adiciona feedbacks.metrics_snapshot: os números da pessoa "congelados" no momento em que o feedback é
-- salvo. Tem default '{}', então inserts antigos (sem a coluna) continuam funcionando.
--
-- Não destrutiva (nenhum DROP) e idempotente: pode ser reaplicada sem erro e sem perder dados.
-- (Numerada 0007 porque 0003–0006 já existem e estão aplicadas; migrations antigas não são alteradas.)
-- =====================================================================

create table if not exists public.person_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  is_demo boolean not null default false, external_ref text,

  person_id uuid not null references public.people(id) on delete cascade,
  -- restrict: apagar uma instituição com lançamentos é recusado (não some histórico sem querer)
  institution_id uuid not null references public.institutions(id) on delete restrict,
  month date not null constraint person_metrics_month_first_day check (extract(day from month) = 1),
  leads integer not null constraint person_metrics_leads_nonneg check (leads >= 0),
  enrollments integer not null constraint person_metrics_enrollments_nonneg check (enrollments >= 0),
  revenue numeric(12,2) constraint person_metrics_revenue_nonneg check (revenue is null or revenue >= 0),
  notes text not null default '',

  constraint person_metrics_one_per_month unique (user_id, person_id, institution_id, month)
);

alter table public.person_metrics enable row level security;
alter table public.person_metrics force row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'person_metrics' and policyname = 'person_metrics_select_own') then
    create policy person_metrics_select_own on public.person_metrics for select to authenticated using ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'person_metrics' and policyname = 'person_metrics_insert_own') then
    create policy person_metrics_insert_own on public.person_metrics for insert to authenticated with check ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'person_metrics' and policyname = 'person_metrics_update_own') then
    create policy person_metrics_update_own on public.person_metrics for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'person_metrics' and policyname = 'person_metrics_delete_own') then
    create policy person_metrics_delete_own on public.person_metrics for delete to authenticated using ((select auth.uid()) = user_id);
  end if;

  -- updated_at automático e referências do MESMO usuário (funções existentes da 0001, reutilizadas)
  if not exists (select 1 from pg_trigger where tgname = 'person_metrics_updated_at' and tgrelid = 'public.person_metrics'::regclass) then
    create trigger person_metrics_updated_at before update on public.person_metrics
      for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'person_metrics_inst_owner' and tgrelid = 'public.person_metrics'::regclass) then
    create trigger person_metrics_inst_owner before insert or update on public.person_metrics
      for each row execute function public.check_ref_owner('institution_id', 'institutions');
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'person_metrics_person_owner' and tgrelid = 'public.person_metrics'::regclass) then
    create trigger person_metrics_person_owner before insert or update on public.person_metrics
      for each row execute function public.check_ref_owner('person_id', 'people');
  end if;
end $$;

create index if not exists person_metrics_user_idx on public.person_metrics (user_id);
create index if not exists person_metrics_person_month_idx on public.person_metrics (user_id, person_id, month);

revoke all on public.person_metrics from anon;
grant select, insert, update, delete on public.person_metrics to authenticated;

-- Números congelados no feedback (opcional; inserts antigos continuam válidos pelo default)
alter table public.feedbacks add column if not exists metrics_snapshot jsonb not null default '{}'::jsonb;
