BEGIN;

-- inter-assistant-files (path[1] = inter_assistant_requests.id)
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

DROP POLICY IF EXISTS "IAF authenticated delete" ON storage.objects;
CREATE POLICY "IAF owner/admin delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'inter-assistant-files'
    AND (owner = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
  );

-- agent-documents (path[1] = agents.id)
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