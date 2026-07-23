-- ============================================================================
-- ESPELHO de configuração já aplicada em produção via Supabase MCP (execute_sql).
-- NÃO REEXECUTAR criando divergência — versionamento/histórico apenas.
--
-- Trilho A (chat multimodal — áudio): a edge transcribe-audio seleciona o
-- transcritor por TRANSCRIPTION_ENGINE (ver _shared/transcription/registry.ts).
-- edge_runtime_secrets já tinha TRANSCRIPTION_ENABLED=true e
-- TRANSCRIPTION_MODEL=whisper-1, mas FALTAVA TRANSCRIPTION_ENGINE — sem ele o
-- getTranscriber devolve null (transcrição desligada). Aqui setamos "openai"
-- (Whisper OpenAI DIRETO; a chave vem por BYOK, llm_provider_configs).
-- ============================================================================

INSERT INTO public.edge_runtime_secrets (key, value) VALUES
  ('TRANSCRIPTION_ENABLED', 'true'),
  ('TRANSCRIPTION_ENGINE', 'openai'),
  ('TRANSCRIPTION_MODEL', 'whisper-1')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
