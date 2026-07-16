-- Higiene do advisor (linter 0028/0029) — espelho, versão 20260716233259.
--
-- A função de trigger trg_notify_task_assignment() é SECURITY DEFINER e, por
-- ALTER DEFAULT PRIVILEGES do projeto, ficou executável por anon/authenticated
-- via /rest/v1/rpc. É inofensiva (o Postgres recusa invocar função de trigger
-- diretamente — "trigger functions can only be called as triggers"), mas
-- revogamos para limpar o advisor, no mesmo padrão das migrações
-- revoke_anon_trg_* / data_conformity_revoke_trigger_fns_from_anon do projeto.
-- Não afeta o disparo do trigger (roda como owner na máquina de triggers).
REVOKE ALL ON FUNCTION public.trg_notify_task_assignment() FROM PUBLIC, anon, authenticated;
