-- R-9 — Escopar o bucket `chat-attachments` ao dono (fim do IDOR de leitura E deleção).
--
-- Estado anterior: três policies em roles={public} que só checavam autenticação
-- (bucket_id = 'chat-attachments' AND auth.uid() IS NOT NULL). Qualquer usuário
-- logado lia, inseria e apagava o anexo de QUALQUER outro cliente bastando saber
-- o path — IDOR horizontal sobre PII (agravado pelo OCR, que passa a concentrar
-- RG/CPF escaneado neste bucket).
--
-- Correção: escopar as três policies ao DONO do objeto. A convenção de path na
-- ingestão (src/lib/ingestChatAttachments.ts) é `${userId}/${sessionId}/...`, logo
-- o 1º segmento do path — (storage.foldername(name))[1] — é o auth.uid() do dono.
--
-- Invariantes:
--   * Service-role NÃO é afetado: a edge `ocr-attachment` baixa o binário via
--     adminClient (service-role), que BYPASSA RLS. O download do OCR segue OK.
--     Não criamos policy para service-role.
--   * `TO authenticated` (em vez de public) torna a intenção explícita; a checagem
--     de dono já exige sessão.
--   * Sem UPDATE (não havia policy de UPDATE — mantemos assim).

BEGIN;

DROP POLICY IF EXISTS chat_attach_storage_select ON storage.objects;
DROP POLICY IF EXISTS chat_attach_storage_insert ON storage.objects;
DROP POLICY IF EXISTS chat_attach_storage_delete ON storage.objects;

CREATE POLICY chat_attach_storage_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY chat_attach_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY chat_attach_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'chat-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

COMMIT;
