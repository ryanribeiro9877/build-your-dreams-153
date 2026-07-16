-- Higiene: trigger functions nao precisam de EXECUTE por ninguem (rodam no contexto
-- do trigger, nao via RPC). Fecha os avisos anon_security_definer_function_executable
-- do advisor introduzidos pelas trigger functions de is_test (Pacote A).
-- Aplicada em producao via MCP em 2026-07-16; versionada aqui p/ repo<->banco.
revoke all on function public.trg_mark_is_test_clients()          from public, anon;
revoke all on function public.trg_mark_is_test_processes()        from public, anon;
revoke all on function public.trg_mark_is_test_user_tasks()       from public, anon;
revoke all on function public.trg_mark_is_test_audiencias()       from public, anon;
revoke all on function public.trg_mark_is_test_client_documents() from public, anon;
revoke all on function public.kanban_audit_user_task_insert()     from public, anon;
