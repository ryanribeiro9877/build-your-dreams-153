-- ============================================================================
-- PACOTE A — Conformidade de dados: coluna is_test + backfill + triggers de
-- automarcacao + filtro nas dashboards operacional/prazos + audit de INSERT.
-- Somente aditivo (exceto DROP+CREATE das 2 dashboards p/ trocar assinatura por
-- p_include_test com default false, preservando a chamada sem args do front).
-- Aplicada em producao via MCP em 2026-07-16; versionada aqui p/ repo<->banco.
--
-- Regra: dado marcado como is_test e' excluido dos numeros por padrao; herança
-- (processo/tarefa/doc de cliente de teste = teste). Triggers so MARCAM, nunca
-- desmarcam. Backfill one-shot usa padroes amplos (%DEMO%/%teste%) pq o estoque
-- e' pequeno e conhecido; os triggers continuos sao conservadores ([TESTE]+heranca).
-- ============================================================================

-- A1) Coluna is_test (aditivo)
ALTER TABLE public.clients          ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
ALTER TABLE public.processes        ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
ALTER TABLE public.user_tasks       ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
ALTER TABLE public.audiencias       ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
ALTER TABLE public.client_documents ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

-- A2) Backfill one-shot (ordem importa: clients -> processes -> derivados).
UPDATE public.clients SET is_test = true WHERE full_name ILIKE '%[TESTE]%';

UPDATE public.processes SET is_test = true
 WHERE coalesce(process_number,'') ILIKE '%[TESTE]%'
    OR coalesce(description,'')    ILIKE '%[TESTE]%'
    OR coalesce(client_name,'')    ILIKE '%[TESTE]%'
    OR client_id IN (SELECT id FROM public.clients WHERE is_test);

UPDATE public.user_tasks SET is_test = true
 WHERE coalesce(title,'') ILIKE '%[TESTE]%' OR coalesce(title,'') ILIKE '%DEMO%'
    OR coalesce(title,'') ILIKE '%teste%'
    OR client_id  IN (SELECT id FROM public.clients   WHERE is_test)
    OR process_id IN (SELECT id FROM public.processes WHERE is_test);

UPDATE public.audiencias SET is_test = true
 WHERE coalesce(client_name,'') ILIKE '%[TESTE]%' OR coalesce(observacoes,'') ILIKE '%teste%'
    OR client_id  IN (SELECT id FROM public.clients   WHERE is_test)
    OR process_id IN (SELECT id FROM public.processes WHERE is_test);

UPDATE public.client_documents SET is_test = true
 WHERE coalesce(file_path,'') ILIKE '%teste%' OR coalesce(notes,'') ILIKE '%[TESTE]%'
    OR client_id IN (SELECT id FROM public.clients WHERE is_test);

-- A3) Triggers de automarcacao (BEFORE INSERT/UPDATE). So marca; nunca desmarca.
CREATE OR REPLACE FUNCTION public.trg_mark_is_test_clients()
RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $t$
begin
  NEW.is_test := NEW.is_test OR coalesce(NEW.full_name,'') ILIKE '%[TESTE]%';
  return NEW;
end;$t$;
DROP TRIGGER IF EXISTS trg_mark_is_test ON public.clients;
CREATE TRIGGER trg_mark_is_test BEFORE INSERT OR UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.trg_mark_is_test_clients();

CREATE OR REPLACE FUNCTION public.trg_mark_is_test_processes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $t$
begin
  NEW.is_test := NEW.is_test
    OR coalesce(NEW.process_number,'') ILIKE '%[TESTE]%'
    OR coalesce(NEW.description,'')    ILIKE '%[TESTE]%'
    OR coalesce(NEW.client_name,'')    ILIKE '%[TESTE]%'
    OR exists (select 1 from public.clients c where c.id = NEW.client_id and c.is_test);
  return NEW;
end;$t$;
DROP TRIGGER IF EXISTS trg_mark_is_test ON public.processes;
CREATE TRIGGER trg_mark_is_test BEFORE INSERT OR UPDATE ON public.processes
  FOR EACH ROW EXECUTE FUNCTION public.trg_mark_is_test_processes();

CREATE OR REPLACE FUNCTION public.trg_mark_is_test_user_tasks()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $t$
begin
  NEW.is_test := NEW.is_test
    OR coalesce(NEW.title,'') ILIKE '%[TESTE]%'
    OR exists (select 1 from public.clients   c where c.id = NEW.client_id  and c.is_test)
    OR exists (select 1 from public.processes p where p.id = NEW.process_id and p.is_test);
  return NEW;
end;$t$;
DROP TRIGGER IF EXISTS trg_mark_is_test ON public.user_tasks;
CREATE TRIGGER trg_mark_is_test BEFORE INSERT OR UPDATE ON public.user_tasks
  FOR EACH ROW EXECUTE FUNCTION public.trg_mark_is_test_user_tasks();

CREATE OR REPLACE FUNCTION public.trg_mark_is_test_audiencias()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $t$
begin
  NEW.is_test := NEW.is_test
    OR coalesce(NEW.client_name,'') ILIKE '%[TESTE]%'
    OR exists (select 1 from public.clients   c where c.id = NEW.client_id  and c.is_test)
    OR exists (select 1 from public.processes p where p.id = NEW.process_id and p.is_test);
  return NEW;
