-- ============================================================================
-- V23 — Diretor (N2) para todos os perfis (orquestracao N1->N2->N3)
-- ============================================================================
-- Hoje so o 'socio' tem diretores. Para a cadeia N1->N2->N3 funcionar para todos
-- os perfis, criamos UM template de "Diretor de Area" generico e vinculamos aos
-- role_templates que ainda nao tem diretor. O diretor roteia entre os
-- especialistas (N3) do proprio dono e valida as entregas — nao redige.
-- Idempotente.
-- ============================================================================

BEGIN;

-- 1. Template do Diretor de Area (generico)
INSERT INTO public.agent_templates (
  code, display_name, description, role, stage, area,
  default_provider, default_model, default_temperature, default_max_tokens,
  default_system_prompt, is_active, sort_order
)
SELECT
  'dir_area_geral',
  'Diretor de Área',
  'Diretor que analisa a solicitacao, delega ao especialista certo e valida a entrega.',
  'director', 'gestao', NULL,
  'openai', 'gpt-4o-mini', 0.30, 4096,
  'Voce e Diretor(a) de area em um escritorio de advocacia (JurisAI). Voce NAO redige pecas nem executa tarefas — quem executa sao os especialistas da sua equipe. Seu papel: ' ||
  '1) ANALISAR a solicitacao recebida e identificar qual ESPECIALISTA deve executa-la; ' ||
  '2) DELEGAR ao especialista certo (ferramenta delegate) com um resumo claro do que entregar; ' ||
  '3) VALIDAR criticamente a entrega: se estiver correta, completa e tecnicamente adequada, aprove; se houver erro ou falta, devolva com instrucoes especificas de correcao. ' ||
  'Seja rigoroso, tecnico e objetivo.',
  true, 5
WHERE NOT EXISTS (SELECT 1 FROM public.agent_templates WHERE code = 'dir_area_geral');

-- 2. Vincula o diretor generico aos perfis com login que ainda NAO tem diretor
INSERT INTO public.role_agent_matrix (role_template_id, agent_template_id, is_default)
SELECT rt.id, (SELECT id FROM public.agent_templates WHERE code = 'dir_area_geral'), true
FROM public.role_templates rt
WHERE rt.has_login = true
  AND NOT EXISTS (
    SELECT 1 FROM public.role_agent_matrix ram
    JOIN public.agent_templates at ON at.id = ram.agent_template_id
    WHERE ram.role_template_id = rt.id AND at.role = 'director'
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.role_agent_matrix ram2
    WHERE ram2.role_template_id = rt.id
      AND ram2.agent_template_id = (SELECT id FROM public.agent_templates WHERE code = 'dir_area_geral')
  );

-- 3. Reprovisiona agentes dos usuarios existentes (idempotente — cria so o que falta)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT user_id FROM public.profiles WHERE role_template_id IS NOT NULL LOOP
    PERFORM public.provision_user_agents(r.user_id);
  END LOOP;
END $$;

COMMIT;
