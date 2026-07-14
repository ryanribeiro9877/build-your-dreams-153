-- ============================================================================
-- ESPELHO das migrações já aplicadas em produção via Supabase MCP.
-- NÃO REEXECUTAR — versionamento/histórico apenas.
--
-- Card 8.5 — Gate de Protocolo
--
-- Regra do Rodrigo: "protocolo bloqueia — sem os dois, não protocola"
-- (Reclame Aqui + Sentença Procedente). O advogado busca e junta ambos os
-- documentos manualmente. FORA DE ESCOPO: automação de protocolo no tribunal
-- (PJe/PROJUDI/ProJuris) — de outro dono; não é construída aqui.
--
-- Achado no banco: a tarefa `protocolar_peca` (criada pelo 8.2 quando a revisão
-- é aprovada) NÃO tinha nenhum gate — completava pelo caminho genérico sem
-- checar nada. E nem `reclame_aqui` nem `sentenca_procedente` existiam como
-- document_type válido.
--
-- 1) Dois document_type novos no CHECK de client_documents.
-- 2) verificar_gate_protocolo(p_task_id) — leitura: o que falta + nome do cliente.
-- 3) trg_bloquear_protocolo_sem_gate() + trigger trg_user_tasks_bloquear_protocolo
--    (BEFORE UPDATE OF status em user_tasks): BLOQUEIO DURO. Diferente do 8.2
--    (que precisa de julgamento humano e por isso tem aceite/override), aqui é
--    checagem de existência — o bloqueio vale para QUALQUER caminho de conclusão
--    (inbox genérica, kanban, código futuro), sem RPC dedicada nem defesa em
--    profundidade separada. Tarefas inconsistentes (sem cliente etc.) retornam
--    { erro } e NÃO são travadas pelo gate. Outros tipos (ex.: revisar_peca) não
--    são afetados.
--
-- Validado em produção via teste E2E transacional com ROLLBACK (nada persistido):
--   - sem documento → bloqueia ("faltam Reclame Aqui Sentença Procedente");
--   - só Reclame Aqui → ainda bloqueia (só falta Sentença Procedente);
--   - os dois → libera, conclui normalmente;
--   - outra tarefa (revisar_peca) não é afetada.
-- ============================================================================

-- 1) document_type: + reclame_aqui, + sentenca_procedente ----------------------
ALTER TABLE public.client_documents
  DROP CONSTRAINT IF EXISTS client_documents_document_type_check;
ALTER TABLE public.client_documents
  ADD CONSTRAINT client_documents_document_type_check CHECK (
    document_type = ANY (ARRAY[
      'rg','cpf','comprovante','procuracao','contrato','termo_cooperado','outro',
      'comprovante_residencia','extrato_conta','extrato_ir','extrato_inss','cnis',
      'certidao','contrato_honorarios','declaracao_hipossuficiencia',
      'audio_atendimento','resumo_atendimento','transcricao_atendimento',
      'peticao_inicial','minuta','negativa_inss','laudo_medico','ctps',
      'contracheque','documento_fiscal','negativa_plano','comprovante_reajuste',
      'reclame_aqui','sentenca_procedente'
    ]::text[])
  );

-- 2) Leitura do gate -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verificar_gate_protocolo(p_task_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_task public.user_tasks;
  v_type public.task_types;
  v_reclame boolean;
  v_sentenca boolean;
  v_client_name text;
BEGIN
  SELECT * INTO v_task FROM public.user_tasks WHERE id = p_task_id;
  IF v_task.id IS NULL THEN RETURN jsonb_build_object('erro','tarefa não encontrada'); END IF;
  SELECT * INTO v_type FROM public.task_types WHERE id = v_task.task_type_id;
  IF v_type.code IS DISTINCT FROM 'protocolar_peca' THEN
    RETURN jsonb_build_object('erro','tarefa não é protocolar_peca');
  END IF;
  IF v_task.client_id IS NULL THEN RETURN jsonb_build_object('erro','tarefa sem cliente'); END IF;

  SELECT full_name INTO v_client_name FROM public.clients WHERE id = v_task.client_id;
  v_reclame := EXISTS (SELECT 1 FROM public.client_documents WHERE client_id = v_task.client_id AND document_type = 'reclame_aqui');
  v_sentenca := EXISTS (SELECT 1 FROM public.client_documents WHERE client_id = v_task.client_id AND document_type = 'sentenca_procedente');

  RETURN jsonb_build_object(
    'client_id', v_task.client_id, 'client_name', v_client_name,
    'reclame_aqui', v_reclame, 'sentenca_procedente', v_sentenca,
    'completo', (v_reclame AND v_sentenca), 'verificado_em', now()
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.verificar_gate_protocolo(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.verificar_gate_protocolo(uuid) TO authenticated, service_role;

-- 3) Bloqueio duro na conclusão ------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_bloquear_protocolo_sem_gate()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_code text;
  v_gate jsonb;
BEGIN
  SELECT tt.code INTO v_code FROM public.task_types tt WHERE tt.id = NEW.task_type_id;
  IF v_code = 'protocolar_peca' AND NEW.status = 'completed'::public.user_task_status
     AND OLD.status IS DISTINCT FROM NEW.status THEN
    v_gate := public.verificar_gate_protocolo(NEW.id);
    IF v_gate ? 'erro' THEN
      RETURN NEW; -- tarefa inconsistente (sem cliente etc.) — não é o gate que deve travar isso
    END IF;
    IF NOT (v_gate->>'completo')::boolean THEN
      RAISE EXCEPTION 'Protocolo bloqueado: faltam % %',
        CASE WHEN NOT (v_gate->>'reclame_aqui')::boolean THEN 'Reclame Aqui' ELSE '' END,
        CASE WHEN NOT (v_gate->>'sentenca_procedente')::boolean THEN 'Sentença Procedente' ELSE '' END
        USING errcode = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_user_tasks_bloquear_protocolo ON public.user_tasks;
CREATE TRIGGER trg_user_tasks_bloquear_protocolo
  BEFORE UPDATE OF status ON public.user_tasks
  FOR EACH ROW EXECUTE FUNCTION public.trg_bloquear_protocolo_sem_gate();
