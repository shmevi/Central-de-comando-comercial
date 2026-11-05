-- Testes de RLS/integridade. Rodar com supabase/tests/run_local.sh (Postgres local, schema auth simulado).
\set ON_ERROR_STOP 1
insert into auth.users values ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222');
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into institutions (code, name) values ('CPPEM', 'CPPEM');
insert into tasks (title, institution_id) select 'Tarefa A', id from institutions;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$ begin
  if (select count(*) from tasks) <> 0 then raise exception 'FALHA: B vê tarefas de A'; end if;
  update tasks set title = 'x';
  begin insert into tasks (title, user_id) values ('Forjada', '11111111-1111-1111-1111-111111111111'); raise exception 'FALHA: user_id forjado aceito';
  exception when insufficient_privilege then null; end;
  begin insert into projects (name, status) values ('P', 'em_andamento'); raise exception 'FALHA: projeto em andamento sem confirmação';
  exception when check_violation then null; end;
  begin insert into routine_blocks (date, start, "end", title) values ('2026-11-05', '15:00', '14:00', 'X'); raise exception 'FALHA: bloco com fim antes do início';
  exception when check_violation then null; end;
end $$;
reset role;
do $$ declare iid uuid; begin
  select id into iid from institutions where code = 'CPPEM';
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  set local role authenticated;
  begin insert into tasks (title, institution_id) values ('Invasão', iid); raise exception 'FALHA: instituição de outro usuário aceita';
  exception when raise_exception then if sqlerrm like 'FALHA%' then raise; end if; end;
end $$;
reset role;
do $$ begin if (select title from tasks where user_id = '11111111-1111-1111-1111-111111111111') <> 'Tarefa A' then raise exception 'FALHA: B alterou tarefa de A'; end if; end $$;
set role anon;
do $$ begin perform count(*) from public.tasks; raise exception 'FALHA: anon acessa tasks';
exception when insufficient_privilege then null; end $$;
reset role;
select 'RLS OK' as resultado;
