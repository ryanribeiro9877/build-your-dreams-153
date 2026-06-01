-- Atomic RPCs for chat-orchestrator counters (race condition fix).
-- Replaces the read-modify-write pattern with single UPDATE statements.

-- 1) Atomically increment session counters after an assistant reply.
CREATE OR REPLACE FUNCTION increment_session_counters(
  p_session_id   uuid,
  p_tokens_in    int,
  p_tokens_out   int,
  p_cost         numeric
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE chat_sessions
  SET
    message_count        = message_count + 2,          -- user + assistant
    total_tokens_input   = total_tokens_input  + p_tokens_in,
    total_tokens_output  = total_tokens_output + p_tokens_out,
    total_cost_usd       = total_cost_usd + p_cost,
    last_message_at      = now()
  WHERE id = p_session_id;
$$;

-- 2) Atomically increment provider monthly spend.
CREATE OR REPLACE FUNCTION increment_provider_spend(
  p_config_id  uuid,
  p_cost       numeric
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE llm_provider_configs
  SET
    monthly_spent_usd = monthly_spent_usd + p_cost,
    last_used_at      = now()
  WHERE id = p_config_id;
$$;
