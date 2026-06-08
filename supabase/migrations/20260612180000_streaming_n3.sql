-- Streaming do N3 (Opção A): a resposta é escrita token a token numa linha de
-- chat_messages (metadata.kind='streaming'), atualizada via UPDATE, e a UI assina
-- os eventos UPDATE do Realtime. Idempotente e não-destrutivo.

-- Guarda o id da mensagem que está sendo streamada, por run.
ALTER TABLE public.orchestration_runs
  ADD COLUMN IF NOT EXISTS stream_message_id uuid;

-- REPLICA IDENTITY FULL: garante que o payload de UPDATE do Realtime traga a linha
-- completa (inclusive content/metadata), não só a chave primária.
ALTER TABLE public.chat_messages REPLICA IDENTITY FULL;
