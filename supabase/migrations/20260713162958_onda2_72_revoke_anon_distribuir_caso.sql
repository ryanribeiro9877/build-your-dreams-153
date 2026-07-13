-- 20260713162958_onda2_72_revoke_anon_distribuir_caso.sql
--
-- ESPELHO de reconciliação repo<->banco (NÃO fazer `db push`).
-- Já aplicada em PRODUÇÃO via MCP (apply_migration):
--     version = 20260713162958
--     name    = onda2_72_revoke_anon_distribuir_caso
--
-- ONDA 2 · Card 7.2 — hardening: trava distribuir_caso a usuários autenticados.
-- Postgres concede EXECUTE a PUBLIC por padrão (advisor 0028_anon_security_definer_
-- function_executable); removemos de PUBLIC/anon e mantemos só authenticated.
-- ============================================================================

revoke execute on function public.distribuir_caso(uuid, uuid, uuid, text) from public;
revoke execute on function public.distribuir_caso(uuid, uuid, uuid, text) from anon;
grant  execute on function public.distribuir_caso(uuid, uuid, uuid, text) to authenticated;
