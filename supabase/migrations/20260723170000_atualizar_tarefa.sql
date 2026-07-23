-- ============================================================================
-- Onda 1.1 — atualizar_tarefa (mover/editar card do Kanban pelo chat)
-- ============================================================================
-- Gate idêntico ao do card (kanban_can_edit_task) — o chat nunca pode mais que a
-- tela. Campos nulos não mexem. Status/prioridade aceitam sinônimos pt-BR e são
-- mapeados aos enums (valor desconhecido = erro claro). Prazo não pode ser passado.
-- Retorna antes/depois para o ActionCard confirmar em linguagem humana.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.atualizar_tarefa(
  p_task_id    uuid,
  p_status     text DEFAULT NULL,
  p_prazo      timestamptz DEFAULT NULL,
  p_prioridade text DEFAULT NULL,
  p_titulo     text DEFAULT NULL
) RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
AS $function$
declare
  v_uid    uuid := auth.uid();
  v_before public.user_tasks%rowtype;
  v_after  public.user_tasks%rowtype;
  v_status public.user_task_status;
  v_prio   public.task_priority;
  v_s      text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  -- Mesmo gate do card (a Kailane pelo chat = a Kailane clicando).
  if not public.kanban_can_edit_task(p_task_id, v_uid) then
    raise exception 'sem acesso a este card' using errcode = '42501';
  end if;
  select * into v_before from public.user_tasks where id = p_task_id;
  if not found then
    raise exception 'tarefa não encontrada';
  end if;

  -- Status: sinônimos pt-BR (e os próprios labels) → enum user_task_status.
  if p_status is not null and btrim(p_status) <> '' then
    v_s := public.txt_fold(btrim(p_status));
    v_status := (case v_s
      when 'in_progress' then 'in_progress' when 'em andamento' then 'in_progress'
      when 'andamento' then 'in_progress' when 'em progresso' then 'in_progress'
      when 'iniciada' then 'in_progress' when 'fazendo' then 'in_progress'
      when 'completed' then 'completed' when 'concluida' then 'completed'
      when 'concluido' then 'completed' when 'finalizada' then 'completed'
      when 'feita' then 'completed' when 'pronta' then 'completed' when 'concluir' then 'completed'
      when 'blocked' then 'blocked' when 'bloqueada' then 'blocked'
      when 'bloqueado' then 'blocked' when 'travada' then 'blocked' when 'impedida' then 'blocked'
      when 'cancelled' then 'cancelled' when 'cancelada' then 'cancelled' when 'cancelado' then 'cancelled'
      when 'awaiting_validation' then 'awaiting_validation' when 'aguardando validacao' then 'awaiting_validation'
      when 'em validacao' then 'awaiting_validation' when 'revisao' then 'awaiting_validation'
      when 'awaiting_external' then 'awaiting_external' when 'aguardando externo' then 'awaiting_external'
      when 'assigned' then 'assigned' when 'atribuida' then 'assigned' when 'a fazer' then 'assigned'
      when 'aberta' then 'assigned' when 'pendente' then 'assigned'
      when 'draft' then 'draft' when 'rascunho' then 'draft'
      else null
    end)::public.user_task_status;
    if v_status is null then
      raise exception 'status inválido: "%". Use: a fazer, em andamento, bloqueada, aguardando validação, concluída ou cancelada.', p_status;
    end if;
  end if;

  -- Prioridade: sinônimos pt-BR → enum task_priority.
  if p_prioridade is not null and btrim(p_prioridade) <> '' then
    v_s := public.txt_fold(btrim(p_prioridade));
    v_prio := (case v_s
      when 'critical' then 'critical' when 'critica' then 'critical' when 'urgente' then 'critical'
      when 'high' then 'high' when 'alta' then 'high'
      when 'medium' then 'medium' when 'media' then 'medium' when 'normal' then 'medium'
      when 'low' then 'low' when 'baixa' then 'low'
      else null
    end)::public.task_priority;
    if v_prio is null then
      raise exception 'prioridade inválida: "%". Use: crítica, alta, média ou baixa.', p_prioridade;
    end if;
  end if;

  -- Prazo não-passado (mesma regra das pendências; exibe no fuso do escritório).
  if p_prazo is not null and p_prazo < now() then
    raise exception 'o prazo não pode estar no passado (% BRT).',
      to_char(p_prazo at time zone 'America/Bahia', 'DD/MM/YYYY HH24:MI');
  end if;

  update public.user_tasks set
    status      = coalesce(v_status, status),
    priority    = coalesce(v_prio, priority),
    deadline_at = coalesce(p_prazo, deadline_at),
    title       = coalesce(nullif(btrim(p_titulo), ''), title),
    updated_at  = now()
  where id = p_task_id
  returning * into v_after;

  return jsonb_build_object(
    'ok', true,
    'task_id', p_task_id,
    'antes',  jsonb_build_object('status', v_before.status, 'priority', v_before.priority, 'deadline_at', v_before.deadline_at, 'title', v_before.title),
    'depois', jsonb_build_object('status', v_after.status,  'priority', v_after.priority,  'deadline_at', v_after.deadline_at,  'title', v_after.title)
  );
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.atualizar_tarefa(uuid,text,timestamptz,text,text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.atualizar_tarefa(uuid,text,timestamptz,text,text) TO authenticated, service_role;
