-- Testes da migration 0007 (feedback em números). Rodar com supabase/tests/run_local.sh.
\set ON_ERROR_STOP 1
reset role;
insert into auth.users values ('aaaaaaaa-0000-0000-0000-00000000000a'), ('bbbbbbbb-0000-0000-0000-00000000000b');

set role authenticated;
-- Usuário A: instituição, pessoa e um lançamento válido (valor opcional)
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-00000000000a';
insert into institutions (id, code, name) values ('a1a1a1a1-0000-0000-0000-000000000001', 'CPPEM', 'CPPEM');
insert into people (id, name) values ('a2a2a2a2-0000-0000-0000-000000000001', 'Pessoa A');
insert into person_metrics (person_id, institution_id, month, leads, enrollments, revenue)
  values ('a2a2a2a2-0000-0000-0000-000000000001', 'a1a1a1a1-0000-0000-0000-000000000001', '2026-10-01', 40, 10, 12000.50);
insert into person_metrics (person_id, institution_id, month, leads, enrollments)
  values ('a2a2a2a2-0000-0000-0000-000000000001', 'a1a1a1a1-0000-0000-0000-000000000001', '2026-09-01', 0, 0);   -- valor vazio: aceito
-- matrículas > leads: o banco aceita (a tela só sinaliza)
insert into person_metrics (person_id, institution_id, month, leads, enrollments)
  values ('a2a2a2a2-0000-0000-0000-000000000001', 'a1a1a1a1-0000-0000-0000-000000000001', '2026-08-01', 3, 5);
do $$ begin
  if (select user_id from person_metrics where month = '2026-10-01') <> 'aaaaaaaa-0000-0000-0000-00000000000a' then raise exception 'FALHA: user_id não veio do auth.uid()'; end if;
  if (select revenue from person_metrics where month = '2026-09-01') is not null then raise exception 'FALHA: valor vazio deveria ficar null (sem zero inventado)'; end if;
  -- duplicata (mesma pessoa × instituição × mês)
  begin insert into person_metrics (person_id, institution_id, month, leads, enrollments) values ('a2a2a2a2-0000-0000-0000-000000000001', 'a1a1a1a1-0000-0000-0000-000000000001', '2026-10-01', 1, 1);
    raise exception 'FALHA: lançamento duplicado aceito'; exception when unique_violation then null; end;
  -- negativos
  begin insert into person_metrics (person_id, institution_id, month, leads, enrollments) values ('a2a2a2a2-0000-0000-0000-000000000001', 'a1a1a1a1-0000-0000-0000-000000000001', '2026-07-01', -1, 0);
    raise exception 'FALHA: leads negativo aceito'; exception when check_violation then null; end;
  begin insert into person_metrics (person_id, institution_id, month, leads, enrollments) values ('a2a2a2a2-0000-0000-0000-000000000001', 'a1a1a1a1-0000-0000-0000-000000000001', '2026-07-01', 1, -1);
    raise exception 'FALHA: matrículas negativas aceitas'; exception when check_violation then null; end;
  begin insert into person_metrics (person_id, institution_id, month, leads, enrollments, revenue) values ('a2a2a2a2-0000-0000-0000-000000000001', 'a1a1a1a1-0000-0000-0000-000000000001', '2026-07-01', 1, 1, -0.01);
    raise exception 'FALHA: valor negativo aceito'; exception when check_violation then null; end;
  -- mês fora do dia 1
  begin insert into person_metrics (person_id, institution_id, month, leads, enrollments) values ('a2a2a2a2-0000-0000-0000-000000000001', 'a1a1a1a1-0000-0000-0000-000000000001', '2026-07-15', 1, 1);
    raise exception 'FALHA: mês fora do dia 1 aceito'; exception when check_violation then null; end;
  -- instituição obrigatória
  begin insert into person_metrics (person_id, month, leads, enrollments) values ('a2a2a2a2-0000-0000-0000-000000000001', '2026-07-01', 1, 1);
    raise exception 'FALHA: lançamento sem instituição aceito'; exception when not_null_violation then null; end;
  -- user_id de outra pessoa
  begin insert into person_metrics (user_id, person_id, institution_id, month, leads, enrollments) values ('bbbbbbbb-0000-0000-0000-00000000000b', 'a2a2a2a2-0000-0000-0000-000000000001', 'a1a1a1a1-0000-0000-0000-000000000001', '2026-07-01', 1, 1);
    raise exception 'FALHA: gravou com user_id alheio'; exception when insufficient_privilege then null; end;
