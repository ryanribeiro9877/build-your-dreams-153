-- Trilha B 5.1 — Agenda de Reuniões: schema + histórico + RLS.
-- Aditivo e idempotente. NÃO usar db push. RLS 100%. Colunas em inglês.

BEGIN;

-- 1. Enum de status (inglês; rótulo PT-BR só na tela).
DO $$ BEGIN
  CREATE TYPE public.meeting_status AS ENUM
    ('scheduled','confirmed','rescheduled','canceled','no_show','done');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Tabela principal.
CREATE TABLE IF NOT EXISTS public.meetings (
  id                    UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id             UUID REFERENCES public.clients(id),
  client_name           TEXT,
  phone                 TEXT,
  scheduled_date        DATE NOT NULL,
  start_time            TIME NOT NULL,
  end_time              TIME,
  type                  TEXT,
  lawyer_user_id        UUID REFERENCES auth.users(id),
  receptionist_user_id  UUID REFERENCES auth.users(id),
  summary               TEXT,
  status                public.meeting_status NOT NULL DEFAULT 'scheduled',
  notes                 TEXT,
  -- Ganchos Trilha D (sem uso ainda):
  google_event_id       TEXT,
  google_calendar_id    TEXT,
  google_sync_status    TEXT,
  last_synced_at        TIMESTAMPTZ,
  created_by            UUID REFERENCES auth.users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS meetings_date_time_idx ON public.meetings (scheduled_date, start_time);
CREATE INDEX IF NOT EXISTS meetings_lawyer_idx    ON public.meetings (lawyer_user_id);
CREATE INDEX IF NOT EXISTS meetings_status_idx    ON public.meetings (status);
CREATE INDEX IF NOT EXISTS meetings_client_idx    ON public.meetings (client_id);

-- 3. Histórico (espelha task_audit_log).
CREATE TABLE IF NOT EXISTS public.meeting_audit_log (
  id             UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  meeting_id     UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  actor_user_id  UUID,
  field          TEXT NOT NULL,
  old_value      TEXT,
  new_value      TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS meeting_audit_log_meeting_idx ON public.meeting_audit_log (meeting_id, created_at DESC);

-- 4. Helper de acesso (recepção incl. estagiária + advogados + sócio + admin).
CREATE OR REPLACE FUNCTION public.meetings_can_access()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.role_templates rt ON rt.id = p.role_template_id
      WHERE p.user_id = auth.uid()
        AND (rt.code IN ('socio','lider_recepcao','recepcionista','estagiaria_recepcao')
             OR rt.code LIKE 'adv_%')
    )
    OR public.is_master_admin(auth.uid())
    OR public.has_role(auth.uid(), 'admin');
$$;
REVOKE ALL ON FUNCTION public.meetings_can_access() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.meetings_can_access() TO authenticated;

-- 5. RLS: leitura por papel; escrita só via RPC SECURITY DEFINER (sem policy de write).
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "meetings read" ON public.meetings;
CREATE POLICY "meetings read" ON public.meetings FOR SELECT TO authenticated
  USING (public.meetings_can_access());

ALTER TABLE public.meeting_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "meeting_audit_log read" ON public.meeting_audit_log;
CREATE POLICY "meeting_audit_log read" ON public.meeting_audit_log FOR SELECT TO authenticated
  USING (public.meetings_can_access());

-- 6. Trigger de histórico (grava campos-chave alterados).
CREATE OR REPLACE FUNCTION public.meeting_audit_row()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_actor UUID := auth.uid();
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.meeting_audit_log (meeting_id, actor_user_id, field, old_value, new_value)
    VALUES (NEW.id, v_actor, 'status', OLD.status::text, NEW.status::text);
  END IF;
  IF NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date THEN
    INSERT INTO public.meeting_audit_log (meeting_id, actor_user_id, field, old_value, new_value)
    VALUES (NEW.id, v_actor, 'scheduled_date', OLD.scheduled_date::text, NEW.scheduled_date::text);
  END IF;
  IF NEW.start_time IS DISTINCT FROM OLD.start_time THEN
    INSERT INTO public.meeting_audit_log (meeting_id, actor_user_id, field, old_value, new_value)
    VALUES (NEW.id, v_actor, 'start_time', OLD.start_time::text, NEW.start_time::text);
  END IF;
  IF NEW.lawyer_user_id IS DISTINCT FROM OLD.lawyer_user_id THEN
    INSERT INTO public.meeting_audit_log (meeting_id, actor_user_id, field, old_value, new_value)
    VALUES (NEW.id, v_actor, 'lawyer_user_id', OLD.lawyer_user_id::text, NEW.lawyer_user_id::text);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_meetings_audit ON public.meetings;
CREATE TRIGGER trg_meetings_audit
  AFTER UPDATE ON public.meetings
  FOR EACH ROW EXECUTE FUNCTION public.meeting_audit_row();

COMMIT;
