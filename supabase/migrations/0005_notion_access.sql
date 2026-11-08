-- =====================================================================
-- 0005 — Quem pode ler o Notion pela Central (vínculo conta ↔ pessoa no Notion)
--
-- O token do Notion (Edge Secret NOTION_TOKEN) é UM só, do workspace. Sem este vínculo, qualquer conta
-- poderia digitar o ID de outra pessoa nas Configurações e ler as tarefas dela. Por isso o servidor
-- (Edge Function notion-sync) só lê o Notion para quem tem uma linha aqui, e SEMPRE usa o person_id
-- desta tabela, nunca o digitado na tela.
--
-- Quem cria a linha é o administrador, pelo SQL Editor do Supabase:
--   insert into public.notion_access (user_id, person_id)
--   select id, '<id-da-pessoa-no-notion-32-hex>' from auth.users where email = '<e-mail>';
--
-- O próprio usuário só consegue LER a sua linha. Não pode criar, trocar nem apagar.
-- Não destrutiva: não apaga nada; pode ser reaplicada.
-- =====================================================================

create table if not exists public.notion_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  person_id text not null check (person_id ~ '^[0-9a-f]{32}$'),
  created_at timestamptz not null default now()
);

alter table public.notion_access enable row level security;
alter table public.notion_access force row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'notion_access' and policyname = 'notion_access_select_own') then
    create policy notion_access_select_own on public.notion_access for select to authenticated using ((select auth.uid()) = user_id);
  end if;
end $$;

-- Somente leitura para o app; sem acesso anônimo. Inserir/alterar/apagar: só o administrador (SQL Editor).
revoke all on public.notion_access from anon;
revoke all on public.notion_access from authenticated;
grant select on public.notion_access to authenticated;
