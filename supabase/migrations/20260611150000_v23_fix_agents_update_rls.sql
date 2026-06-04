-- ============================================================================
-- V23 — Corrige RLS de UPDATE/DELETE em agents
-- ============================================================================
-- A policy antiga (tech_update_agents) so permitia role 'tech'. Mas a tela de
-- edicao (/admin/agentes/:id) e acessivel por admin (socio) tambem. Resultado:
-- admin clicava "Salvar", a RLS bloqueava o UPDATE silenciosamente (0 linhas,
-- sem erro) e o app mostrava "salvo" sem nada mudar.
-- Agora: tech, admin OU o dono do agente (owner_user_id) podem editar/excluir.
-- Idempotente.
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS tech_update_agents ON public.agents;
CREATE POLICY agents_update ON public.agents
FOR UPDATE
USING (
  has_role(auth.uid(), 'tech'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR owner_user_id = auth.uid()
)
WITH CHECK (
  has_role(auth.uid(), 'tech'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR owner_user_id = auth.uid()
);

DROP POLICY IF EXISTS tech_delete_agents ON public.agents;
CREATE POLICY agents_delete ON public.agents
FOR DELETE
USING (
  has_role(auth.uid(), 'tech'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR owner_user_id = auth.uid()
);

COMMIT;
