-- 0008: coluna nova em settings com default vazio e protegida pelo RLS existente
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'settings' and column_name = 'routine_off_dates')
    then raise exception 'FALHA: settings.routine_off_dates não existe'; end if;
  if (select column_default from information_schema.columns where table_schema = 'public' and table_name = 'settings' and column_name = 'routine_off_dates') not like '%{}%'
    then raise exception 'FALHA: routine_off_dates sem default vazio'; end if;
  if not (select relforcerowsecurity from pg_class where oid = 'public.settings'::regclass) then raise exception 'FALHA: settings sem RLS forçado'; end if;
end $$;
select 'ROTINA OFF OK' as resultado;
