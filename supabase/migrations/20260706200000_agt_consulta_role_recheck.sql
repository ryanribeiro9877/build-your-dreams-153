-- ============================================================================
-- AGT-CONSULTA — Guard obrigatório: agent_consultar_cliente re-checa o papel
-- ----------------------------------------------------------------------------
-- agent_consultar_cliente é SECURITY DEFINER (bypassa RLS) e decifra o CPF.
-- Ao habilitar o agente a consultar cliente, ela PRECISA re-checar o papel do
-- usuário da sessão — senão qualquer autenticado leria o CPF decifrado de
-- qualquer cliente via o agente (furo novo criado pela correção).
--
-- O edge passa a executar a tool de leitura com a IDENTIDADE do usuário (JWT),
-- então auth.uid() está disponível dentro da função mesmo sendo SECURITY DEFINER
-- (o JWT do PostgREST define auth.uid() independente do owner de execução).
-- is_recepcao_or_socio() usa auth.uid(); logo:
--   * chamada por usuário recepção/sócio  -> retorna os dados;
--   * chamada por autenticado sem o papel  -> retorna VAZIO;
--   * chamada por service_role (sem JWT)   -> auth.uid() nulo -> VAZIO (fail-closed).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.agent_consultar_cliente(p_busca text)
RETURNS TABLE (id uuid, full_name text, cpf text, status text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_raw   text := coalesce(p_busca, '');
  v_clean text;
BEGIN
  -- Guard de papel (re-checa a identidade da sessão; fail-closed sem papel/JWT).
  IF NOT public.is_recepcao_or_socio() THEN
    RETURN;
  END IF;

  -- Remove máscara comum de CPF (pontos, hífen, barra, espaços).
  v_clean := regexp_replace(v_raw, '[.\-/ ]', '', 'g');

  IF v_clean <> '' AND v_clean ~ '^[0-9]+$' THEN
    -- Documento numérico -> busca EXATA por índice cego de CPF.
    RETURN QUERY
      SELECT c.id, c.full_name, public.pii_decrypt(c.cpf_enc), c.status
        FROM public.clients c
       WHERE c.cpf_bidx = public.pii_bidx(v_raw)
       LIMIT 10;
  ELSE
    -- Texto -> busca por nome (como antes).
    RETURN QUERY
      SELECT c.id, c.full_name, public.pii_decrypt(c.cpf_enc), c.status
        FROM public.clients c
       WHERE c.full_name ILIKE '%' || v_raw || '%'
       LIMIT 10;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.agent_consultar_cliente(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_consultar_cliente(text) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Novo caminho de intenção CONSULTA / route_path 'consulta': liberar nos CHECKs
-- de orchestration_runs (senão o run de consulta viola a constraint no insert).
-- ----------------------------------------------------------------------------
ALTER TABLE public.orchestration_runs DROP CONSTRAINT IF EXISTS orchestration_runs_intent_category_chk;
ALTER TABLE public.orchestration_runs ADD CONSTRAINT orchestration_runs_intent_category_chk
  CHECK (intent_category IS NULL OR intent_category = ANY (ARRAY[
    'TRIVIAL','CONSULTA','NEGOCIO_SEM_INSUMO','NEGOCIO_COM_INSUMO','NEGOCIO','INCERTO'
  ]::text[]));

ALTER TABLE public.orchestration_runs DROP CONSTRAINT IF EXISTS orchestration_runs_route_path_chk;
ALTER TABLE public.orchestration_runs ADD CONSTRAINT orchestration_runs_route_path_chk
  CHECK (route_path IS NULL OR route_path = ANY (ARRAY[
    'fast','consulta','need_info','full'
  ]::text[]));

-- ============================================================================
-- Fim AGT-CONSULTA (DB). O caminho de consulta do agente re-checa o papel; o
-- gate de ESCRITA (CHAT_TOOLS_ENABLED) segue OFF — nada de escrita foi habilitado.
-- ============================================================================
