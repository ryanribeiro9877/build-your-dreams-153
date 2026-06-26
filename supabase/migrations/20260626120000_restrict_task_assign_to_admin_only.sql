-- Atribuição de tarefas passa a ser exclusiva do Admin/master.
-- Remove can_assign do cargo lider_recepcao (Líder de Recepção), mantendo socio
-- (que é master). Com isso, create_user_task só permite atribuição pelo Admin.
UPDATE public.role_task_matrix
SET can_assign = false
WHERE can_assign = true
  AND role_template_id = (SELECT id FROM public.role_templates WHERE code = 'lider_recepcao');
