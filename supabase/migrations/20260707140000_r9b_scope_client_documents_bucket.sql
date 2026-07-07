-- R-9b — Escopar o bucket `client-documents` por papel (fim do IDOR de leitura,
-- escrita E deleção sobre documentos formais de cliente).
--
-- Estado anterior: três policies em roles={authenticated} que só checavam o bucket
-- (bucket_id = 'client-documents'), sem escopo de papel. Qualquer usuário logado
-- listava, lia, subia e apagava documentos (RG, CPF, procuração, contrato) de
-- QUALQUER cliente — IDOR horizontal completo sobre PII sensível. É o mesmo padrão
-- do R-9 (chat-attachments), agora em conteúdo mais sensível.
--
-- Correção (Opção 2 — espelhar a tabela): alinhar o acesso ao ARQUIVO ao acesso
-- ao REGISTRO em public.client_documents. O raciocínio de autorização passa a ser
-- único, sem depender de convenção de path:
--   * SELECT/INSERT: recepção ou sócio -> public.is_recepcao_or_socio().
--   * DELETE: só sócio -> espelha a policy "Socio can delete documents" da tabela,
--     com o EXISTS inline em profiles/role_templates (não há is_socio() avulso).
--
-- Invariantes:
--   * Service-role NÃO é afetado: escritas via adminClient (service-role) bypassam
--     RLS. Se algum edge grava/lê o binário por service-role, segue OK.
--   * `TO authenticated` mantido; a checagem de papel já exige sessão.
--   * Sem UPDATE (não havia policy de UPDATE — mantemos assim).
--   * Nenhuma outra policy de bucket é alterada.

BEGIN;

-- SELECT: só recepção/sócio
DROP POLICY IF EXISTS "Authenticated can view client docs" ON storage.objects;
CREATE POLICY "Recepcao/socio can view client docs" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'client-documents'
    AND public.is_recepcao_or_socio()
  );

-- INSERT: só recepção/sócio
DROP POLICY IF EXISTS "Authenticated can upload client docs" ON storage.objects;
CREATE POLICY "Recepcao/socio can upload client docs" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'client-documents'
    AND public.is_recepcao_or_socio()
  );

-- DELETE: só sócio (espelha a policy "Socio can delete documents" da tabela)
DROP POLICY IF EXISTS "Authenticated can delete client docs" ON storage.objects;
CREATE POLICY "Socio can delete client docs" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'client-documents'
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.role_templates rt ON rt.id = p.role_template_id
      WHERE p.user_id = auth.uid()
        AND rt.code = 'socio'
    )
  );

COMMIT;
