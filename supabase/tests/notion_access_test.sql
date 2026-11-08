-- Testes da migration 0005 (vínculo conta ↔ pessoa no Notion). Rodar com supabase/tests/run_local.sh.
\set ON_ERROR_STOP 1
reset role;
insert into auth.users values ('77777777-7777-7777-7777-777777777777'), ('88888888-8888-8888-8888-888888888888');
-- Só o administrador (fora do app) cria o vínculo
insert into notion_access (user_id, person_id) values ('77777777-7777-7777-7777-777777777777', '2e1d872b594c81d9a9b20002a5e7c1aa');
do $$ begin
  begin insert into notion_access (user_id, person_id) values ('88888888-8888-8888-8888-888888888888', 'nao-e-um-id'); raise exception 'FALHA: person_id inválido aceito';
  exception when check_violation then null; end;
end $$;

set role authenticated;
-- A: vê só a própria linha e não consegue trocá-la
set request.jwt.claim.sub = '77777777-7777-7777-7777-777777777777';
do $$ begin
  if (select count(*) from notion_access) <> 1 then raise exception 'FALHA: A não vê o próprio vínculo'; end if;
  begin update notion_access set person_id = 'ffffffffffffffffffffffffffffffff'; raise exception 'FALHA: A alterou o próprio vínculo';
  exception when insufficient_privilege then null; end;
  begin delete from notion_access; raise exception 'FALHA: A apagou o vínculo';
  exception when insufficient_privilege then null; end;
end $$;
-- B: não vê o de A e não consegue se vincular sozinho
set request.jwt.claim.sub = '88888888-8888-8888-8888-888888888888';
do $$ begin
  if (select count(*) from notion_access) <> 0 then raise exception 'FALHA: B vê o vínculo de A'; end if;
  begin insert into notion_access (user_id, person_id) values ('88888888-8888-8888-8888-888888888888', 'ffffffffffffffffffffffffffffffff'); raise exception 'FALHA: B criou o próprio vínculo';
  exception when insufficient_privilege then null; end;
end $$;
-- Anônimo: nada
set role anon;
do $$ begin
  begin perform 1 from notion_access; raise exception 'FALHA: anônimo leu notion_access';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  if (select person_id from notion_access where user_id = '77777777-7777-7777-7777-777777777777') <> '2e1d872b594c81d9a9b20002a5e7c1aa' then raise exception 'FALHA: vínculo de A mudou'; end if;
end $$;
select 'NOTION ACCESS OK' as resultado;

-- 0006: atribuição das tarefas é uma lista (vazia por padrão)
set role authenticated;
set request.jwt.claim.sub = '77777777-7777-7777-7777-777777777777';
insert into tasks (title) values ('Sem atribuição');
insert into tasks (title, attribution) values ('Com atribuição', '["70%", "10%"]');
do $$ begin
  if (select attribution from tasks where title = 'Sem atribuição') <> '[]'::jsonb then raise exception 'FALHA: atribuição padrão deveria ser []'; end if;
  begin insert into tasks (title, attribution) values ('Inválida', '"70%"'); raise exception 'FALHA: atribuição que não é lista aceita';
  exception when check_violation then null; end;
end $$;
reset role;
select 'ATRIBUICAO OK' as resultado;
