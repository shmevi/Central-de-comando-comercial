-- Testes da migration 0003 (entradas de relatório + logo no Storage). Rodar com supabase/tests/run_local.sh.
\set ON_ERROR_STOP 1
reset role;
insert into auth.users values ('55555555-5555-5555-5555-555555555555'), ('66666666-6666-6666-6666-666666666666');

-- 1. report_entries: dono grava e lê; outro usuário não vê nem altera
set role authenticated;
set request.jwt.claim.sub = '55555555-5555-5555-5555-555555555555';
insert into report_entries (date, kind, text) values ('2026-11-06', 'conquista', 'Fechei 3 matrículas'), ('2026-11-06', 'anotacao', 'Dia produtivo');
do $$ begin
  begin insert into report_entries (date, kind, text) values ('2026-11-06', 'outro', 'x'); raise exception 'FALHA: kind inválido aceito';
  exception when check_violation then null; end;
  begin insert into report_entries (date, kind, text) values ('2026-11-06', 'conquista', '   '); raise exception 'FALHA: texto vazio aceito';
  exception when check_violation then null; end;
  begin insert into report_entries (date, kind, text, user_id) values ('2026-11-06', 'conquista', 'forjada', '66666666-6666-6666-6666-666666666666'); raise exception 'FALHA: user_id forjado aceito';
  exception when insufficient_privilege then null; end;
end $$;
set request.jwt.claim.sub = '66666666-6666-6666-6666-666666666666';
do $$ begin
  if (select count(*) from report_entries) <> 0 then raise exception 'FALHA: usuário B vê entradas de A'; end if;
  update report_entries set text = 'invadido';
end $$;
reset role;
do $$ begin
  if exists (select 1 from report_entries where text = 'invadido') then raise exception 'FALHA: B alterou entrada de A'; end if;
  if (select count(*) from report_entries where user_id = '55555555-5555-5555-5555-555555555555') <> 2 then raise exception 'FALHA: entradas de A sumiram'; end if;
end $$;

-- 2. settings.logo_path: aceita caminho do Storage, recusa URL/data URL
insert into settings (user_id) values ('55555555-5555-5555-5555-555555555555');
update settings set logo_path = '55555555-5555-5555-5555-555555555555/logo-1.png' where user_id = '55555555-5555-5555-5555-555555555555';
do $$ begin
  begin update settings set logo_path = 'javascript:alert(1)' where user_id = '55555555-5555-5555-5555-555555555555'; raise exception 'FALHA: logo_path javascript: aceito';
  exception when check_violation then null; end;
  begin update settings set logo_path = 'https://exemplo.com/x.png' where user_id = '55555555-5555-5555-5555-555555555555'; raise exception 'FALHA: logo_path URL externa aceita';
  exception when check_violation then null; end;
end $$;

-- 3. Storage: bucket privado com limite (5 MB após a 0004) e tipos; cada usuário só na própria pasta
do $$ begin
  if not exists (select 1 from storage.buckets where id = 'branding' and public = false and file_size_limit = 5242880
                 and allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']) then
    raise exception 'FALHA: bucket branding ausente ou mal configurado';
  end if;
end $$;
set role authenticated;
set request.jwt.claim.sub = '55555555-5555-5555-5555-555555555555';
insert into storage.objects (bucket_id, name) values ('branding', '55555555-5555-5555-5555-555555555555/logo-1.png');
do $$ begin
  begin insert into storage.objects (bucket_id, name) values ('branding', '66666666-6666-6666-6666-666666666666/logo.png'); raise exception 'FALHA: gravou na pasta de outro usuário';
  exception when insufficient_privilege then null; end;
  begin insert into storage.objects (bucket_id, name) values ('branding', 'logo-sem-pasta.png'); raise exception 'FALHA: gravou fora de uma pasta de usuário';
  exception when insufficient_privilege then null; end;
end $$;
set request.jwt.claim.sub = '66666666-6666-6666-6666-666666666666';
do $$ begin
  if (select count(*) from storage.objects where bucket_id = 'branding') <> 0 then raise exception 'FALHA: B vê a logo de A'; end if;
  delete from storage.objects where bucket_id = 'branding';
end $$;
reset role;
do $$ begin
  if (select count(*) from storage.objects where bucket_id = 'branding') <> 1 then raise exception 'FALHA: B apagou a logo de A'; end if;
end $$;
select 'RELATORIOS E LOGO OK' as resultado;