end;$t$;
DROP TRIGGER IF EXISTS trg_mark_is_test ON public.audiencias;
CREATE TRIGGER trg_mark_is_test BEFORE INSERT OR UPDATE ON public.audiencias
  FOR EACH ROW EXECUTE FUNCTION public.trg_mark_is_test_audiencias();

CREATE OR REPLACE FUNCTION public.trg_mark_is_test_client_documents()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $t$
begin
  NEW.is_test := NEW.is_test
    OR coalesce(NEW.notes,'') ILIKE '%[TESTE]%'
    OR exists (select 1 from public.clients c where c.id = NEW.client_id and c.is_test);
  return NEW;
end;$t$;
DROP TRIGGER IF EXISTS trg_mark_is_test ON public.client_documents;
CREATE TRIGGER trg_mark_is_test BEFORE INSERT OR UPDATE ON public.client_documents
  FOR EACH ROW EXECUTE FUNCTION public.trg_mark_is_test_client_documents();

-- A4) Filtro nas dashboards. Troca assinatura ()->(p_include_test boolean default
-- false): DROP da zero-arg + CREATE da nova. Front chama sem args -> default false.
DROP FUNCTION IF EXISTS public.dashboard_operacional_metrics();
CREATE FUNCTION public.dashboard_operacional_metrics(p_include_test boolean default false)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare
  result jsonb;
  d_min date;
  d_max date;
begin
  if not exists (
    select 1 from public.profiles p
      join public.role_templates rt on rt.id = p.role_template_id
     where p.user_id = auth.uid() and rt.code in ('tech','socio')
  ) then
    raise exception 'Acesso negado: dashboard restrito a tech e socio' using errcode = '42501';
  end if;

  select current_date - 29, current_date into d_min, d_max;

  select
    jsonb_build_object('kpis', jsonb_build_object(
        'clients_total',   (select count(*) from public.clients where (p_include_test or not is_test)),
        'processes_total', (select count(*) from public.processes where (p_include_test or not is_test)),
        'docs_total',      (select count(*) from public.client_documents where (p_include_test or not is_test)),
        'tasks_total',     (select count(*) from public.user_tasks where (p_include_test or not is_test)),
        'tasks_active',    (select count(*) from public.user_tasks where status not in ('completed','cancelled') and (p_include_test or not is_test)),
        'pendencias_open', (select count(*) from public.user_tasks where is_pendencia and status not in ('completed','cancelled') and (p_include_test or not is_test))
      ))
    || jsonb_build_object('clients_by_origin',
        (select coalesce(jsonb_agg(jsonb_build_object('key', coalesce(client_origin,'_none'), 'n', n) order by n desc), '[]'::jsonb)
           from (select client_origin, count(*) n from public.clients where (p_include_test or not is_test) group by client_origin) s))
    || jsonb_build_object('clients_by_status',
        (select coalesce(jsonb_agg(jsonb_build_object('key', coalesce(status,'_none'), 'n', n) order by n desc), '[]'::jsonb)
           from (select status, count(*) n from public.clients where (p_include_test or not is_test) group by status) s))
    || jsonb_build_object('docs_by_type',
        (select coalesce(jsonb_agg(jsonb_build_object('key', coalesce(document_type,'_none'), 'n', n) order by n desc), '[]'::jsonb)
           from (select document_type, count(*) n from public.client_documents where (p_include_test or not is_test) group by document_type) s))
    || jsonb_build_object('tasks_by_status',
        (select coalesce(jsonb_agg(jsonb_build_object('key', status::text, 'n', n) order by n desc), '[]'::jsonb)
           from (select status, count(*) n from public.user_tasks where (p_include_test or not is_test) group by status) s))
    || jsonb_build_object('tasks_by_priority',
        (select coalesce(jsonb_agg(jsonb_build_object('key', priority::text, 'n', n) order by n desc), '[]'::jsonb)
           from (select priority, count(*) n from public.user_tasks where (p_include_test or not is_test) group by priority) s))
    || jsonb_build_object('processes_by_status',
        (select coalesce(jsonb_agg(jsonb_build_object('key', coalesce(status,'_none'), 'n', n) order by n desc), '[]'::jsonb)
           from (select status, count(*) n from public.processes where (p_include_test or not is_test) group by status) s))
    || jsonb_build_object('new_clients_daily',
        (select coalesce(jsonb_agg(jsonb_build_object('date', g::date,
             'n', (select count(*) from public.clients c where c.created_at::date = g::date and (p_include_test or not c.is_test))) order by g), '[]'::jsonb)
           from generate_series(d_min, d_max, interval '1 day') g))
    into result;
  return result;
end;
$$;
revoke all on function public.dashboard_operacional_metrics(boolean) from public;
revoke all on function public.dashboard_operacional_metrics(boolean) from anon;
grant execute on function public.dashboard_operacional_metrics(boolean) to authenticated;

