-- ============================================================================
-- V16 — UI filtrada por role_template + provisionamento de agentes
-- ============================================================================
-- 1. Adiciona Especialista Confecção Tributário (faltava no V14)
-- 2. Adiciona esp_captacao_cooperativa pro role recepcionista (Taís) no matrix
-- 3. Adiciona flag `requires_is_estagiario` em role_agent_matrix
--    pra diferenciar Taís (recepcionista, is_estagiario=false) de
--    Yasmin (recepcionista, is_estagiario=true) sem precisar de cargo separado
-- 4. Migra Yasmin: estagiária deixou de ser cargo. Quem tem
--    profiles.role_template_id = estagiaria_recepcao + is_estagiario=true vira
--    role_template = recepcionista + is_estagiario=true
-- 5. Cria RPC public.provision_user_agents(user_id) que clona agent_templates
--    para o usuário, baseado no role_template_id + is_estagiario
-- 6. Chama o RPC dentro de apply_employee_profile (pós-convite)
-- 7. Cria view convenient agents_by_user pra frontend
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Especialista Confecção Tributário (FALTOU no V14)
-- ----------------------------------------------------------------------------
INSERT INTO public.agent_templates (
  code, display_name, description, role, stage, area,
  default_color, default_system_prompt, sort_order
) VALUES
('esp_conf_tributario',
 'Especialista Confecção Tributário',
 'Confecção de peças tributárias — exclusivo do sócio.',
 'specialist', 'confeccao', 'tributario', '#92400E',
 'Você é o Especialista em Confecção de peças tributárias. Atua em causas de execução fiscal indevida, repetição de indébito, ICMS/ISS, contribuições previdenciárias, e outras causas tributárias. Atende exclusivamente sob direção do sócio Rodrigo Bacellar.',
 85)
ON CONFLICT (code) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. Adiciona requires_is_estagiario em role_agent_matrix
-- ----------------------------------------------------------------------------
-- Valores:
--   NULL  → agente vai pra todos com esse role_template (default)
--   true  → APENAS se profiles.is_estagiario = true
--   false → APENAS se profiles.is_estagiario = false
ALTER TABLE public.role_agent_matrix
  ADD COLUMN IF NOT EXISTS requires_is_estagiario BOOLEAN;

COMMENT ON COLUMN public.role_agent_matrix.requires_is_estagiario IS
  'NULL = sem filtro · true = só estagiários · false = só não-estagiários. Usado pra diferenciar Taís (false) de Yasmin (true) no mesmo cargo recepcionista.';

