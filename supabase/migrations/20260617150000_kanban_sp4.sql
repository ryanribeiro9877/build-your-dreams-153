-- ============================================================================
-- KANBAN SP4 — Checklist + Workflow (rastreador de etapas sequenciais)
-- ============================================================================
-- Blocos funcionais do hub. Documentos reusa TaskAttachments (sem backend).
-- Depende de kanban_can_edit_task / kanban_can_admin (SP1/SP3).
-- Idempotente / transacional. RPCs SECURITY DEFINER, search_path fixo, gate.
-- ============================================================================

BEGIN;

-- ─── Checklist ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.task_checklist_items (
  id           UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_task_id UUID NOT NULL REFERENCES public.user_tasks(id) ON DELETE CASCADE,
  body         TEXT NOT NULL,
  done         BOOLEAN NOT NULL DEFAULT false,
  position     INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS task_checklist_items_task_idx ON public.task_checklist_items (user_task_id, position);

ALTER TABLE public.task_checklist_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "task_checklist read" ON public.task_checklist_items;
CREATE POLICY "task_checklist read" ON public.task_checklist_items FOR SELECT TO authenticated
  USING (public.kanban_can_edit_task(user_task_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.get_task_checklist(p_task_id UUID)
RETURNS TABLE (id UUID, body TEXT, done BOOLEAN, "position" INTEGER)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'get_task_checklist: não autenticado'; END IF;
  IF NOT public.kanban_can_edit_task(p_task_id, auth.uid()) THEN
    RAISE EXCEPTION 'get_task_checklist: sem acesso a esta tarefa';
  END IF;
  RETURN QUERY
    SELECT c.id, c.body, c.done, c.position
    FROM public.task_checklist_items c
    WHERE c.user_task_id = p_task_id
    ORDER BY c.position ASC, c.created_at ASC;
END;
$$;
REVOKE ALL ON FUNCTION public.get_task_checklist(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_task_checklist(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.kanban_add_checklist_item(p_task_id UUID, p_body TEXT)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid UUID; v_id UUID; v_pos INTEGER;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'kanban_add_checklist_item: não autenticado'; END IF;
  IF NOT public.kanban_can_edit_task(p_task_id, v_uid) THEN
    RAISE EXCEPTION 'kanban_add_checklist_item: sem acesso a esta tarefa';
  END IF;
  IF p_body IS NULL OR char_length(btrim(p_body)) = 0 THEN
    RAISE EXCEPTION 'kanban_add_checklist_item: item vazio';
  END IF;
  SELECT COALESCE(max(position), -1) + 1 INTO v_pos FROM public.task_checklist_items WHERE user_task_id = p_task_id;
  INSERT INTO public.task_checklist_items (user_task_id, body, position)
  VALUES (p_task_id, btrim(p_body), v_pos) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.kanban_add_checklist_item(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kanban_add_checklist_item(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.kanban_toggle_checklist_item(p_item_id UUID, p_done BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid UUID; v_task UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'kanban_toggle_checklist_item: não autenticado'; END IF;
  SELECT user_task_id INTO v_task FROM public.task_checklist_items WHERE id = p_item_id;
  IF v_task IS NULL THEN RAISE EXCEPTION 'kanban_toggle_checklist_item: item não encontrado'; END IF;
  IF NOT public.kanban_can_edit_task(v_task, v_uid) THEN
    RAISE EXCEPTION 'kanban_toggle_checklist_item: sem acesso a esta tarefa';
  END IF;
  UPDATE public.task_checklist_items SET done = COALESCE(p_done, false) WHERE id = p_item_id;
END;
$$;
REVOKE ALL ON FUNCTION public.kanban_toggle_checklist_item(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kanban_toggle_checklist_item(UUID, BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.kanban_delete_checklist_item(p_item_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid UUID; v_task UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'kanban_delete_checklist_item: não autenticado'; END IF;
  SELECT user_task_id INTO v_task FROM public.task_checklist_items WHERE id = p_item_id;
  IF v_task IS NULL THEN RETURN; END IF;
  IF NOT public.kanban_can_edit_task(v_task, v_uid) THEN
    RAISE EXCEPTION 'kanban_delete_checklist_item: sem acesso a esta tarefa';
  END IF;
  DELETE FROM public.task_checklist_items WHERE id = p_item_id;
END;
$$;
REVOKE ALL ON FUNCTION public.kanban_delete_checklist_item(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kanban_delete_checklist_item(UUID) TO authenticated;

-- ─── Workflow (rastreador de etapas sequenciais) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.workflow_templates (
  id         UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.workflow_template_steps (
  id          UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.workflow_templates(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  position    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS workflow_template_steps_tpl_idx ON public.workflow_template_steps (template_id, position);

CREATE TABLE IF NOT EXISTS public.task_workflow_instances (
  id            UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_task_id  UUID NOT NULL REFERENCES public.user_tasks(id) ON DELETE CASCADE,
  template_id   UUID REFERENCES public.workflow_templates(id) ON DELETE SET NULL,
  template_name TEXT NOT NULL,
  started_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS task_workflow_instances_task_idx ON public.task_workflow_instances (user_task_id, started_at DESC);

CREATE TABLE IF NOT EXISTS public.task_workflow_step_states (
  id          UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instance_id UUID NOT NULL REFERENCES public.task_workflow_instances(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  position    INTEGER NOT NULL DEFAULT 0,
  done        BOOLEAN NOT NULL DEFAULT false,
  done_at     TIMESTAMPTZ,
  done_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS task_workflow_step_states_inst_idx ON public.task_workflow_step_states (instance_id, position);

ALTER TABLE public.workflow_templates        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_template_steps   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_workflow_instances   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_workflow_step_states ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "workflow_templates read" ON public.workflow_templates;
CREATE POLICY "workflow_templates read" ON public.workflow_templates FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "workflow_template_steps read" ON public.workflow_template_steps;
CREATE POLICY "workflow_template_steps read" ON public.workflow_template_steps FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "task_workflow_instances read" ON public.task_workflow_instances;
CREATE POLICY "task_workflow_instances read" ON public.task_workflow_instances FOR SELECT TO authenticated
  USING (public.kanban_can_edit_task(user_task_id, auth.uid()));
DROP POLICY IF EXISTS "task_workflow_step_states read" ON public.task_workflow_step_states;
CREATE POLICY "task_workflow_step_states read" ON public.task_workflow_step_states FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.task_workflow_instances i
                 WHERE i.id = instance_id AND public.kanban_can_edit_task(i.user_task_id, auth.uid())));

CREATE OR REPLACE FUNCTION public.get_workflow_templates()
RETURNS TABLE (id UUID, name TEXT, step_count INTEGER)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'get_workflow_templates: não autenticado'; END IF;
  RETURN QUERY
    SELECT t.id, t.name,
      (SELECT count(*)::INTEGER FROM public.workflow_template_steps s WHERE s.template_id = t.id)
    FROM public.workflow_templates t
    ORDER BY t.name ASC;
END;
$$;
REVOKE ALL ON FUNCTION public.get_workflow_templates() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_workflow_templates() TO authenticated;

CREATE OR REPLACE FUNCTION public.kanban_create_workflow_template(p_name TEXT, p_steps TEXT[])
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid UUID; v_id UUID; v_step TEXT; v_pos INTEGER := 0;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'kanban_create_workflow_template: não autenticado'; END IF;
  IF NOT public.kanban_can_admin(v_uid) THEN
    RAISE EXCEPTION 'kanban_create_workflow_template: apenas administradores';
  END IF;
  IF p_name IS NULL OR char_length(btrim(p_name)) = 0 THEN
    RAISE EXCEPTION 'kanban_create_workflow_template: nome obrigatório';
  END IF;
  INSERT INTO public.workflow_templates (name) VALUES (btrim(p_name)) RETURNING id INTO v_id;
  IF p_steps IS NOT NULL THEN
    FOREACH v_step IN ARRAY p_steps LOOP
      IF NULLIF(btrim(v_step), '') IS NOT NULL THEN
        INSERT INTO public.workflow_template_steps (template_id, name, position)
        VALUES (v_id, btrim(v_step), v_pos);
        v_pos := v_pos + 1;
      END IF;
    END LOOP;
  END IF;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.kanban_create_workflow_template(TEXT, TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kanban_create_workflow_template(TEXT, TEXT[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.kanban_delete_workflow_template(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'kanban_delete_workflow_template: não autenticado'; END IF;
  IF NOT public.kanban_can_admin(v_uid) THEN
    RAISE EXCEPTION 'kanban_delete_workflow_template: apenas administradores';
  END IF;
  DELETE FROM public.workflow_templates WHERE id = p_id;
END;
$$;
REVOKE ALL ON FUNCTION public.kanban_delete_workflow_template(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kanban_delete_workflow_template(UUID) TO authenticated;

-- Instância mais recente da tarefa + etapas (ou null).
CREATE OR REPLACE FUNCTION public.get_task_workflow(p_task_id UUID)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid UUID; v_inst public.task_workflow_instances; v_steps jsonb;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'get_task_workflow: não autenticado'; END IF;
  IF NOT public.kanban_can_edit_task(p_task_id, v_uid) THEN
    RAISE EXCEPTION 'get_task_workflow: sem acesso a esta tarefa';
  END IF;

  SELECT * INTO v_inst FROM public.task_workflow_instances
    WHERE user_task_id = p_task_id ORDER BY started_at DESC LIMIT 1;
  IF v_inst.id IS NULL THEN RETURN NULL; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', s.id, 'name', s.name, 'position', s.position, 'done', s.done, 'done_at', s.done_at
         ) ORDER BY s.position ASC), '[]'::jsonb)
  INTO v_steps FROM public.task_workflow_step_states s WHERE s.instance_id = v_inst.id;

  RETURN jsonb_build_object(
    'instance_id', v_inst.id,
    'template_name', v_inst.template_name,
    'started_at', v_inst.started_at,
    'steps', v_steps
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_task_workflow(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_task_workflow(UUID) TO authenticated;

-- Inicia um fluxo numa tarefa: cria instância + copia as etapas do template.
CREATE OR REPLACE FUNCTION public.kanban_start_workflow(p_task_id UUID, p_template_id UUID)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid UUID; v_inst UUID; v_tpl public.workflow_templates;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'kanban_start_workflow: não autenticado'; END IF;
  IF NOT public.kanban_can_edit_task(p_task_id, v_uid) THEN
    RAISE EXCEPTION 'kanban_start_workflow: sem acesso a esta tarefa';
  END IF;
  SELECT * INTO v_tpl FROM public.workflow_templates WHERE id = p_template_id;
  IF v_tpl.id IS NULL THEN RAISE EXCEPTION 'kanban_start_workflow: template não encontrado'; END IF;

  INSERT INTO public.task_workflow_instances (user_task_id, template_id, template_name, started_by)
  VALUES (p_task_id, v_tpl.id, v_tpl.name, v_uid) RETURNING id INTO v_inst;

  INSERT INTO public.task_workflow_step_states (instance_id, name, position)
    SELECT v_inst, s.name, s.position
    FROM public.workflow_template_steps s WHERE s.template_id = v_tpl.id;

  RETURN v_inst;
END;
$$;
REVOKE ALL ON FUNCTION public.kanban_start_workflow(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kanban_start_workflow(UUID, UUID) TO authenticated;

-- Marca/desmarca uma etapa de uma instância.
CREATE OR REPLACE FUNCTION public.kanban_set_workflow_step(p_step_state_id UUID, p_done BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid UUID; v_task UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'kanban_set_workflow_step: não autenticado'; END IF;
  SELECT i.user_task_id INTO v_task
    FROM public.task_workflow_step_states s
    JOIN public.task_workflow_instances i ON i.id = s.instance_id
    WHERE s.id = p_step_state_id;
  IF v_task IS NULL THEN RAISE EXCEPTION 'kanban_set_workflow_step: etapa não encontrada'; END IF;
  IF NOT public.kanban_can_edit_task(v_task, v_uid) THEN
    RAISE EXCEPTION 'kanban_set_workflow_step: sem acesso a esta tarefa';
  END IF;
  UPDATE public.task_workflow_step_states
  SET done = COALESCE(p_done, false),
      done_at = CASE WHEN COALESCE(p_done, false) THEN now() ELSE NULL END,
      done_by = CASE WHEN COALESCE(p_done, false) THEN v_uid ELSE NULL END
  WHERE id = p_step_state_id;
END;
$$;
REVOKE ALL ON FUNCTION public.kanban_set_workflow_step(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kanban_set_workflow_step(UUID, BOOLEAN) TO authenticated;

COMMIT;
