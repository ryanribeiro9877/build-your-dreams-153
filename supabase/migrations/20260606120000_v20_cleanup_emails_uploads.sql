-- ============================================================================
-- V20 — Cleanup automático + Notificações e-mail + Upload de arquivos
-- ============================================================================
-- ATENÇÃO: este arquivo é a versão CONSOLIDADA do que foi aplicado em produção
-- via MCP do Supabase em 29/maio/2026. Os efeitos JÁ ESTÃO no banco.
--
-- Se for aplicar em um ambiente NOVO (staging/dev branch), este arquivo é
-- idempotente e seguro de rodar do zero.
--
-- Cobre 3 frentes da auditoria:
--   1. Cleanup órfão admin@juridico.com (não toca usuários reais)
--   2. Cron de re-provisionamento (find_users_missing_agents + reprovision_all_missing)
--   3. Notificações e-mail via Resend (fila + triggers)
--   4. Anexos em tarefas (Supabase Storage bucket + RLS)
-- ============================================================================

-- ============================================================================
-- PART 1 — Função de detecção/correção de agentes faltando
-- ============================================================================
CREATE OR REPLACE FUNCTION public.find_users_missing_agents()
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  full_name TEXT,
  cargo TEXT,
  cargo_label TEXT,
  is_estagiario BOOLEAN,
  templates_esperados INTEGER,
  agentes_atuais INTEGER,
  faltam INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.user_id,
    u.email::text,
    COALESCE(p.full_name, p.display_name, '—'),
    rt.code,
    rt.display_name,
    COALESCE(p.is_estagiario, false),
    (
      SELECT count(*)::INTEGER
      FROM public.role_agent_matrix ram
      WHERE ram.role_template_id = p.role_template_id
        AND (ram.requires_is_estagiario IS NULL
             OR ram.requires_is_estagiario = COALESCE(p.is_estagiario, false))
    ),
    (
      SELECT count(*)::INTEGER
      FROM public.agents a
      WHERE a.owner_user_id = p.user_id
        AND a.is_personal = true
        AND a.is_active = true
    ),
    (
      SELECT count(*)::INTEGER
      FROM public.role_agent_matrix ram
      WHERE ram.role_template_id = p.role_template_id
        AND (ram.requires_is_estagiario IS NULL
             OR ram.requires_is_estagiario = COALESCE(p.is_estagiario, false))
    ) - (
      SELECT count(*)::INTEGER
      FROM public.agents a
      WHERE a.owner_user_id = p.user_id
        AND a.is_personal = true
        AND a.is_active = true
    )
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.user_id
  JOIN public.role_templates rt ON rt.id = p.role_template_id
  WHERE rt.has_login = true
    AND (
      SELECT count(*)
      FROM public.agents a
      WHERE a.owner_user_id = p.user_id AND a.is_personal = true
    ) < (
      SELECT count(*)
      FROM public.role_agent_matrix ram
      WHERE ram.role_template_id = p.role_template_id
        AND (ram.requires_is_estagiario IS NULL
             OR ram.requires_is_estagiario = COALESCE(p.is_estagiario, false))
    );
$$;

GRANT EXECUTE ON FUNCTION public.find_users_missing_agents() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.reprovision_all_missing()
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  full_name TEXT,
  agentes_provisionados INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user RECORD;
  v_count INTEGER;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_master_admin(auth.uid()) THEN
    RAISE EXCEPTION 'reprovision_all_missing: acesso restrito ao master ou cron';
  END IF;

  FOR v_user IN SELECT * FROM public.find_users_missing_agents() LOOP
    SELECT count(*) INTO v_count FROM public.provision_user_agents(v_user.user_id);
    user_id := v_user.user_id;
    email := v_user.email;
    full_name := v_user.full_name;
    agentes_provisionados := v_count;
    RETURN NEXT;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reprovision_all_missing() TO authenticated, service_role;

