-- Recepção unificada: estagiário é profiles.is_estagiario, não cargo no catálogo

UPDATE public.role_templates
SET has_login = false
WHERE code = 'estagiaria_recepcao';

UPDATE public.role_templates
SET stages = ARRAY['recepcao', 'recepcao_supervisionada', 'kanban_pendencias']::public.org_stage[]
WHERE code = 'recepcionista';

UPDATE public.profiles p
SET
  role_template_id = (SELECT id FROM public.role_templates WHERE code = 'recepcionista' LIMIT 1),
  is_estagiario = true
WHERE p.role_template_id = (
  SELECT id FROM public.role_templates WHERE code = 'estagiaria_recepcao' LIMIT 1
);