end $$;

-- Usuário B: não vê, não altera e não apaga os lançamentos de A; não usa pessoa nem instituição de A
set request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-00000000000b';
insert into institutions (id, code, name) values ('b1b1b1b1-0000-0000-0000-000000000001', 'CPPEM', 'CPPEM');
insert into people (id, name) values ('b2b2b2b2-0000-0000-0000-000000000001', 'Pessoa B');
do $$ begin
  if (select count(*) from person_metrics) <> 0 then raise exception 'FALHA: B vê lançamentos de A'; end if;
  update person_metrics set leads = 999;
  delete from person_metrics;
  begin insert into person_metrics (person_id, institution_id, month, leads, enrollments) values ('a2a2a2a2-0000-0000-0000-000000000001', 'b1b1b1b1-0000-0000-0000-000000000001', '2026-10-01', 1, 1);
    raise exception 'FALHA: B usou a pessoa de A'; exception when insufficient_privilege then null; end;
  begin insert into person_metrics (person_id, institution_id, month, leads, enrollments) values ('b2b2b2b2-0000-0000-0000-000000000001', 'a1a1a1a1-0000-0000-0000-000000000001', '2026-10-01', 1, 1);
    raise exception 'FALHA: B usou a instituição de A'; exception when insufficient_privilege then null; end;
end $$;
-- B pode ter o próprio lançamento no mesmo mês (unique é por usuário)
insert into person_metrics (person_id, institution_id, month, leads, enrollments) values ('b2b2b2b2-0000-0000-0000-000000000001', 'b1b1b1b1-0000-0000-0000-000000000001', '2026-10-01', 7, 2);

-- Anônimo: nada
set role anon;
do $$ begin
  begin perform 1 from person_metrics; raise exception 'FALHA: anônimo leu person_metrics'; exception when insufficient_privilege then null; end;
end $$;

-- feedbacks: insert legado (sem metrics_snapshot) continua funcionando; snapshot novo é gravado
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-00000000000a';
insert into feedbacks (person_id, institution_id, date) values ('a2a2a2a2-0000-0000-0000-000000000001', 'a1a1a1a1-0000-0000-0000-000000000001', '2026-11-08');
insert into feedbacks (person_id, institution_id, date, metrics_snapshot) values ('a2a2a2a2-0000-0000-0000-000000000001', 'a1a1a1a1-0000-0000-0000-000000000001', '2026-11-08', '{"months":[{"month":"2026-10-01","leads":40}]}');
do $$ begin
  if (select count(*) from feedbacks where metrics_snapshot = '{}'::jsonb) <> 1 then raise exception 'FALHA: insert legado deveria receber snapshot vazio'; end if;
  if (select count(*) from feedbacks where metrics_snapshot ? 'months') <> 1 then raise exception 'FALHA: snapshot não gravado'; end if;
end $$;

reset role;
do $$ begin
  if (select count(*) from person_metrics where user_id = 'aaaaaaaa-0000-0000-0000-00000000000a') <> 3 then raise exception 'FALHA: B alterou/apagou lançamentos de A'; end if;
  if (select leads from person_metrics where month = '2026-10-01' and user_id = 'aaaaaaaa-0000-0000-0000-00000000000a') <> 40 then raise exception 'FALHA: B alterou leads de A'; end if;
  -- excluir a pessoa apaga os lançamentos dela (cascade); excluir instituição com lançamentos é recusado
  begin delete from institutions where id = 'a1a1a1a1-0000-0000-0000-000000000001'; raise exception 'FALHA: instituição com lançamentos foi apagada';
  exception when foreign_key_violation then null; end;
end $$;
delete from people where id = 'b2b2b2b2-0000-0000-0000-000000000001';
do $$ begin
  if exists (select 1 from person_metrics where person_id = 'b2b2b2b2-0000-0000-0000-000000000001') then raise exception 'FALHA: lançamentos da pessoa excluída ficaram órfãos'; end if;
end $$;
select 'PERSON METRICS OK' as resultado;
