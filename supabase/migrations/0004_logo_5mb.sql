-- =====================================================================
-- 0004 — Aumenta o limite da logo personalizada para 5 MB
-- Só atualiza o limite do bucket "branding" (criado na 0003). Nada é apagado. Reaplicável.
-- =====================================================================
do $$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    raise notice 'Schema storage ausente: nada a fazer (esperado fora do Supabase).';
    return;
  end if;
  update storage.buckets set file_size_limit = 5242880 where id = 'branding';
end $$;
