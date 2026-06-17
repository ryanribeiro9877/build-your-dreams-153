-- ============================================================================
-- KANBAN SP3 (parte 2) — Comentários da tarefa com @menção
-- ============================================================================
-- Comentários por user_task; @menção cria notificação no sino (bottleneck_
-- notifications) — feito via RPC SECURITY DEFINER (a RLS de insert do sino só
-- permite o próprio usuário; aqui notificamos OUTROS, daí o SECURITY DEFINER).
-- Depende de kanban_can_edit_task (migration de tags). Idempotente/transacional.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.user_task_comments (
  id                 UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_task_id       UUID NOT NULL REFERENCES public.user_tasks(id) ON DELETE CASCADE,
  author_user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body               TEXT NOT NULL,
  mentioned_user_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_task_comments_body_len CHECK (char_length(body) BETWEEN 1 AND 2000)
);
CREATE INDEX IF NOT EXISTS user_task_comments_task_idx ON public.user_task_comments (user_task_id, created_at);

ALTER TABLE public.user_task_comments ENABLE ROW LEVEL SECURITY;
-- Leitura por quem pode acessar a tarefa; escrita via RPC (SECURITY DEFINER).
DROP POLICY IF EXISTS "user_task_comments read" ON public.user_task_comments;
CREATE POLICY "user_task_comments read" ON public.user_task_comments FOR SELECT TO authenticated
  USING (public.kanban_can_edit_task(user_task_id, auth.uid()));

-- Lista de comentários de uma tarefa (com nome do autor).
CREATE OR REPLACE FUNCTION public.get_task_comments(p_task_id UUID)
RETURNS TABLE (
  id UUID, author_user_id UUID, author_name TEXT, body TEXT,
  mentioned_user_ids UUID[], created_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'get_task_comments: não autenticado'; END IF;
  IF NOT public.kanban_can_edit_task(p_task_id, v_uid) THEN
    RAISE EXCEPTION 'get_task_comments: sem acesso a esta tarefa';
  END IF;

  RETURN QUERY
    SELECT c.id, c.author_user_id, COALESCE(p.full_name, p.display_name, '—'),
           c.body, c.mentioned_user_ids, c.created_at
    FROM public.user_task_comments c
    LEFT JOIN public.profiles p ON p.user_id = c.author_user_id
    WHERE c.user_task_id = p_task_id
    ORDER BY c.created_at ASC;
END;
$$;
REVOKE ALL ON FUNCTION public.get_task_comments(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_task_comments(UUID) TO authenticated;

-- Adiciona um comentário e notifica os mencionados (no sino — bottleneck_notifications).
CREATE OR REPLACE FUNCTION public.kanban_add_comment(p_task_id UUID, p_body TEXT, p_mentioned UUID[])
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_id UUID;
  v_m UUID;
  v_author TEXT;
  v_task_title TEXT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'kanban_add_comment: não autenticado'; END IF;
  IF NOT public.kanban_can_edit_task(p_task_id, v_uid) THEN
    RAISE EXCEPTION 'kanban_add_comment: sem acesso a esta tarefa';
  END IF;
  IF p_body IS NULL OR char_length(btrim(p_body)) = 0 THEN
    RAISE EXCEPTION 'kanban_add_comment: comentário vazio';
  END IF;
  IF char_length(p_body) > 2000 THEN
    RAISE EXCEPTION 'kanban_add_comment: comentário excede 2000 caracteres';
  END IF;

  INSERT INTO public.user_task_comments (user_task_id, author_user_id, body, mentioned_user_ids)
  VALUES (p_task_id, v_uid, btrim(p_body), COALESCE(p_mentioned, ARRAY[]::UUID[]))
  RETURNING id INTO v_id;

  -- Notifica cada mencionado (exceto o próprio autor).
  IF p_mentioned IS NOT NULL THEN
    SELECT COALESCE(full_name, display_name, 'Alguém') INTO v_author FROM public.profiles WHERE user_id = v_uid;
    SELECT title INTO v_task_title FROM public.user_tasks WHERE id = p_task_id;
    FOREACH v_m IN ARRAY p_mentioned LOOP
      IF v_m IS NOT NULL AND v_m <> v_uid THEN
        INSERT INTO public.bottleneck_notifications (user_id, alert_type, message)
        VALUES (
          v_m, 'mention',
          COALESCE(v_author, 'Alguém') || ' mencionou você em um comentário' ||
          COALESCE(' na tarefa: ' || v_task_title, '') || '.'
        );
      END IF;
    END LOOP;
  END IF;

  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.kanban_add_comment(UUID, TEXT, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kanban_add_comment(UUID, TEXT, UUID[]) TO authenticated;

COMMIT;
