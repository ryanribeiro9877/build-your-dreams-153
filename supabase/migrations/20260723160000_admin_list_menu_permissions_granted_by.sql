-- ============================================================================
-- Admin chave-mestra (front): expor "quem concedeu" na listagem de permissões
-- ============================================================================
-- A tabela user_menu_permissions já grava granted_by; a RPC de listagem não o
-- expunha. A tela "Permissões de menu" precisa mostrar quem concedeu e quando.
-- Muda o shape de retorno (RETURNS TABLE) → exige DROP + CREATE.
-- ============================================================================

DROP FUNCTION IF EXISTS public.admin_list_menu_permissions();

CREATE FUNCTION public.admin_list_menu_permissions()
 RETURNS TABLE(
   user_id uuid, email text, menu_key text, granted boolean, updated_at timestamptz,
   granted_by uuid, granted_by_name text
 )
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin'::public.app_role) THEN
    RAISE EXCEPTION 'apenas admin gerencia permissões de menu' USING errcode='42501';
  END IF;
  RETURN QUERY
    SELECT ump.user_id, au.email::text, ump.menu_key, ump.granted, ump.updated_at,
           ump.granted_by,
           COALESCE(NULLIF(btrim(gp.display_name), ''), NULLIF(btrim(gp.full_name), ''), gb.email::text) AS granted_by_name
    FROM public.user_menu_permissions ump
    JOIN auth.users au ON au.id = ump.user_id
    LEFT JOIN auth.users gb ON gb.id = ump.granted_by
    LEFT JOIN public.profiles gp ON gp.user_id = ump.granted_by
    ORDER BY au.email, ump.menu_key;
END; $function$;

REVOKE ALL     ON FUNCTION public.admin_list_menu_permissions() FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.admin_list_menu_permissions() TO authenticated, service_role;
