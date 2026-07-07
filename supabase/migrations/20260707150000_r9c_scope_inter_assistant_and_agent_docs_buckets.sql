-- R-9c — Escopar os buckets `inter-assistant-files` e `agent-documents` ao
-- dono/participante do recurso (fecha o IDOR remanescente da trilha de storage:
-- R-9 = chat-attachments, R-9b = client-documents).
--
-- IMPORTANTE: aqui o escopo é por DONO/PARTICIPANTE (via path + tabela-dono),
-- NÃO por cargo. NÃO se usa is_recepcao_or_socio() (regra de cliente). Modelo
-- copiado do bucket já-seguro `task-attachments`: o 1º segmento do path
-- (storage.foldername(name))[1] é o id do registro-dono, e a policy checa se o
-- usuário participa daquele recurso.
--
-- Estado anterior (verificado):
--   * inter-assistant-files: 3 policies só com bucket_id -> IDOR completo.
--   * agent-documents: 3 policies com bucket_id AND auth.uid() IS NOT NULL
--     (qualquer logado lê/sobe/apaga qualquer doc de agente).
--   * task-attachments: já escopado -> NÃO é tocado aqui (é o modelo).
--
-- Convenções de path (confirmadas no código e nos objetos existentes):
--   * inter-assistant-files: `${requestId}/...` -> path[1] = inter_assistant_requests.id.
--     Participantes = from_user_id / to_user_id (espelha a RLS da tabela:
--     "iar read/update involved" = from/to/admin).
--   * agent-documents: `${agentId}/${ts}_${nome}` (src/hooks/useAgentDocuments.tsx)
--     -> path[1] = agents.id. Autorização real do acervo de agente:
--       - leitura = visibilidade do agente (agents "agents_select_isolated":
--         compartilhado a todos; pessoal só dono/tech);
--       - escrita/exclusão = admin OU tech (espelha document_library /
--         agent_document_links, que são a fonte de verdade do upload/remove).
--
-- Invariantes:
--   * Service-role bypassa RLS -> edges que gravam por service-role seguem OK.
--   * DELETE mais restrito que SELECT/INSERT (modelo task-attachments).
--   * Nenhuma policy de outro bucket (task-attachments, client-documents,
--     chat-attachments) é alterada.

BEGIN;

-- ============================================================
-- inter-assistant-files  (path[1] = inter_assistant_requests.id)
-- ============================================================

-- SELECT: só participante da requisição (from/to) ou admin.
DROP POLICY IF EXISTS "IAF authenticated select" ON storage.objects;
CREATE POLICY "IAF participant select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'inter-assistant-files'
    AND (
      EXISTS (
        SELECT 1 FROM public.inter_assistant_requests r
        WHERE r.id::text = (storage.foldername(name))[1]
          AND (r.from_user_id = auth.uid() OR r.to_user_id = auth.uid())
      )
      OR public.has_role(auth.uid(), 'admin'::app_role)
    )
  );

-- INSERT: só participante da requisição (from/to) ou admin.
-- (Ambos os lados anexam arquivo — o remetente ao pedir, o destinatário ao responder.)
DROP POLICY IF EXISTS "IAF authenticated insert" ON storage.objects;
CREATE POLICY "IAF participant insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'inter-assistant-files'
    AND (
      EXISTS (
        SELECT 1 FROM public.inter_assistant_requests r
        WHERE r.id::text = (storage.foldername(name))[1]
          AND (r.from_user_id = auth.uid() OR r.to_user_id = auth.uid())
      )
      OR public.has_role(auth.uid(), 'admin'::app_role)
    )
  );

-- DELETE: só quem subiu o arquivo (owner) ou admin (espelha task-attachments).
DROP POLICY IF EXISTS "IAF authenticated delete" ON storage.objects;
CREATE POLICY "IAF owner/admin delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'inter-assistant-files'
    AND (owner = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
  );

-- ============================================================
-- agent-documents  (path[1] = agents.id)
-- ============================================================

-- SELECT: só quem enxerga o agente (compartilhado -> todos; pessoal -> dono/tech).
-- Espelha "agents_select_isolated". Elimina o "qualquer logado" de docs de
-- agentes pessoais alheios.
DROP POLICY IF EXISTS agent_docs_storage_select ON storage.objects;
CREATE POLICY agent_docs_storage_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'agent-documents'
    AND EXISTS (
      SELECT 1 FROM public.agents a
      WHERE a.id::text = (storage.foldername(name))[1]
        AND (
          a.is_personal = false
          OR a.owner_user_id = auth.uid()
          OR public.has_role(auth.uid(), 'tech'::app_role)
        )
    )
  );

-- INSERT: só admin/tech (espelha document_library / agent_document_links insert,
-- que são o gate real do fluxo de upload de acervo de agente).
DROP POLICY IF EXISTS agent_docs_storage_insert ON storage.objects;
CREATE POLICY agent_docs_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'agent-documents'
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'tech'::app_role)
    )
  );

-- DELETE: só admin/tech (espelha document_library / agent_document_links delete).
DROP POLICY IF EXISTS agent_docs_storage_delete ON storage.objects;
CREATE POLICY agent_docs_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'agent-documents'
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'tech'::app_role)
    )
  );

COMMIT;
