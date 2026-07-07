-- Backfill de reconciliação repo↔banco: reflete o SQL aplicado em produção
-- (schema_migrations version=20260707134745, name=r9b_scope_client_documents_bucket).
-- R-9b — Escopar o bucket `client-documents` por papel (fim do IDOR).
BEGIN;

DROP POLICY IF EXISTS "Authenticated can view client docs" ON storage.objects;
CREATE POLICY "Recepcao/socio can view client docs" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'client-documents'
    AND public.is_recepcao_or_socio()
  );

DROP POLICY IF EXISTS "Authenticated can upload client docs" ON storage.objects;
CREATE POLICY "Recepcao/socio can upload client docs" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'client-documents'
    AND public.is_recepcao_or_socio()
  );

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