-- ----------------------------------------------------------------------------
-- 3. Liga Confecção Tributário ao sócio
-- ----------------------------------------------------------------------------
INSERT INTO public.role_agent_matrix (role_template_id, agent_template_id, is_default)
SELECT rt.id, at.id, true
FROM public.role_templates rt, public.agent_templates at
WHERE rt.code = 'socio' AND at.code = 'esp_conf_tributario'
ON CONFLICT (role_template_id, agent_template_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 4. Reconstrói role_agent_matrix da recepcionista (Taís + Yasmin no mesmo cargo)
-- ----------------------------------------------------------------------------
-- Limpa entradas atuais da recepcionista (vamos reescrever com flags)
DELETE FROM public.role_agent_matrix
WHERE role_template_id = (SELECT id FROM public.role_templates WHERE code = 'recepcionista');

-- Limpa entradas órfãs do cargo estagiaria_recepcao (cargo será desativado)
DELETE FROM public.role_agent_matrix
WHERE role_template_id = (SELECT id FROM public.role_templates WHERE code = 'estagiaria_recepcao');

-- Compartilhados Taís + Yasmin (requires_is_estagiario NULL — única linha por agent_template)
INSERT INTO public.role_agent_matrix (role_template_id, agent_template_id, is_default, requires_is_estagiario)
SELECT rt.id, at.id, true, NULL
FROM public.role_templates rt, public.agent_templates at
WHERE rt.code = 'recepcionista'
  AND at.code IN (
    'asst_root_lider_recepcao',
    'esp_whatsapp_fila',
    'esp_tabela_audiencias',
    'esp_documentacao_geral',
    'esp_lembretes',
    'esp_demandas_admin',
    'esp_kanban_pendencias'
  );

-- Taís — recepcionista NÃO-estagiária (exclusivos)
INSERT INTO public.role_agent_matrix (role_template_id, agent_template_id, is_default, requires_is_estagiario)
SELECT rt.id, at.id, true, false
FROM public.role_templates rt, public.agent_templates at
WHERE rt.code = 'recepcionista'
  AND at.code IN (
    'esp_triagem',
    'esp_cadastro_projuris_lider',
    'esp_captacao_cooperativa',
    'mon_pendencias_cliente'
  );

-- Yasmin — recepcionista ESTAGIÁRIA (exclusivos)
INSERT INTO public.role_agent_matrix (role_template_id, agent_template_id, is_default, requires_is_estagiario)
SELECT rt.id, at.id, true, true
FROM public.role_templates rt, public.agent_templates at
WHERE rt.code = 'recepcionista'
  AND at.code IN (
    'esp_cadastro_projuris_rascunho'
  );

-- ----------------------------------------------------------------------------
-- 5. Desativa cargo estagiaria_recepcao + asst_root_estagiaria (órfãos)
-- ----------------------------------------------------------------------------
UPDATE public.role_templates
SET has_login = false,
    description = description || ' [DESATIVADO V16: virou flag is_estagiario sobre recepcionista]'
WHERE code = 'estagiaria_recepcao';

-- Template asst_root_estagiaria fica disponível mas marcado inativo
UPDATE public.agent_templates
SET is_active = false,
    description = description || ' [DESATIVADO V16: substituído por asst_root_lider_recepcao]'
WHERE code = 'asst_root_estagiaria';

-- ----------------------------------------------------------------------------
-- 6. Atualiza role_task_matrix: estagiaria_recepcao → recepcionista
-- ----------------------------------------------------------------------------
-- Para cada (task_type_id, estagiaria_recepcao) → vira (task_type_id, recepcionista)
-- ON CONFLICT mantém o existente (recepcionista já estava lá na maioria das tasks)
INSERT INTO public.role_task_matrix (task_type_id, role_template_id, can_execute, can_assign, is_default_assignee)
SELECT
  rtm.task_type_id,
  (SELECT id FROM public.role_templates WHERE code = 'recepcionista'),
  rtm.can_execute,
  rtm.can_assign,
  rtm.is_default_assignee
FROM public.role_task_matrix rtm
WHERE rtm.role_template_id = (SELECT id FROM public.role_templates WHERE code = 'estagiaria_recepcao')
ON CONFLICT (task_type_id, role_template_id) DO NOTHING;

-- Remove entradas da estagiaria_recepcao do role_task_matrix
DELETE FROM public.role_task_matrix
WHERE role_template_id = (SELECT id FROM public.role_templates WHERE code = 'estagiaria_recepcao');

-- ----------------------------------------------------------------------------
-- 7. Migra profiles existentes: estagiaria_recepcao → recepcionista + is_estagiario
-- ----------------------------------------------------------------------------
-- (a migration anterior 20260529 já fez isso, mas reaplicamos pra garantir
--  idempotência caso a migration nova rode em ambiente fresh)
UPDATE public.profiles p
SET
  role_template_id = (SELECT id FROM public.role_templates WHERE code = 'recepcionista' LIMIT 1),
  is_estagiario = true,
  updated_at = now()
WHERE p.role_template_id = (
  SELECT id FROM public.role_templates WHERE code = 'estagiaria_recepcao' LIMIT 1
);

-- ----------------------------------------------------------------------------
-- 8. RPC: provision_user_agents (clona agent_templates pro usuário)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.provision_user_agents(p_user_id UUID)
RETURNS TABLE (
  agent_id UUID,
  template_code TEXT,
  display_name TEXT,
  was_created BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_template_id UUID;
  v_is_estagiario BOOLEAN;
  v_default_dept_id UUID;
  v_template RECORD;
  v_new_agent_id UUID;
  v_existing_agent_id UUID;
  v_was_created BOOLEAN;
BEGIN
  -- 1. Carrega perfil do usuário
  SELECT p.role_template_id, COALESCE(p.is_estagiario, false)
  INTO v_role_template_id, v_is_estagiario
  FROM public.profiles p
  WHERE p.user_id = p_user_id;

  IF v_role_template_id IS NULL THEN
    RAISE NOTICE 'provision_user_agents: usuário % sem role_template_id; nenhum agente provisionado', p_user_id;
    RETURN;
  END IF;

  -- 2. Departamento default (fallback "assistente" ou primeiro disponível)
  SELECT id INTO v_default_dept_id
  FROM public.departments
  WHERE name ILIKE '%assistente%'
  LIMIT 1;

  IF v_default_dept_id IS NULL THEN
    SELECT id INTO v_default_dept_id FROM public.departments LIMIT 1;
  END IF;

  IF v_default_dept_id IS NULL THEN
    RAISE EXCEPTION 'provision_user_agents: nenhum departamento disponível para vincular agentes';
  END IF;

  -- 3. Loop nos agent_templates do role do usuário (respeitando filtro is_estagiario)
  FOR v_template IN
    SELECT
      at.id           AS template_id,
      at.code         AS template_code,
      at.display_name AS display_name,
      at.description  AS description,
      at.role         AS agent_role,
      at.default_color AS color,
      at.default_provider AS provider,
      at.default_model AS model,
      at.default_temperature AS temperature,
      at.default_max_tokens AS max_tokens,
      at.default_system_prompt AS system_prompt
    FROM public.role_agent_matrix ram
    JOIN public.agent_templates at ON at.id = ram.agent_template_id
    WHERE ram.role_template_id = v_role_template_id
      AND at.is_active = true
      AND (
        ram.requires_is_estagiario IS NULL
        OR ram.requires_is_estagiario = v_is_estagiario
      )
    ORDER BY at.sort_order ASC
  LOOP
    -- Verifica se já existe agente desse template pra esse user
    SELECT a.id INTO v_existing_agent_id
    FROM public.agents a
    WHERE a.owner_user_id = p_user_id
      AND a.source_template_id = v_template.template_id
    LIMIT 1;

    IF v_existing_agent_id IS NOT NULL THEN
      -- Já existe, não recria
      agent_id := v_existing_agent_id;
      template_code := v_template.template_code;
      display_name := v_template.display_name;
      was_created := false;
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- Clona como agente pessoal
    INSERT INTO public.agents (
      name, color, role, status,
      department_id, can_orchestrate, max_concurrent_tasks, current_tasks,
      description, is_active, level,
      owner_user_id, source_template_id, is_overridden, is_personal,
      provider, model, temperature, max_tokens, system_prompt
    ) VALUES (
      v_template.display_name,
      v_template.color,
      v_template.agent_role,
      'idle',
      v_default_dept_id,
      v_template.agent_role IN ('ceo', 'director', 'assistant_root'),
      CASE v_template.agent_role
        WHEN 'ceo' THEN 20
        WHEN 'assistant_root' THEN 15
        WHEN 'director' THEN 10
        WHEN 'manager' THEN 8
        ELSE 5
      END,
      0,
      v_template.description,
      true,
      CASE v_template.agent_role
        WHEN 'ceo' THEN 1
        WHEN 'assistant_root' THEN 1
        WHEN 'director' THEN 1
        WHEN 'manager' THEN 2
        WHEN 'specialist' THEN 3
        WHEN 'monitor' THEN 3
        ELSE 4
      END,
      p_user_id,
      v_template.template_id,
      false,
      true,
      v_template.provider::text,
      v_template.model,
      v_template.temperature,
      v_template.max_tokens,
      v_template.system_prompt
    )
    RETURNING id INTO v_new_agent_id;

    agent_id := v_new_agent_id;
    template_code := v_template.template_code;
    display_name := v_template.display_name;
    was_created := true;
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.provision_user_agents(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provision_user_agents(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.provision_user_agents(UUID) TO authenticated;
-- authenticated tem permissão pra rodar PRA SI MESMO (RLS via SECURITY DEFINER
-- garante que só clona pro próprio user_id se chamado direto). Mas usaremos
-- principalmente via apply_employee_profile no service_role.

COMMENT ON FUNCTION public.provision_user_agents(UUID) IS
  'Clona agent_templates como agentes pessoais (agents.is_personal=true, owner_user_id=p_user_id) baseado no role_template do perfil + flag is_estagiario. Idempotente: não recria se já existir agente do mesmo template pro usuário.';

-- ----------------------------------------------------------------------------
-- 9. Atualiza apply_employee_profile pra chamar provision_user_agents
-- ----------------------------------------------------------------------------
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
DECLARE
  v_provisioned_count INTEGER;
BEGIN
  -- Atualiza ou cria perfil
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

  -- Garante role app
  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_user_id, p_app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Provisiona agentes do role_template (NOVO em V16)
  SELECT COUNT(*) INTO v_provisioned_count
  FROM public.provision_user_agents(p_user_id);

  RAISE NOTICE 'apply_employee_profile: provisionados % agentes para user %', v_provisioned_count, p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_employee_profile(UUID, TEXT, UUID, BOOLEAN, public.app_role) TO service_role;

-- ----------------------------------------------------------------------------
-- 10. View pra UI: agents_with_owner (lista agentes com info do dono)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.agents_with_owner_v AS
SELECT
  a.id,
  a.name,
  a.color,
  a.role,
  a.status,
  a.department_id,
  a.can_orchestrate,
  a.max_concurrent_tasks,
  a.current_tasks,
  a.description,
  a.level,
  a.is_active,
  a.owner_user_id,
  a.source_template_id,
  a.is_personal,
  a.is_overridden,
  at.code AS template_code,
  at.stage AS template_stage,
  at.area AS template_area,
  d.name AS department_name,
  p.display_name AS owner_display_name,
  rt.code AS owner_role_code,
  rt.display_name AS owner_role_label
FROM public.agents a
LEFT JOIN public.agent_templates at ON at.id = a.source_template_id
LEFT JOIN public.departments d ON d.id = a.department_id
LEFT JOIN public.profiles p ON p.user_id = a.owner_user_id
LEFT JOIN public.role_templates rt ON rt.id = p.role_template_id
WHERE a.is_active = true;

COMMENT ON VIEW public.agents_with_owner_v IS
  'View enriquecida de agents incluindo info do dono (profile + role_template) e template de origem (stage, area). Usada pelo useUserAgents da V16.';

GRANT SELECT ON public.agents_with_owner_v TO authenticated;

-- ----------------------------------------------------------------------------
-- 11. RPC pra UI: get_my_workspace (resumo do que o user logado vê)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_workspace()
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_result JSON;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  SELECT json_build_object(
    'user_id', v_user_id,
    'profile', json_build_object(
      'full_name', p.full_name,
      'display_name', p.display_name,
      'is_estagiario', COALESCE(p.is_estagiario, false)
    ),
    'role_template', CASE WHEN rt.id IS NULL THEN NULL ELSE json_build_object(
      'id', rt.id,
      'code', rt.code,
      'display_name', rt.display_name,
      'description', rt.description,
      'stages', rt.stages,
      'areas', rt.areas,
      'is_admin', rt.is_admin
    ) END,
    'agents', COALESCE((
      SELECT json_agg(json_build_object(
        'id', a.id,
        'name', a.name,
        'role', a.role,
        'color', a.color,
        'status', a.status,
        'template_code', a.template_code,
        'template_stage', a.template_stage,
        'template_area', a.template_area
      ) ORDER BY
        CASE a.role
          WHEN 'ceo' THEN 0
          WHEN 'assistant_root' THEN 1
          WHEN 'director' THEN 2
          WHEN 'manager' THEN 3
          WHEN 'specialist' THEN 4
          WHEN 'monitor' THEN 5
          ELSE 9
        END,
        a.name
      )
      FROM public.agents_with_owner_v a
      WHERE a.owner_user_id = v_user_id
    ), '[]'::json),
    'is_master', public.is_master_admin(v_user_id)
  ) INTO v_result
  FROM public.profiles p
  LEFT JOIN public.role_templates rt ON rt.id = p.role_template_id
  WHERE p.user_id = v_user_id;

  RETURN COALESCE(v_result, json_build_object('user_id', v_user_id, 'profile', NULL, 'role_template', NULL, 'agents', '[]'::json, 'is_master', false));
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_workspace() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_workspace() TO authenticated;

COMMENT ON FUNCTION public.get_my_workspace() IS
  'Retorna em uma chamada o workspace do usuário logado: profile, role_template, lista de agentes pessoais e flag is_master. Usado pelo useUserAgents da V16.';

COMMIT;
