-- =====================================================================
-- 0006 — ATRIBUIÇÃO das tarefas (70% / 20% / 10% / OFF WORK), como no Notion
--
-- Usada no Kanban de Tarefas agrupado por atribuição e sincronizada com a propriedade ATRIBUIÇÃO do Notion.
-- Não destrutiva: só adiciona a coluna (lista vazia para as tarefas existentes); pode ser reaplicada.
-- =====================================================================
alter table public.tasks add column if not exists attribution jsonb not null default '[]'::jsonb;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'tasks_attribution_is_array' and conrelid = 'public.tasks'::regclass) then
    alter table public.tasks add constraint tasks_attribution_is_array check (jsonb_typeof(attribution) = 'array');
  end if;
end $$;
