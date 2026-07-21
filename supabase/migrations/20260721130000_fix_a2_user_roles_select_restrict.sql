-- ============================================================================
-- A2 (ALTO) — auditoria 2026-07-21.
-- user_roles era legível por QUALQUER autenticado (policy SELECT USING(true)),
-- vazando os papéis de todos os usuários. Restringe ao próprio usuário ou à
-- gestão (admin / master admin = director ou role_template 'socio').
-- Verificado que não quebra AdminRoute (admin/director/socio) nem MasterRoute
-- (is_master_admin); useAuth lê os próprios papéis (user_id = auth.uid()).
-- Aplicada em prod via MCP em 2026-07-21 (espelho para o repo).
-- ============================================================================
DROP POLICY IF EXISTS "Authenticated users can view roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view own roles or admins can view all" ON public.user_roles;
CREATE POLICY "Users can view own roles or admins can view all"
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (
    user_id = (select auth.uid())
    OR public.has_role((select auth.uid()), 'admin')
    OR public.is_master_admin((select auth.uid()))
  );
