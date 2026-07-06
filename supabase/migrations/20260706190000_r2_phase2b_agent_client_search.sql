-- ============================================================================
-- R-2 (Fase 2B) — RPC de busca de cliente para a tool do agente (caminho cifrado)
-- ----------------------------------------------------------------------------
-- A tool `consultar_cliente` (chat-orchestrator/tools/handlers.ts) roda com o
-- client `admin` (service_role) num worker de orquestração — ali NÃO há o JWT
-- do usuário, então não dá para usar a view clients_decrypted / a RPC
-- search_clients_by_cpf (concedidas só a `authenticated` na 2A).
--
-- Em vez de reexpor a view e as funções pii_* ao service_role (reabrindo a
-- superfície que a 2A fechou), criamos UMA função SECURITY DEFINER dedicada,
-- concedida a service_role (+ authenticated), que encapsula a busca:
--   * entrada numérica (CPF, com ou sem máscara) -> índice cego (igualdade exata);
--   * entrada de texto -> full_name (ilike), como antes.
-- Retorna o CPF já decifrado, em paridade com o comportamento anterior da tool
-- (que lia a coluna de texto). Não altera quem acessa (fora de escopo do R-2):
-- mantém a paridade do tool antigo, que rodava com service_role.
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
  -- Remove máscara comum de CPF (pontos, hífen, barra, espaços).
  v_clean := regexp_replace(v_raw, '[.\-/ ]', '', 'g');

  IF v_clean <> '' AND v_clean ~ '^[0-9]+$' THEN
    -- Parece um documento numérico -> busca EXATA por índice cego de CPF.
    -- (fragmento de CPF deixou de existir — esperado, dado protegido.)
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
-- Hardening do trigger da 2A: clients_pii_sync() é SECURITY DEFINER e, por
-- DEFAULT PRIVILEGES do Supabase, ficou executável por anon/authenticated via
-- /rest/v1/rpc (o advisor sinaliza). Uma função de trigger NÃO precisa de
-- EXECUTE do papel que dispara o INSERT/UPDATE — o Postgres a executa pelo
-- mecanismo de trigger — então revogar de todos (deixando só o owner) é seguro
-- e fecha o aviso. Chamá-la direto via RPC apenas erraria de qualquer forma.
REVOKE ALL ON FUNCTION public.clients_pii_sync() FROM PUBLIC, anon, authenticated, service_role;

-- ============================================================================
-- Fim R-2 Fase 2B (DB). O front consome a view/RPC da 2A (authenticated); a
-- edge consome esta RPC (service_role). Texto puro segue intacto até a 2C.
-- ============================================================================
