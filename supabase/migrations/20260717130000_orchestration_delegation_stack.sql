-- Multi-hop (modelo do sócio): pilha de delegação persistida no run.
-- Espelho da migração aplicada via MCP em 2026-07-17 (name: orchestration_delegation_stack).
ALTER TABLE public.orchestration_runs
  ADD COLUMN IF NOT EXISTS delegation_stack jsonb;
COMMENT ON COLUMN public.orchestration_runs.delegation_stack IS
  'Pilha de delegacao multi-hop (frames: agent_id/depth/messages/delegation_context/pending_child_tool_call_id). NULL fora do caminho delegating.';
