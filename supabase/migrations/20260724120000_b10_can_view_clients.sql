-- ============================================================================
-- B10 (E2E 24/07) — admin/grant enxergam a FICHA do cliente, não só a lista
-- ============================================================================
-- Sintoma: o admin via o menu e a LISTA de clientes, mas ao abrir /clientes/:id
-- recebia "Acesso restrito — A gestão de clientes é exclusiva da Recepção".
--
-- O gate de FRONT foi corrigido em ClientDetails/ClientEdit/ClientNew (passaram a
-- usar canSeeMenu('clientes'), como a lista). Aqui fechamos a INCONSISTÊNCIA de
-- dados: `search_clients` (lista) JÁ honrava has_menu_grant, mas a RLS da ficha e
-- o client_timeline exigiam is_recepcao_or_socio() — então um usuário com grant
-- via a lista e batia em vazio/"negado" na ficha.
--
-- ESCOPO MÍNIMO E DELIBERADO: só a LEITURA da ficha, dos documentos e dos eventos.
-- NÃO alteramos:
--   · client_gov_credentials nem save/reveal_gov_credential (cofre GOV.BR segue
--     restrito a is_recepcao_or_socio — grant de menu NÃO abre o cofre);
--   · as políticas de INSERT/UPDATE de clients (escrita continua da recepção);
--   · is_recepcao_or_socio() em si, usada por 12 políticas e 16 funções.
--
-- Dry-run (BEGIN/ROLLBACK, impersonação): admin lê a ficha; recepção não regride;
-- advogada SEM grant → 0 linhas / 42501 no histórico; advogada COM grant → ficha e
-- histórico OK e cofre GOV.BR = 0 linhas.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.can_view_clients()
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select public.is_recepcao_or_socio()
      or public.has_role(auth.uid(), 'admin'::public.app_role)
      or public.has_menu_grant(auth.uid(), 'clientes');
$function$;

REVOKE EXECUTE ON FUNCTION public.can_view_clients() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.can_view_clients() TO authenticated, service_role;

DROP POLICY "Recepcao can view clients" ON public.clients;
CREATE POLICY "Recepcao can view clients" ON public.clients FOR SELECT USING (public.can_view_clients());

DROP POLICY "View documents office staff" ON public.client_documents;
CREATE POLICY "View documents office staff" ON public.client_documents FOR SELECT
  USING (public.can_view_clients() OR public.is_socio_or_advogado());

DROP POLICY "Recepcao/socio can view doc events" ON public.client_document_events;
CREATE POLICY "Recepcao/socio can view doc events" ON public.client_document_events FOR SELECT
  USING (public.can_view_clients());

-- Aba Histórico: troca cirúrgica do gate interno, preservando o corpo em produção.
DO $$
DECLARE v_def text; v_new text;
BEGIN
  v_def := pg_get_functiondef('public.client_timeline(uuid)'::regprocedure);
  v_new := replace(v_def,
    'if not public.is_recepcao_or_socio() then',
    'if not public.can_view_clients() then');
  IF v_new = v_def THEN RAISE EXCEPTION 'client_timeline: gate não encontrado — nada aplicado'; END IF;
  EXECUTE v_new;
END $$;