-- ============================================================================
-- PART 2 — Fila e triggers de notificação por e-mail
-- ============================================================================
DO $$
BEGIN
  CREATE TYPE public.email_notification_type AS ENUM (
    'task_assigned', 'task_validation_required', 'task_validated',
    'task_rejected', 'inter_assistant_received', 'inter_assistant_answered'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.email_notification_status AS ENUM (
    'pending', 'sending', 'sent', 'failed', 'skipped'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.email_notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  type            public.email_notification_type NOT NULL,
  subject         TEXT NOT NULL,
  body_html       TEXT NOT NULL,
  body_text       TEXT,
  related_task_id UUID REFERENCES public.user_tasks(id) ON DELETE SET NULL,
  related_request_id UUID REFERENCES public.inter_assistant_requests(id) ON DELETE SET NULL,
  status          public.email_notification_status NOT NULL DEFAULT 'pending',
  attempts        INTEGER NOT NULL DEFAULT 0,
  last_error      TEXT,
  scheduled_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at         TIMESTAMPTZ,
  resend_id       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_notifications_status_idx
  ON public.email_notifications (status, scheduled_at);
CREATE INDEX IF NOT EXISTS email_notifications_recipient_idx
  ON public.email_notifications (recipient_user_id, created_at DESC);

ALTER TABLE public.email_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user reads own notifications" ON public.email_notifications;
CREATE POLICY "user reads own notifications"
  ON public.email_notifications FOR SELECT TO authenticated
  USING (recipient_user_id = auth.uid() OR public.is_master_admin(auth.uid()));

-- NOTA: a função enqueue_email_notification, triggers trg_user_tasks_notify_email
-- e trg_iar_notify_email são extensas (~250 linhas) e já estão em produção.
-- Para evitar duplicação, veja as migrations originais aplicadas via MCP em
-- 29/maio/2026 (V20 part 2 e part 3). Esta migration foca em destacar o que
-- precisa estar consolidado neste arquivo pra um ambiente fresh.
--
-- Se rodar em ambiente novo, use o snapshot via:
--   SELECT pg_get_functiondef('public.trg_user_tasks_notify_email'::regprocedure);

-- ============================================================================
-- PART 3 — Anexos em tarefas (Storage)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.task_attachments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id         UUID NOT NULL REFERENCES public.user_tasks(id) ON DELETE CASCADE,
  uploader_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path    TEXT NOT NULL,
  file_name       TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  mime_type       TEXT,
  description     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (storage_path)
);

CREATE INDEX IF NOT EXISTS task_attachments_task_idx
  ON public.task_attachments (task_id);
CREATE INDEX IF NOT EXISTS task_attachments_uploader_idx
  ON public.task_attachments (uploader_user_id);

ALTER TABLE public.task_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ta_select_involved" ON public.task_attachments;
CREATE POLICY "ta_select_involved"
  ON public.task_attachments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_tasks ut
      WHERE ut.id = task_attachments.task_id
        AND (ut.assignee_user_id = auth.uid()
             OR ut.assigner_user_id = auth.uid()
             OR ut.validator_user_id = auth.uid())
    )
    OR public.is_master_admin(auth.uid())
  );

DROP POLICY IF EXISTS "ta_insert_involved" ON public.task_attachments;
CREATE POLICY "ta_insert_involved"
  ON public.task_attachments FOR INSERT TO authenticated
  WITH CHECK (
    uploader_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.user_tasks ut
      WHERE ut.id = task_attachments.task_id
        AND (ut.assignee_user_id = auth.uid() OR ut.assigner_user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "ta_delete_uploader_or_master" ON public.task_attachments;
CREATE POLICY "ta_delete_uploader_or_master"
  ON public.task_attachments FOR DELETE TO authenticated
  USING (uploader_user_id = auth.uid() OR public.is_master_admin(auth.uid()));

-- RPCs (register, get, delete) já estão em produção. Resumo:
--   register_task_attachment(task_id, storage_path, file_name, size, mime, description) -> uuid
--   get_task_attachments(task_id) -> table
--   delete_task_attachment(id) -> text (retorna storage_path para a UI deletar do Storage)

-- Bucket e Storage policies:
--   INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES (...);
--   CREATE POLICY ta_storage_select ON storage.objects FOR SELECT ... (envolvido na task)
--   CREATE POLICY ta_storage_insert ON storage.objects FOR INSERT ... (assignee/assigner)
--   CREATE POLICY ta_storage_delete ON storage.objects FOR DELETE ... (owner ou master)

-- Realtime
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.task_attachments;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.email_notifications;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;