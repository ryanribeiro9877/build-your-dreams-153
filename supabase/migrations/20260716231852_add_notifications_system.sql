-- Sistema de notificações in-app (sino real-time).
-- Espelho da migração aplicada via MCP (apply_migration) — versão 20260716231852.
--
-- Tabela + RLS (select own) + Realtime (publicação supabase_realtime, REPLICA
-- IDENTITY FULL) + helper de criação (SECURITY DEFINER) + trigger de atribuição
-- de tarefa (notifica o novo responsável, ignorando auto-atribuição e re-set do
-- mesmo) + RPCs de leitura/marcação escopadas a auth.uid().
--
-- Frontend: src/lib/notifications.ts, src/hooks/useNotifications.ts,
-- src/components/NotificationBell.tsx (montado em JurisTopBar).
--
-- OBS: o REVOKE de create_notification em relação a `authenticated` está na
-- migração seguinte (20260716232111): este projeto tem ALTER DEFAULT PRIVILEGES
-- concedendo EXECUTE a `authenticated` em toda função nova, então o REVOKE
-- FROM PUBLIC, anon abaixo NÃO basta para deixar create_notification só para
-- service_role.

-- Tabela
CREATE TABLE public.notifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL,              -- destinatário (auth.users.id)
  type          text NOT NULL,              -- 'task_assigned', ...
  title         text NOT NULL,
  body          text,
  entity_type   text,                       -- 'user_task', 'process', ...
  entity_id     uuid,
  actor_user_id uuid,                        -- quem causou
  route         text,                        -- deep-link opcional, ex. '/kanban'
  read_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user_created ON public.notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_user_unread  ON public.notifications(user_id) WHERE read_at IS NULL;

-- RLS: cada um vê só as suas; sem insert/update/delete direto (sistema insere via definer; leitura via RPC)
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY notifications_select_own ON public.notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());
GRANT SELECT ON public.notifications TO authenticated;

-- Realtime: publica a tabela e mantém o registro completo p/ filtragem RLS em eventos
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Helper de criação (sistema/triggers)
CREATE OR REPLACE FUNCTION public.create_notification(
  p_user_id uuid, p_type text, p_title text,
  p_body text DEFAULT NULL, p_entity_type text DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL, p_actor_user_id uuid DEFAULT NULL, p_route text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $cn$
declare v_id uuid;
begin
  if p_user_id is null or coalesce(btrim(p_title),'')='' then return null; end if;
  insert into public.notifications(user_id,type,title,body,entity_type,entity_id,actor_user_id,route)
  values (p_user_id,p_type,p_title,p_body,p_entity_type,p_entity_id,p_actor_user_id,p_route)
  returning id into v_id;
  return v_id;
end;$cn$;
REVOKE ALL ON FUNCTION public.create_notification(uuid,text,text,text,text,uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_notification(uuid,text,text,text,text,uuid,uuid,text) TO service_role;

-- Gatilho: atribuição de tarefa -> notifica o novo responsável (não notifica auto-atribuição nem re-set do mesmo)
CREATE OR REPLACE FUNCTION public.trg_notify_task_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $tg$
declare
  v_actor uuid := coalesce(auth.uid(), NEW.assigner_user_id);
  v_actor_nome text;
begin
  if NEW.assignee_user_id is null then return NEW; end if;
  if TG_OP='UPDATE' and NEW.assignee_user_id is not distinct from OLD.assignee_user_id then return NEW; end if;
  if NEW.assignee_user_id = v_actor then return NEW; end if;
  select coalesce(nullif(btrim(pr.full_name),''), pr.display_name, 'alguém')
    into v_actor_nome from public.profiles pr where pr.user_id = v_actor;
  perform public.create_notification(
    NEW.assignee_user_id, 'task_assigned', 'Nova tarefa atribuída',
    coalesce(NEW.title,'Tarefa') || ' — por ' || coalesce(v_actor_nome,'alguém'),
    'user_task', NEW.id, v_actor, '/kanban');
  return NEW;
end;$tg$;
CREATE TRIGGER trg_notify_task_assignment
  AFTER INSERT OR UPDATE OF assignee_user_id ON public.user_tasks
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_task_assignment();

-- RPCs de leitura/marcação (usuário mexe só nas próprias)
CREATE OR REPLACE FUNCTION public.mark_notification_read(p_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO '' AS $$
  UPDATE public.notifications SET read_at=now()
   WHERE id=p_id AND user_id=auth.uid() AND read_at IS NULL;
$$;
CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
declare n int; begin
  UPDATE public.notifications SET read_at=now() WHERE user_id=auth.uid() AND read_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT; RETURN n;
end;$$;
CREATE OR REPLACE FUNCTION public.get_unread_notifications_count()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT count(*)::int FROM public.notifications WHERE user_id=auth.uid() AND read_at IS NULL;
$$;
REVOKE ALL ON FUNCTION public.mark_notification_read(uuid)        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_all_notifications_read()       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_unread_notifications_count()    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_notification_read(uuid)     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read()    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_unread_notifications_count() TO authenticated, service_role;
