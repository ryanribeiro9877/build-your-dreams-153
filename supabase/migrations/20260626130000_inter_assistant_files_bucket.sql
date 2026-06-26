-- Bucket para anexos de upload no protocolo entre assistentes.
-- Política espelha o bucket client-documents (qualquer autenticado lê/escreve),
-- mantendo a mesma postura de segurança já adotada no app (acesso = staff interno).
INSERT INTO storage.buckets (id, name, public)
VALUES ('inter-assistant-files', 'inter-assistant-files', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "IAF authenticated select"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'inter-assistant-files');

CREATE POLICY "IAF authenticated insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'inter-assistant-files');

CREATE POLICY "IAF authenticated delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'inter-assistant-files');
