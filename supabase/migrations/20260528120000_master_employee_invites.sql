-- Convites de funcionários pelo admin master (sócio)

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_estagiario BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.is_estagiario IS 'Indica estagiário; usado com role_template na criação pelo master.';

-- Admin master: diretor (papel app) ou admin@juridico.com ou cargo sócio no perfil
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

GRANT EXECUTE ON FUNCTION public.is_master_admin(UUID) TO authenticated;

-- Atualiza perfil após convite (chamado pela edge function com service role)
CREATE OR REPLACE FUNCTION public.apply_employee_profile(
  p_user_id UUID,
  p_full_name TEXT,
  p_role_template_id UUID,
  p_is_estagiario BOOLEAN,
  p_app_role public.app_role
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET
    display_name = p_full_name,
    full_name = p_full_name,
    role_template_id = p_role_template_id,
    is_estagiario = COALESCE(p_is_estagiario, false),
    updated_at = now()
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    INSERT INTO public.profiles (user_id, display_name, full_name, role_template_id, is_estagiario)
    VALUES (p_user_id, p_full_name, p_full_name, p_role_template_id, COALESCE(p_is_estagiario, false));
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_user_id, p_app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_employee_profile(UUID, TEXT, UUID, BOOLEAN, public.app_role) TO service_role;
