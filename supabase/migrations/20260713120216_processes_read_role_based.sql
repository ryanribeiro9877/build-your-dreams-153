-- 20260713120216_processes_read_role_based.sql
--
-- ESPELHO de reconciliação repo<->banco (NÃO fazer `db push`).
-- Já aplicada em PRODUÇÃO via MCP (apply_migration), registrada em
-- supabase_migrations.schema_migrations como:
--     version = 20260713120216
--     name    = processes_read_role_based
--
-- Leitura de public.processes por papel (ADITIVO): recepção + sócio + advogado.
-- Mantém a policy owner-only "Users can view own processes" — RLS combina com
-- OR, então ninguém perde acesso; a recepção/advogados passam a ver os processos
-- do escritório (não só os que criaram). Escrita (UPDATE/DELETE) segue owner-only.
-- Espelha a convenção de leitura de clients/audiencias.
-- Gate aprovado por Ryan (recepção inclusa).
-- ============================================================================

drop policy if exists "Office staff can view processes" on public.processes;
create policy "Office staff can view processes"
  on public.processes
  for select
  to authenticated
  using ( public.is_recepcao_or_socio() or public.is_socio_or_advogado() );
