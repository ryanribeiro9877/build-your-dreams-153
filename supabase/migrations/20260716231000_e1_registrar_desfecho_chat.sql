-- E1 — Desfecho de formulário/ActionCard vira mensagem persistida na sessão.
--
-- O wizard "Modelo A" grava o cliente via save_client DIRETO do browser (a PII
-- cifrada não trafega pelo chat) e o edge nunca fica sabendo — resultado: nenhuma
-- mensagem de desfecho é gravada em chat_messages e o histórico "mente por omissão"
-- (sessão-evidência beaf031c, 2026-07-16: cadastro às 23:07 sem registro, e às 23:11
-- o Kanban pediu tudo de novo).
--
-- Esta RPC (SECURITY DEFINER) é chamada pelo frontend logo após o cadastro para:
--   (a) inserir uma mensagem de DESFECHO na sessão com metadata.kind='final' — o
--       único kind (junto de null) que loadSessionHistory injeta no contexto do N3;
--   (b) o texto NUNCA carrega UUID (cláusula H) — só o resumo humano;
--   (c) carry-over (E2): grava a última entidade (cliente) resolvida na sessão —
--       client_id na coluna dedicada + nome/CPF mascarado em metadata.entities.
-- Só o dono da sessão grava nela (mesma checagem do edge: run.user_id === auth user).

CREATE OR REPLACE FUNCTION public.registrar_desfecho_chat(
  p_session_id       uuid,
  p_summary          text,
  p_client_id        uuid DEFAULT NULL,
  p_client_name      text DEFAULT NULL,
  p_client_cpf_masked text DEFAULT NULL,
  p_kind             text DEFAULT 'cadastro'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid   uuid := auth.uid();
  v_owner uuid;
  v_entry uuid;
  v_seq   integer;
  v_id    uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'registrar_desfecho_chat: não autenticado';
  END IF;
  IF p_summary IS NULL OR btrim(p_summary) = '' THEN
    RAISE EXCEPTION 'registrar_desfecho_chat: resumo vazio';
  END IF;

  SELECT s.user_id, s.entry_agent_id
    INTO v_owner, v_entry
    FROM public.chat_sessions s
   WHERE s.id = p_session_id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'registrar_desfecho_chat: sessão inexistente';
  END IF;
  IF v_owner <> v_uid THEN
    RAISE EXCEPTION 'registrar_desfecho_chat: sem acesso a esta sessão';
  END IF;

  -- Sequência max+1 por sessão (espelha o nextSeq do edge).
  SELECT coalesce(max(m.sequence_number), 0) + 1
    INTO v_seq
    FROM public.chat_messages m
   WHERE m.session_id = p_session_id;

  INSERT INTO public.chat_messages (
    session_id, user_id, role, agent_id, content, sequence_number, metadata
  ) VALUES (
    p_session_id, v_owner, 'assistant', v_entry, btrim(p_summary), v_seq,
    jsonb_build_object('kind', 'final', 'origin', 'action_outcome', 'outcome', p_kind)
  ) RETURNING id INTO v_id;

  -- Carry-over do cliente (E2). Só quando o desfecho envolve um cliente.
  IF p_client_id IS NOT NULL THEN
    UPDATE public.chat_sessions s
       SET client_id = p_client_id,
           metadata = coalesce(s.metadata, '{}'::jsonb) || jsonb_build_object(
             'entities',
             coalesce(s.metadata->'entities', '{}'::jsonb) || jsonb_build_object(
               'client', jsonb_strip_nulls(jsonb_build_object(
                 'id',         p_client_id,
                 'name',       p_client_name,
                 'cpf_masked', p_client_cpf_masked
               ))
             )
           )
     WHERE s.id = p_session_id;
  END IF;

  RETURN v_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.registrar_desfecho_chat(uuid, text, uuid, text, text, text) TO authenticated;
