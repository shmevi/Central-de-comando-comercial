-- =====================================================================
-- 0008 — Dias em que você apagou TODOS os blocos da rotina de propósito
--
-- Antes, apagar todos os blocos de hoje fazia a tela Hoje gerar a rotina-base de novo ao abrir.
-- Agora o dia fica marcado aqui e não é recriado sozinho (use "Gerar rotina do dia" para voltar).
-- Guarda só datas ('yyyy-mm-dd'); o app mantém no máximo os últimos 60 dias.
--
-- Não destrutiva (nenhum DROP) e idempotente: pode ser reaplicada sem erro e sem perder dados.
-- A tabela settings já tem RLS forçado e as 4 políticas da 0001 — a coluna nova herda tudo.
-- =====================================================================

alter table public.settings add column if not exists routine_off_dates text[] not null default '{}'::text[];
