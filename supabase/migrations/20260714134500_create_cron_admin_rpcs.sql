-- Crons · Técnico — RPCs de administração do agendador real do Postgres (pg_cron).
--
-- ESPELHO: já aplicado em produção via MCP e validado. Este arquivo existe só
-- para versionar o schema no repo — NÃO reexecutar manualmente.
--
-- Motivo: a página lia a tabela de aplicação `public.cron_jobs` (vazia). A
-- fonte de verdade do agendamento é o schema `cron` (cron.job /
-- cron.job_run_details), inalcançável pelo PostgREST/RLS do front. Estas 4
-- funções SECURITY DEFINER expõem esse schema de forma controlada, com gate de
-- papel `tech` idêntico ao gate da página no cliente.

-- Lista os jobs reais com o último run/status (join lateral com job_run_details).
CREATE OR REPLACE FUNCTION public.admin_cron_list()
 RETURNS TABLE(jobid bigint, jobname text, schedule text, command text, active boolean, last_run timestamp with time zone, last_status text, last_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'tech'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden: requires tech role' USING errcode = '42501';
  END IF;
  RETURN QUERY
  SELECT j.jobid, j.jobname, j.schedule, j.command, j.active,
         d.start_time, d.status, d.return_message
  FROM cron.job j
  LEFT JOIN LATERAL (
    SELECT r.start_time, r.status, r.return_message
    FROM cron.job_run_details r
    WHERE r.jobid = j.jobid
    ORDER BY r.start_time DESC NULLS LAST
    LIMIT 1
  ) d ON true
  ORDER BY j.jobid;
END;
$function$;

-- Ativa/desativa um job (cron.alter_job).
CREATE OR REPLACE FUNCTION public.admin_cron_toggle(p_jobid bigint, p_active boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'tech'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden: requires tech role' USING errcode = '42501';
  END IF;
  PERFORM cron.alter_job(job_id := p_jobid, active := p_active);
END;
$function$;

-- Remove um job (cron.unschedule).
CREATE OR REPLACE FUNCTION public.admin_cron_delete(p_jobid bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE ok boolean;
BEGIN
  IF NOT public.has_role(auth.uid(), 'tech'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden: requires tech role' USING errcode = '42501';
  END IF;
  SELECT cron.unschedule(job_id := p_jobid) INTO ok;
  RETURN ok;
END;
$function$;

-- Cria um job (cron.schedule). Aceita SQL livre — natureza do pg_cron; tech-only.
CREATE OR REPLACE FUNCTION public.admin_cron_create(p_name text, p_schedule text, p_command text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE new_id bigint;
BEGIN
  IF NOT public.has_role(auth.uid(), 'tech'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden: requires tech role' USING errcode = '42501';
  END IF;
  IF coalesce(btrim(p_name), '') = '' OR coalesce(btrim(p_schedule), '') = '' OR coalesce(btrim(p_command), '') = '' THEN
    RAISE EXCEPTION 'nome, agenda e comando são obrigatórios';
  END IF;
  SELECT cron.schedule(job_name := p_name, schedule := p_schedule, command := p_command) INTO new_id;
  RETURN new_id;
END;
$function$;
