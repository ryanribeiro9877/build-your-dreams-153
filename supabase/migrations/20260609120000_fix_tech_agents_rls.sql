-- Fix: permitir que role tech veja TODOS os agentes pessoais,
-- incluindo assistant_root (antes era excluido).
-- Motivo: tech precisa administrar todos os agentes do sistema.

DROP POLICY IF EXISTS agents_select_isolated ON public.agents;

CREATE POLICY agents_select_isolated ON public.agents
FOR SELECT USING (
  (is_personal = false)
  OR (owner_user_id = auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role)
  OR (is_personal = true AND has_role(auth.uid(), 'tech'::app_role))
);
