-- Testes da migration 0002 (sincronização Notion). Rodar com supabase/tests/run_local.sh.
\set ON_ERROR_STOP 1
reset role;
insert into auth.users values ('33333333-3333-3333-3333-333333333333'), ('44444444-4444-4444-4444-444444444444');

-- 1. external_ref único por usuário (quando preenchido)
set role authenticated;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
insert into tasks (title, external_ref) values ('T1', 'notion:p1');
insert into tasks (title) values ('Sem ref 1'), ('Sem ref 2');            -- vários null: permitido
insert into objectives (title, external_ref) values ('O1', 'notion:o1');
do $$ begin
  begin insert into tasks (title, external_ref) values ('T1 dup', 'notion:p1'); raise exception 'FALHA: external_ref duplicado aceito em tasks';
  exception when unique_violation then null; end;
  begin insert into objectives (title, external_ref) values ('O1 dup', 'notion:o1'); raise exception 'FALHA: external_ref duplicado aceito em objectives';
  exception when unique_violation then null; end;
end $$;
-- tarefa e OKR sem instituição continuam aceitos (itens pessoais do Notion)
do $$ begin
  if (select institution_id from tasks where external_ref = 'notion:p1') is not null then raise exception 'FALHA: institution_id deveria ser null'; end if;
end $$;
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
insert into tasks (title, external_ref) values ('T1 de outro usuário', 'notion:p1');  -- outro usuário: permitido

-- 2. notion_sync_state: RLS e unique por página
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
insert into notion_sync_state (entity, local_id, notion_page_id, synced_hash) values ('tarefas', 'x', 'p1', 'h');
do $$ begin
  begin insert into notion_sync_state (entity, notion_page_id) values ('tarefas', 'p1'); raise exception 'FALHA: estado duplicado para a mesma página';
  exception when unique_violation then null; end;
  begin insert into notion_sync_state (entity, notion_page_id) values ('reunioes', 'p9'); raise exception 'FALHA: entidade inválida aceita';
  exception when check_violation then null; end;
  begin insert into notion_sync_state (entity, notion_page_id, sync_status) values ('tarefas', 'p8', 'qualquer'); raise exception 'FALHA: sync_status inválido aceito';
  exception when check_violation then null; end;
end $$;
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
do $$ begin
  if (select count(*) from notion_sync_state) <> 0 then raise exception 'FALHA: usuário vê estado de sincronização de outro'; end if;
  update notion_sync_state set synced_hash = 'invadido';
  begin insert into notion_sync_state (user_id, entity, notion_page_id) values ('33333333-3333-3333-3333-333333333333', 'tarefas', 'p2');
    raise exception 'FALHA: user_id forjado aceito em notion_sync_state';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin if (select synced_hash from notion_sync_state where notion_page_id = 'p1') <> 'h' then raise exception 'FALHA: outro usuário alterou o estado'; end if; end $$;
set role anon;
do $$ begin perform count(*) from public.notion_sync_state; raise exception 'FALHA: anon acessa notion_sync_state';
exception when insufficient_privilege then null; end $$;

-- 3. review_queue: tipos novos e reentrada
reset role;
set role authenticated;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
insert into review_queue (entity, external_id, kind) values ('krs', 'k1', 'kr_sem_objetivo');
insert into review_queue (entity, external_id, kind) values ('krs', 'k1', 'conflito');   -- mesmo item, outro motivo: permitido
do $$ begin
  begin insert into review_queue (entity, external_id, kind) values ('krs', 'k1', 'kr_sem_objetivo'); raise exception 'FALHA: pendência aberta duplicada aceita';
  exception when unique_violation then null; end;
  begin insert into review_queue (entity, external_id, kind) values ('krs', 'k2', 'inventado'); raise exception 'FALHA: kind inválido aceito';
  exception when check_violation then null; end;
  begin insert into review_queue (entity, external_id) values ('krs', 'k3'); raise exception 'FALHA: review sem kind aceito';
  exception when not_null_violation then null; end;
end $$;
update review_queue set resolved = true, resolution = 'descartado' where external_id = 'k1' and kind = 'kr_sem_objetivo';
insert into review_queue (entity, external_id, kind) values ('krs', 'k1', 'kr_sem_objetivo');   -- depois de resolvido, pode voltar
insert into review_queue (entity, external_id, kind) values ('tarefas', 't9', 'valor_desconhecido');
insert into review_queue (entity, external_id, kind, resolved, resolution) values ('krs', 'k4', 'kr_multiplos_objetivos', true, 'objetivo_escolhido');

-- 4. sync_logs e settings
insert into sync_logs (direction, entity, status, external_id, fields_changed) values ('leitura', 'tarefas', 'sucesso', 'p1', '["status"]');
insert into settings (notion_config) values ('{"person_id": "x"}');
reset role;
select 'NOTION SYNC OK' as resultado;
