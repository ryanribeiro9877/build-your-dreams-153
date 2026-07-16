-- Espelho da migração aplicada via MCP (apply_migration) em prod — NÃO reexecutar.
-- As default privileges do Supabase concedem EXECUTE a `anon` em toda função nova
-- (grant explícito, não removido pelo REVOKE FROM PUBLIC). Espelhar os irmãos
-- (agent_consultar_cliente / list_assignable_users): sem anon.
REVOKE EXECUTE ON FUNCTION public.agent_consultar_usuario(text) FROM anon;
