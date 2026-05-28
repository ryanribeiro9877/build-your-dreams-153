-- ============================================================================
-- Bootstrap do Sócio
-- ============================================================================
-- Garante que:
--   1. Qualquer usuário com app_role = 'admin' E sem role_template_id ganha
--      cargo socio automaticamente
--   2. Após setar, é chamado provision_user_agents pra clonar os 10 agentes
--   3. admin@juridico.com (legado) é tratado especialmente
--
-- Não cria usuários novos. Não muda credenciais. Apenas preenche dados.
-- Idempotente: rodar 2x não duplica nada.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Backfill: usuários admin sem role_template viram socio
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_socio_template_id UUID;
  v_user RECORD;
  v_provisioned INTEGER;
BEGIN
  -- Pega o ID do template socio
  SELECT id INTO v_socio_template_id
  FROM public.role_templates
  WHERE code = 'socio';

  IF v_socio_template_id IS NULL THEN
    RAISE NOTICE 'bootstrap_socio: template socio não existe — V14 não foi aplicada?';
    RETURN;
  END IF;

  -- Loop sobre usuários que:
  --   - Têm app_role = 'admin' em user_roles
  --   - OU email é admin@juridico.com
  --   - E não têm role_template_id em profiles
  FOR v_user IN
    SELECT DISTINCT u.id AS user_id, u.email
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.user_id = u.id
    WHERE
      (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = u.id AND ur.role = 'admin'
        )
        OR lower(u.email) = 'admin@juridico.com'
      )
      AND (p.role_template_id IS NULL)
  LOOP
    RAISE NOTICE 'bootstrap_socio: configurando % (email=%) como socio',
      v_user.user_id, v_user.email;

    -- Garante profile com role_template = socio
    INSERT INTO public.profiles (user_id, display_name, full_name, role_template_id, is_estagiario)
    VALUES (
      v_user.user_id,
      'Sócio',
      'Sócio Bacellar Advogados',
      v_socio_template_id,
      false
    )
    ON CONFLICT (user_id) DO UPDATE
    SET
      role_template_id = v_socio_template_id,
      is_estagiario = false,
      display_name = COALESCE(public.profiles.display_name, 'Sócio'),
      full_name = COALESCE(public.profiles.full_name, 'Sócio Bacellar Advogados'),
      updated_at = now();

    -- Garante app_role admin
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_user.user_id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;

    -- Provisiona os 10 agentes do sócio (idempotente — não recria se já tem)
    SELECT COUNT(*) INTO v_provisioned
    FROM public.provision_user_agents(v_user.user_id);

    RAISE NOTICE 'bootstrap_socio: % agentes provisionados/verificados para %',
      v_provisioned, v_user.email;
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 2. Trigger: novos perfis com role_template_id setado provisionam automaticamente
-- ----------------------------------------------------------------------------
-- Cobre o caso de Lovable/edge-function setar role_template_id sem chamar
-- provision_user_agents diretamente. apply_employee_profile já chama, mas
-- esse trigger é fallback de segurança.
CREATE OR REPLACE FUNCTION public.trg_profile_after_role_template_set()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Só provisiona se role_template_id foi setado e antes era NULL
  -- (ou se mudou de cargo — o RPC é idempotente)
  IF NEW.role_template_id IS NOT NULL
     AND (OLD.role_template_id IS NULL OR OLD.role_template_id != NEW.role_template_id) THEN
    -- Provisiona em background (não bloqueia o INSERT/UPDATE)
    PERFORM public.provision_user_agents(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profile_provision_agents ON public.profiles;
CREATE TRIGGER trg_profile_provision_agents
  AFTER INSERT OR UPDATE OF role_template_id ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_profile_after_role_template_set();

COMMENT ON TRIGGER trg_profile_provision_agents ON public.profiles IS
  'V16+: quando profile.role_template_id é setado/mudado, dispara provision_user_agents. Idempotente — não cria duplicatas.';

COMMIT;