DROP FUNCTION IF EXISTS public.dashboard_prazos_metrics();
CREATE FUNCTION public.dashboard_prazos_metrics(p_include_test boolean default false)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare
  result jsonb;
begin
  if not exists (
    select 1 from public.profiles p
      join public.role_templates rt on rt.id = p.role_template_id
     where p.user_id = auth.uid() and rt.code in ('tech','socio')
  ) then
    raise exception 'Acesso negado: dashboard restrito a tech e socio' using errcode = '42501';
  end if;

  select
    jsonb_build_object('kpis', jsonb_build_object(
        'prazos_vencidos', (select count(*) from public.user_tasks
             where status not in ('completed','cancelled') and coalesce(data_fatal, deadline_at::date) < current_date and (p_include_test or not is_test)),
        'prazos_7d', (select count(*) from public.user_tasks
             where status not in ('completed','cancelled') and coalesce(data_fatal, deadline_at::date) between current_date and current_date + 7 and (p_include_test or not is_test)),
        'prazos_30d', (select count(*) from public.user_tasks
             where status not in ('completed','cancelled') and coalesce(data_fatal, deadline_at::date) between current_date and current_date + 30 and (p_include_test or not is_test)),
        'audiencias_futuras', (select count(*) from public.audiencias
             where data_hora >= now() and status not in ('cancelada','realizada') and (p_include_test or not is_test)),
        'proc_hearings', (select count(*) from public.processes where next_hearing_date >= now() and (p_include_test or not is_test)),
        'cards_criticos', (select count(*) from public.kanban_card_criticidade k
             where vence_em is not null and vence_em < now() + interval '3 day'
               and (p_include_test or not exists (select 1 from public.user_tasks ut where ut.id = k.user_task_id and ut.is_test)))
      ))
    || jsonb_build_object('deadline_buckets',
        (select coalesce(jsonb_agg(jsonb_build_object('key', bucket, 'n', n) order by ord), '[]'::jsonb)
           from (
             select bucket, ord, count(*) n from (
               select case
                   when dl < current_date          then 'Vencido'
                   when dl <= current_date + 3      then 'Até 3 dias'
                   when dl <= current_date + 7      then 'Até 7 dias'
                   when dl <= current_date + 30     then 'Até 30 dias'
                   else '> 30 dias' end bucket,
                 case
                   when dl < current_date          then 0
                   when dl <= current_date + 3      then 1
                   when dl <= current_date + 7      then 2
                   when dl <= current_date + 30     then 3
                   else 4 end ord
               from (select coalesce(data_fatal, deadline_at::date) dl
                       from public.user_tasks
                      where status not in ('completed','cancelled')
                        and coalesce(data_fatal, deadline_at::date) is not null
                        and (p_include_test or not is_test)) t
             ) a group by bucket, ord) b))
    || jsonb_build_object('audiencias_by_status',
        (select coalesce(jsonb_agg(jsonb_build_object('key', status::text, 'n', n) order by n desc), '[]'::jsonb)
           from (select status, count(*) n from public.audiencias where (p_include_test or not is_test) group by status) s))
    || jsonb_build_object('criticidade_by_estado',
        (select coalesce(jsonb_agg(jsonb_build_object('key', coalesce(estado,'_none'), 'n', n) order by n desc), '[]'::jsonb)
           from (select k.estado, count(*) n from public.kanban_card_criticidade k
                  where (p_include_test or not exists (select 1 from public.user_tasks ut where ut.id = k.user_task_id and ut.is_test))
                  group by k.estado) s))
    || jsonb_build_object('proximas_audiencias',
        (select coalesce(jsonb_agg(jsonb_build_object(
             'when', data_hora, 'client', client_name, 'tipo', tipo_acao, 'advogado', advogado_nome, 'status', status::text) order by data_hora), '[]'::jsonb)
           from (select data_hora, client_name, tipo_acao, advogado_nome, status
                   from public.audiencias
                  where data_hora >= now() and status not in ('cancelada','realizada') and (p_include_test or not is_test)
                  order by data_hora limit 10) a))
    into result;
  return result;
end;
$$;
revoke all on function public.dashboard_prazos_metrics(boolean) from public;
revoke all on function public.dashboard_prazos_metrics(boolean) from anon;
grant execute on function public.dashboard_prazos_metrics(boolean) to authenticated;

-- A5) Auditoria de INSERT em user_tasks (o trg_user_tasks_audit existente e UPDATE-only)
CREATE OR REPLACE FUNCTION public.kanban_audit_user_task_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $t$
begin
  INSERT INTO public.task_audit_log (user_task_id, actor_user_id, field, old_value, new_value)
  VALUES (NEW.id, coalesce(auth.uid(), NEW.assigner_user_id), 'created', NULL, NEW.status::text);
  return NEW;
end;$t$;
DROP TRIGGER IF EXISTS trg_user_tasks_audit_insert ON public.user_tasks;
CREATE TRIGGER trg_user_tasks_audit_insert AFTER INSERT ON public.user_tasks
  FOR EACH ROW EXECUTE FUNCTION public.kanban_audit_user_task_insert();
