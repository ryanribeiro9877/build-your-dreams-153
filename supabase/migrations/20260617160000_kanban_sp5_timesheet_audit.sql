-- ============================================================================
-- KANBAN SP5 — Timesheet (apontamento de horas) + Auditoria por tarefa
-- ============================================================================
-- Blocos adiados do SP4, agora incluídos. Depende de kanban_can_edit_task (SP3).
-- Idempotente / transacional. RPCs SECURITY DEFINER, search_path fixo, gate.
-- ============================================================================

BEGIN;

-- ─── Timesheet ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.task_time_entries (
  id           UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_task_id UUID NOT NULL REFERENCES public.user_tasks(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  minutes      INTEGER NOT NULL CHECK (minutes > 0 AND minutes <= 100000),
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS task_time_entries_task_idx ON public.task_time_entries (user_task_id, created_at);

ALTER TABLE public.task_time_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "task_time_entries read" ON public.task_time_entries;
CREATE POLICY "task_time_entries read" ON public.task_time_entries FOR SELECT TO authenticated
  USING (public.kanban_can_edit_task(user_task_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.get_task_time_entries(p_task_id UUID)
RETURNS TABLE (id UUID, user_id UUID, user_name TEXT, minutes INTEGER, note TEXT, created_at TIMESTAMPTZ, total_minutes BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'get_task_time_entries: não autenticado'; END IF;
  IF NOT public.kanban_can_edit_task(p_task_id, v_uid) THEN
    RAISE EXCEPTION 'get_task_time_entries: sem acesso a esta tarefa';
  END IF;
  RETURN QUERY
    SELECT e.id, e.user_id, COALESCE(p.full_name, p.display_name, '—'), e.minutes, e.note, e.created_at,
           sum(e.minutes) OVER ()
    FROM public.task_time_entries e
    LEFT JOIN public.profiles p ON p.user_id = e.user_id
    WHERE e.user_task_id = p_task_id
    ORDER BY e.created_at DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.get_task_time_entries(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_task_time_entries(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.kanban_add_time_entry(p_task_id UUID, p_minutes INTEGER, p_note TEXT)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid UUID; v_id UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'kanban_add_time_entry: não autenticado'; END IF;
  IF NOT public.kanban_can_edit_task(p_task_id, v_uid) THEN
    RAISE EXCEPTION 'kanban_add_time_entry: sem acesso a esta tarefa';
  END IF;
  IF p_minutes IS NULL OR p_minutes <= 0 THEN RAISE EXCEPTION 'kanban_add_time_entry: minutos inválidos'; END IF;
  INSERT INTO public.task_time_entries (user_task_id, user_id, minutes, note)
  VALUES (p_task_id, v_uid, p_minutes, NULLIF(btrim(COALESCE(p_note, '')), ''))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.kanban_add_time_entry(UUID, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kanban_add_time_entry(UUID, INTEGER, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.kanban_delete_time_entry(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid UUID; v_task UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'kanban_delete_time_entry: não autenticado'; END IF;
  SELECT user_task_id INTO v_task FROM public.task_time_entries WHERE id = p_id;
  IF v_task IS NULL THEN RETURN; END IF;
  IF NOT public.kanban_can_edit_task(v_task, v_uid) THEN
    RAISE EXCEPTION 'kanban_delete_time_entry: sem acesso a esta tarefa';
  END IF;
  DELETE FROM public.task_time_entries WHERE id = p_id;
END;
$$;
REVOKE ALL ON FUNCTION public.kanban_delete_time_entry(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kanban_delete_time_entry(UUID) TO authenticated;

-- ─── Auditoria por tarefa ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.task_audit_log (
  id             UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_task_id   UUID NOT NULL REFERENCES public.user_tasks(id) ON DELETE CASCADE,
  actor_user_id  UUID,
  field          TEXT NOT NULL,
  old_value      TEXT,
  new_value      TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS task_audit_log_task_idx ON public.task_audit_log (user_task_id, created_at DESC);

ALTER TABLE public.task_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "task_audit_log read" ON public.task_audit_log;
CREATE POLICY "task_audit_log read" ON public.task_audit_log FOR SELECT TO authenticated
  USING (public.kanban_can_edit_task(user_task_id, auth.uid()));

-- Trigger: registra mudanças de campos relevantes de user_tasks.
CREATE OR REPLACE FUNCTION public.kanban_audit_user_task()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_actor UUID := auth.uid();
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.task_audit_log (user_task_id, actor_user_id, field, old_value, new_value)
    VALUES (NEW.id, v_actor, 'status', OLD.status::text, NEW.status::text);
  END IF;
  IF NEW.situacao IS DISTINCT FROM OLD.situacao THEN
    INSERT INTO public.task_audit_log (user_task_id, actor_user_id, field, old_value, new_value)
    VALUES (NEW.id, v_actor, 'situacao', OLD.situacao::text, NEW.situacao::text);
  END IF;
  IF NEW.assignee_user_id IS DISTINCT FROM OLD.assignee_user_id THEN
    INSERT INTO public.task_audit_log (user_task_id, actor_user_id, field, old_value, new_value)
    VALUES (NEW.id, v_actor, 'assignee_user_id', OLD.assignee_user_id::text, NEW.assignee_user_id::text);
  END IF;
  IF NEW.deadline_at IS DISTINCT FROM OLD.deadline_at THEN
    INSERT INTO public.task_audit_log (user_task_id, actor_user_id, field, old_value, new_value)
    VALUES (NEW.id, v_actor, 'deadline_at', OLD.deadline_at::text, NEW.deadline_at::text);
  END IF;
  IF NEW.priority IS DISTINCT FROM OLD.priority THEN
    INSERT INTO public.task_audit_log (user_task_id, actor_user_id, field, old_value, new_value)
    VALUES (NEW.id, v_actor, 'priority', OLD.priority::text, NEW.priority::text);
  END IF;
  IF NEW.title IS DISTINCT FROM OLD.title THEN
    INSERT INTO public.task_audit_log (user_task_id, actor_user_id, field, old_value, new_value)
    VALUES (NEW.id, v_actor, 'title', OLD.title, NEW.title);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_tasks_audit ON public.user_tasks;
CREATE TRIGGER trg_user_tasks_audit
  AFTER UPDATE ON public.user_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.kanban_audit_user_task();

CREATE OR REPLACE FUNCTION public.get_task_audit(p_task_id UUID)
RETURNS TABLE (id UUID, actor_user_id UUID, actor_name TEXT, field TEXT, old_value TEXT, new_value TEXT, created_at TIMESTAMPTZ)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'get_task_audit: não autenticado'; END IF;
  IF NOT public.kanban_can_edit_task(p_task_id, v_uid) THEN
    RAISE EXCEPTION 'get_task_audit: sem acesso a esta tarefa';
  END IF;
  RETURN QUERY
    SELECT a.id, a.actor_user_id, COALESCE(p.full_name, p.display_name, 'Sistema'),
           a.field, a.old_value, a.new_value, a.created_at
    FROM public.task_audit_log a
    LEFT JOIN public.profiles p ON p.user_id = a.actor_user_id
    WHERE a.user_task_id = p_task_id
    ORDER BY a.created_at DESC
    LIMIT 200;
END;
$$;
REVOKE ALL ON FUNCTION public.get_task_audit(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_task_audit(UUID) TO authenticated;

COMMIT;
