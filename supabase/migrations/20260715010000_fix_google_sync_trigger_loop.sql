-- ============================================================================
-- ESPELHO da correção já aplicada em produção via Supabase MCP.
-- NÃO REEXECUTAR — versionamento/histórico apenas.
--
-- BUG CRÍTICO ENCONTRADO EM PRODUÇÃO (15/07/2026): trg_meetings_sync e
-- trg_audiencias_sync disparavam em QUALQUER UPDATE — inclusive o próprio
-- writeBack que a edge function google-calendar-sync faz de volta na linha
-- (google_event_id/google_sync_status/last_synced_at). Isso criava um LOOP
-- INFINITO: sync grava status → UPDATE dispara a trigger de novo → sync de
-- novo → grava status de novo → ... Rodou continuamente por ~5 minutos em
-- produção (uma reunião real de teste), batendo na API do Google a cada
-- ~1,7s, até ser interrompido manualmente. Efeito colateral visível: a tela
-- de agenda "piscava" (Realtime recebendo uma enxurrada de UPDATEs, cada um
-- disparando refetch).
--
-- Ação de emergência tomada: ALTER TABLE ... DISABLE TRIGGER (parou o loop
-- na hora). Correção definitiva abaixo: restringir a trigger às colunas de
-- NEGÓCIO (as mesmas que create_meeting/update_meeting alteram), excluindo
-- explicitamente as colunas de sync que a própria edge function escreve.
--
-- Validado com teste E2E (transação com rollback): UPDATE só nas colunas de
-- sync → NÃO enfileira nova chamada (fila fica igual). UPDATE de campo de
-- negócio real (ex.: notes) → enfileira normalmente. Confirmado no log real
-- de produção (net._http_response) que o loop parou e não voltou.
-- ============================================================================

DROP TRIGGER IF EXISTS trg_meetings_sync ON public.meetings;
CREATE TRIGGER trg_meetings_sync
AFTER INSERT OR UPDATE OF
  scheduled_date, start_time, end_time, type, lawyer_user_id,
  receptionist_user_id, client_id, client_name, phone, summary, notes, status
ON public.meetings
FOR EACH ROW EXECUTE FUNCTION public.trg_sync_calendar_record('meeting');

DROP TRIGGER IF EXISTS trg_audiencias_sync ON public.audiencias;
CREATE TRIGGER trg_audiencias_sync
AFTER INSERT OR UPDATE OF
  data_hora, tipo_acao, parte_contraria, link_local, advogado_user_id,
  advogado_nome, status, observacoes, docs, process_id, process_number,
  client_id, client_name
ON public.audiencias
FOR EACH ROW EXECUTE FUNCTION public.trg_sync_calendar_record('audiencia');
