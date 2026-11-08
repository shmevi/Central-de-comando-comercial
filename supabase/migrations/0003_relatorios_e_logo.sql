-- =====================================================================
-- 0003 — Entradas manuais dos relatórios + logo personalizada (Storage)
--
-- NÃO destrutiva: só cria (if not exists) e adiciona. Nenhum DROP de tabela/coluna/dado.
-- Reaplicável sem erro. Aplicar depois da 0001 e da 0002.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Entradas manuais dos relatórios (conquistas, destaques, pendências, anotação final, prioridades)
-- ---------------------------------------------------------------------
create table if not exists public.report_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  is_demo boolean not null default false, external_ref text,
  -- Dia a que a entrada se refere. Prioridades da próxima semana usam a segunda-feira daquela semana.
  date date not null,
  kind text not null check (kind in ('conquista', 'destaque', 'pendencia', 'anotacao', 'prioridade')),
  text text not null check (length(trim(text)) > 0 and length(text) <= 4000),
  institution_id uuid references public.institutions(id) on delete set null
);

alter table public.report_entries enable row level security;
alter table public.report_entries force row level security;
drop policy if exists report_entries_select_own on public.report_entries;
drop policy if exists report_entries_insert_own on public.report_entries;
drop policy if exists report_entries_update_own on public.report_entries;
drop policy if exists report_entries_delete_own on public.report_entries;
create policy report_entries_select_own on public.report_entries for select to authenticated using ((select auth.uid()) = user_id);
create policy report_entries_insert_own on public.report_entries for insert to authenticated with check ((select auth.uid()) = user_id);
create policy report_entries_update_own on public.report_entries for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy report_entries_delete_own on public.report_entries for delete to authenticated using ((select auth.uid()) = user_id);
drop trigger if exists report_entries_updated_at on public.report_entries;
create trigger report_entries_updated_at before update on public.report_entries
  for each row execute function public.set_updated_at();
drop trigger if exists report_entries_inst_owner on public.report_entries;
create trigger report_entries_inst_owner before insert or update on public.report_entries
  for each row execute function public.check_ref_owner('institution_id', 'institutions');
create index if not exists report_entries_user_date_idx on public.report_entries (user_id, date);
revoke all on public.report_entries from anon;
grant select, insert, update, delete on public.report_entries to authenticated;

-- ---------------------------------------------------------------------
-- 2. Logo personalizada: caminho do arquivo no Storage (null = monograma padrão)
-- ---------------------------------------------------------------------
alter table public.settings add column if not exists logo_path text;
alter table public.settings drop constraint if exists settings_logo_path_check;
alter table public.settings add constraint settings_logo_path_check
  check (logo_path is null or (length(logo_path) <= 300 and logo_path !~ '^(data|https?|javascript):'));

-- ---------------------------------------------------------------------
-- 3. Bucket privado "branding" + regras: cada usuário só mexe na própria pasta (<user_id>/...)
--    Só roda onde existe o schema storage (Supabase). Em PostgreSQL puro de teste, é pulado.
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    raise notice 'Schema storage ausente: bucket da logo não criado (esperado fora do Supabase).';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('branding', 'branding', false, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
  on conflict (id) do nothing;

  drop policy if exists branding_select_own on storage.objects;
  drop policy if exists branding_insert_own on storage.objects;
  drop policy if exists branding_update_own on storage.objects;
  drop policy if exists branding_delete_own on storage.objects;
  create policy branding_select_own on storage.objects for select to authenticated
    using (bucket_id = 'branding' and (storage.foldername(name))[1] = (select auth.uid())::text);
  create policy branding_insert_own on storage.objects for insert to authenticated
    with check (bucket_id = 'branding' and (storage.foldername(name))[1] = (select auth.uid())::text);
  create policy branding_update_own on storage.objects for update to authenticated
    using (bucket_id = 'branding' and (storage.foldername(name))[1] = (select auth.uid())::text)
    with check (bucket_id = 'branding' and (storage.foldername(name))[1] = (select auth.uid())::text);
  create policy branding_delete_own on storage.objects for delete to authenticated
    using (bucket_id = 'branding' and (storage.foldername(name))[1] = (select auth.uid())::text);
end $$;
