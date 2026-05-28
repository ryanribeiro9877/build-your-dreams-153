-- Master = diretor (app_role) ou admin@juridico.com ou cargo sócio no perfil
CREATE OR REPLACE FUNCTION public.is_master_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM auth.users u
      WHERE u.id = _user_id
        AND lower(u.email) = 'admin@juridico.com'
    )
    OR public.has_role(_user_id, 'director')
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.role_templates rt ON rt.id = p.role_template_id
      WHERE p.user_id = _user_id
        AND rt.code = 'socio'
    );
$$;
