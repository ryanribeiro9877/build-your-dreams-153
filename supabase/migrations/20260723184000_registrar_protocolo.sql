-- ============================================================================
-- Onda 3.1 — registrar_protocolo: concluir a tarefa de protocolo pelo chat
-- ============================================================================
-- Espelha EXATAMENTE a tela (ProtocoloGatePanel + botão "Concluir" da inbox):
-- "protocolar" = marcar a tarefa protocolar_peca como concluída. O gate 8.5
-- (trigger trg_bloquear_protocolo_sem_gate) exige os 2 documentos do cliente
-- (Reclame Aqui + Sentença Procedente). NÃO há número de protocolo nem integração
-- com tribunal — a parte manual (buscar e juntar os 2 docs) continua fora do chat.
--
-- A conclusão é feita pela MESMA RPC da tela (update_user_task_status), que
-- re-checa a permissão via auth.uid() (assignee/assigner/master) — o chat não pode
-- mais que o usuário. Antes disso, uma PRÉ-CHECAGEM amigável de verificar_gate_protocolo
-- devolve o que falta (em vez do erro cru P0001 do trigger) sem tentar escrever.
--
-- p_observacao (opcional) vai para o campo `notes` da tarefa — o MESMO campo que a
-- tela já aceita em update_user_task_status; nada que a tela não faça.
-- REVOKE de PUBLIC/anon explícito.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.registrar_protocolo(p_task_id uuid, p_observacao text DEFAULT NULL)
  RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare
  v_uid   uuid := auth.uid();
  v_task  public.user_tasks;
  v_code  text;
  v_gate  jsonb;
  v_new   public.user_task_status;
  v_faltam jsonb := '[]'::jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_task from public.user_tasks where id = p_task_id;
  if v_task.id is null then raise exception 'tarefa não encontrada' using errcode = 'P0002'; end if;

  select code into v_code from public.task_types where id = v_task.task_type_id;
  if v_code is distinct from 'protocolar_peca' then
    raise exception 'Esta tarefa não é de protocolo (protocolar_peca).' using errcode = 'P0001';
  end if;

  -- Gate 8.5 (mesma verificação da tela). Pré-checagem amigável: devolve o que
  -- falta, sem tentar escrever (o trigger travaria com P0001 cru).
  v_gate := public.verificar_gate_protocolo(p_task_id);
  if v_gate ? 'erro' then
    return jsonb_build_object('ok', false, 'erro', v_gate->>'erro');
  end if;
  if not (v_gate->>'completo')::boolean then
    if not (v_gate->>'reclame_aqui')::boolean then v_faltam := v_faltam || jsonb_build_array('Reclame Aqui'); end if;
    if not (v_gate->>'sentenca_procedente')::boolean then v_faltam := v_faltam || jsonb_build_array('Sentença Procedente'); end if;
    return jsonb_build_object('ok', false, 'bloqueado', true, 'faltam', v_faltam,
                             'client_name', v_gate->>'client_name');
  end if;

  -- Conclui pela MESMA via da tela: permissão (assignee/assigner/master) + o
  -- trigger de protocolo revalida o gate. auth.uid() é preservado no aninhamento.
  v_new := public.update_user_task_status(p_task_id, 'completed'::public.user_task_status, p_observacao);

  return jsonb_build_object('ok', true, 'status', v_new, 'client_name', v_gate->>'client_name',
    'aguardando_validacao', (v_new = 'awaiting_validation'::public.user_task_status));
end; $function$;

REVOKE EXECUTE ON FUNCTION public.registrar_protocolo(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.registrar_protocolo(uuid, text) TO authenticated, service_role;
