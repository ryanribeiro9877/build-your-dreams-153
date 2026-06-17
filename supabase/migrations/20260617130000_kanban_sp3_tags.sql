-- ============================================================================
-- KANBAN SP3 (parte 1) — Marcadores (tags) + detalhe da tarefa
-- ============================================================================
-- Tags compartilhadas do escritório (criação livre) + N:N com user_tasks.
-- RPCs auxiliares (não reescrevem o pesado get_kanban_board): tags por card do
-- quadro (merge client-side) e detalhe completo da tarefa para o modal-hub.
-- Idempotente / transacional. RPCs SECURITY DEFINER, search_path fixo, gate.
-- ============================================================================

BEGIN;

-- (1) Tabelas
CREATE TABLE IF NOT EXISTS public.kanban_tags (
  id         UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT '#eab308',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Nome único por forma normalizada (case/space-insensitive) — evita duplicatas.
CREATE UNIQUE INDEX IF NOT EXISTS kanban_tags_name_uq ON public.kanban_tags (lower(btrim(name)));

CREATE TABLE IF NOT EXISTS public.task_tags (
  user_task_id UUID NOT NULL REFERENCES public.user_tasks(id) ON DELETE CASCADE,
  tag_id       UUID NOT NULL REFERENCES public.kanban_tags(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_task_id, tag_id)
);
CREATE INDEX IF NOT EXISTS task_tags_tag_idx ON public.task_tags (tag_id);

-- (2) RLS — leitura p/ autenticados; escrita só via RPC (SECURITY DEFINER).
ALTER TABLE public.kanban_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_tags  ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "kanban_tags read" ON public.kanban_tags;
CREATE POLICY "kanban_tags read" ON public.kanban_tags FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "task_tags read" ON public.task_tags;
CREATE POLICY "task_tags read" ON public.task_tags FOR SELECT TO authenticated USING (true);

-- (3) Helper de permissão de edição da tarefa: admin OR envolvido OR acesso ao
--     board onde a tarefa está.
CREATE OR REPLACE FUNCTION public.kanban_can_edit_task(p_task_id UUID, p_uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.kanban_can_admin(p_uid)
    OR EXISTS (
      SELECT 1 FROM public.user_tasks ut
      WHERE ut.id = p_task_id
        AND p_uid IN (ut.assigner_user_id, ut.assignee_user_id, ut.validator_user_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.kanban_card_placements cp
      WHERE cp.user_task_id = p_task_id AND public.kanban_can_access_board(cp.board_id, p_uid)
    );
$$;
GRANT EXECUTE ON FUNCTION public.kanban_can_edit_task(UUID, UUID) TO authenticated;

-- (4) RPCs de tags
CREATE OR REPLACE FUNCTION public.get_kanban_tags()
RETURNS TABLE (id UUID, name TEXT, color TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'get_kanban_tags: não autenticado'; END IF;
  RETURN QUERY SELECT t.id, t.name, t.color FROM public.kanban_tags t ORDER BY t.name ASC;
END;
$$;
REVOKE ALL ON FUNCTION public.get_kanban_tags() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_kanban_tags() TO authenticated;

-- Define o conjunto de tags de uma tarefa a partir de NOMES (cria os que faltam).
CREATE OR REPLACE FUNCTION public.kanban_set_task_tags(p_task_id UUID, p_names TEXT[])
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_name TEXT;
  v_tag_id UUID;
  v_keep UUID[] := ARRAY[]::UUID[];
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'kanban_set_task_tags: não autenticado'; END IF;
  IF NOT public.kanban_can_edit_task(p_task_id, v_uid) THEN
    RAISE EXCEPTION 'kanban_set_task_tags: sem permissão para esta tarefa';
  END IF;

  IF p_names IS NOT NULL THEN
    FOREACH v_name IN ARRAY p_names LOOP
      IF NULLIF(btrim(v_name), '') IS NOT NULL THEN
        -- find-or-create por nome normalizado
        SELECT id INTO v_tag_id FROM public.kanban_tags WHERE lower(btrim(name)) = lower(btrim(v_name)) LIMIT 1;
        IF v_tag_id IS NULL THEN
          INSERT INTO public.kanban_tags (name) VALUES (btrim(v_name)) RETURNING id INTO v_tag_id;
        END IF;
        v_keep := array_append(v_keep, v_tag_id);
        INSERT INTO public.task_tags (user_task_id, tag_id) VALUES (p_task_id, v_tag_id)
          ON CONFLICT (user_task_id, tag_id) DO NOTHING;
      END IF;
    END LOOP;
  END IF;

  -- Remove as tags que não estão mais na lista.
  DELETE FROM public.task_tags
  WHERE user_task_id = p_task_id
    AND (array_length(v_keep, 1) IS NULL OR NOT (tag_id = ANY(v_keep)));
END;
$$;
REVOKE ALL ON FUNCTION public.kanban_set_task_tags(UUID, TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kanban_set_task_tags(UUID, TEXT[]) TO authenticated;

-- Tags por card de um quadro (para merge client-side, como o envolvimento do SP2).
CREATE OR REPLACE FUNCTION public.get_kanban_board_tags(p_board_id UUID)
RETURNS TABLE (user_task_id UUID, tags JSONB)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'get_kanban_board_tags: não autenticado'; END IF;
  IF NOT public.kanban_can_access_board(p_board_id, v_uid) THEN
    RAISE EXCEPTION 'get_kanban_board_tags: acesso restrito';
  END IF;

  RETURN QUERY
    SELECT cp.user_task_id,
      COALESCE(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color) ORDER BY t.name), '[]'::jsonb)
    FROM public.kanban_card_placements cp
    JOIN public.task_tags x ON x.user_task_id = cp.user_task_id
    JOIN public.kanban_tags t ON t.id = x.tag_id
    WHERE cp.board_id = p_board_id
    GROUP BY cp.user_task_id;
END;
$$;
REVOKE ALL ON FUNCTION public.get_kanban_board_tags(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_kanban_board_tags(UUID) TO authenticated;

-- (5) Detalhe completo da tarefa para o modal-hub.
CREATE OR REPLACE FUNCTION public.get_user_task_detail(p_task_id UUID)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_result jsonb;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'get_user_task_detail: não autenticado'; END IF;
  IF NOT public.kanban_can_edit_task(p_task_id, v_uid) THEN
    RAISE EXCEPTION 'get_user_task_detail: sem acesso a esta tarefa';
  END IF;

  SELECT jsonb_build_object(
    'id', ut.id,
    'title', ut.title,
    'description', ut.description,
    'situacao', ut.situacao,
    'status', ut.status,
    'priority', ut.priority,
    'area', ut.area,
    'deadline_at', ut.deadline_at,
    'created_at', ut.created_at,
    'completed_at', ut.completed_at,
    'task_type_label', tt.display_name,
    'assignee_user_id', ut.assignee_user_id,
    'assignee_name', COALESCE(pa.full_name, pa.display_name, '—'),
    'assigner_user_id', ut.assigner_user_id,
    'assigner_name', COALESCE(pg.full_name, pg.display_name, '—'),
    'validator_user_id', ut.validator_user_id,
    'validator_name', COALESCE(pv.full_name, pv.display_name, NULL),
    'client_id', ut.client_id,
    'client_name', cl.full_name,
    'process_id', ut.process_id,
    'process_number', pr.process_number,
    'board_id', cp.board_id,
    'column_id', cp.column_id,
    'tags', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color) ORDER BY t.name)
      FROM public.task_tags x JOIN public.kanban_tags t ON t.id = x.tag_id
      WHERE x.user_task_id = ut.id
    ), '[]'::jsonb)
  ) INTO v_result
  FROM public.user_tasks ut
  JOIN public.task_types tt ON tt.id = ut.task_type_id
  LEFT JOIN public.profiles pa ON pa.user_id = ut.assignee_user_id
  LEFT JOIN public.profiles pg ON pg.user_id = ut.assigner_user_id
  LEFT JOIN public.profiles pv ON pv.user_id = ut.validator_user_id
  LEFT JOIN public.clients cl ON cl.id = ut.client_id
  LEFT JOIN public.processes pr ON pr.id = ut.process_id
  LEFT JOIN public.kanban_card_placements cp ON cp.user_task_id = ut.id
  WHERE ut.id = p_task_id;

  IF v_result IS NULL THEN RAISE EXCEPTION 'get_user_task_detail: tarefa não encontrada'; END IF;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_user_task_detail(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_task_detail(UUID) TO authenticated;

COMMIT;
