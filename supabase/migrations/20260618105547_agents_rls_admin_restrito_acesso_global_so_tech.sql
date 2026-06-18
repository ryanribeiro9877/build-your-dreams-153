-- Objetivo: acesso global aos agentes pessoais passa a ser EXCLUSIVO do role 'tech'.
-- O role 'admin' deixa de ter acesso amplo e passa a ser tratado como usuario comum:
-- so enxerga/edita/exclui os proprios agentes (owner_user_id = auth.uid()) + compartilhados.
-- Idempotente (DROP IF EXISTS + CREATE). Nao-destrutivo (apenas policies).

-- SELECT: visibilidade
DROP POLICY IF EXISTS agents_select_isolated ON public.agents;
CREATE POLICY agents_select_isolated ON public.agents
  FOR SELECT
  USING (
    (is_personal = false)
    OR (owner_user_id = auth.uid())
    OR ((is_personal = true) AND has_role(auth.uid(), 'tech'::app_role))
  );

-- UPDATE: edicao
DROP POLICY IF EXISTS agents_update ON public.agents;
CREATE POLICY agents_update ON public.agents
  FOR UPDATE
  USING (
    has_role(auth.uid(), 'tech'::app_role)
    OR (owner_user_id = auth.uid())
  )
  WITH CHECK (
    has_role(auth.uid(), 'tech'::app_role)
    OR (owner_user_id = auth.uid())
  );

-- DELETE: exclusao
DROP POLICY IF EXISTS agents_delete ON public.agents;
CREATE POLICY agents_delete ON public.agents
  FOR DELETE
  USING (
    has_role(auth.uid(), 'tech'::app_role)
    OR (owner_user_id = auth.uid())
  );

-- INSERT permanece inalterado (ja era exclusivo do tech via 'tech_insert_agents').
