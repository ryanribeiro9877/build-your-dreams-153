-- ============================================================================
-- KANBAN SP2 — suporte de backend para filtros (3 camadas) + filtros salvos
-- ============================================================================
-- A filtragem em si é client-side (sobre os cards já carregados do quadro).
-- O backend só precisa:
--   (1) expor assigner/validator por card (para as abas de envolvimento), sem
--       reescrever o pesado get_kanban_board — uma RPC leve dedicada + merge no
--       front;
--   (2) persistir filtros salvos por usuário.
-- Idempotente / transacional. RPCs SECURITY DEFINER, search_path fixo, gate.
-- ============================================================================

BEGIN;

-- (1) Envolvimento por card (assigner/validator) dos cards de um quadro.
--     Gate = kanban_can_access_board (mesmo do get_kanban_board).
CREATE OR REPLACE FUNCTION public.get_kanban_board_involvement(p_board_id UUID)
RETURNS TABLE (user_task_id UUID, assigner_user_id UUID, validator_user_id UUID)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'get_kanban_board_involvement: não autenticado';
  END IF;
  IF NOT public.kanban_can_access_board(p_board_id, v_uid) THEN
    RAISE EXCEPTION 'get_kanban_board_involvement: acesso restrito';
  END IF;

  RETURN QUERY
    SELECT ut.id, ut.assigner_user_id, ut.validator_user_id
    FROM public.kanban_card_placements cp
    JOIN public.user_tasks ut ON ut.id = cp.user_task_id
    WHERE cp.board_id = p_board_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_kanban_board_involvement(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_kanban_board_involvement(UUID) TO authenticated;

COMMENT ON FUNCTION public.get_kanban_board_involvement(UUID) IS
  'SP2: assigner/validator por card de um quadro, para as abas de envolvimento (filtro client-side). Gate kanban_can_access_board.';

-- (2) Filtros salvos por usuário (estado de KanbanFilterState serializado).
CREATE TABLE IF NOT EXISTS public.kanban_saved_filters (
  id         UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  filter     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kanban_saved_filters_user_idx ON public.kanban_saved_filters (user_id);

ALTER TABLE public.kanban_saved_filters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "kanban_saved_filters own" ON public.kanban_saved_filters;
CREATE POLICY "kanban_saved_filters own" ON public.kanban_saved_filters FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP TRIGGER IF EXISTS trg_kanban_saved_filters_updated ON public.kanban_saved_filters;
CREATE TRIGGER trg_kanban_saved_filters_updated BEFORE UPDATE ON public.kanban_saved_filters
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RPCs de filtros salvos.
CREATE OR REPLACE FUNCTION public.get_my_saved_filters()
RETURNS TABLE (id UUID, name TEXT, filter JSONB, created_at TIMESTAMPTZ)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'get_my_saved_filters: não autenticado';
  END IF;
  RETURN QUERY
    SELECT s.id, s.name, s.filter, s.created_at
    FROM public.kanban_saved_filters s
    WHERE s.user_id = v_uid
    ORDER BY s.name ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_saved_filters() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_saved_filters() TO authenticated;

CREATE OR REPLACE FUNCTION public.kanban_save_filter(p_name TEXT, p_filter JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_id UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'kanban_save_filter: não autenticado';
  END IF;
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'kanban_save_filter: nome obrigatório';
  END IF;

  INSERT INTO public.kanban_saved_filters (user_id, name, filter)
  VALUES (v_uid, trim(p_name), COALESCE(p_filter, '{}'::jsonb))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.kanban_save_filter(TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kanban_save_filter(TEXT, JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.kanban_delete_saved_filter(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'kanban_delete_saved_filter: não autenticado';
  END IF;
  DELETE FROM public.kanban_saved_filters WHERE id = p_id AND user_id = v_uid;
END;
$$;

REVOKE ALL ON FUNCTION public.kanban_delete_saved_filter(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kanban_delete_saved_filter(UUID) TO authenticated;

COMMIT;
