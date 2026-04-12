
-- Drop overly permissive policies
DROP POLICY IF EXISTS "Authenticated users can manage departments" ON public.departments;
DROP POLICY IF EXISTS "Authenticated users can manage agents" ON public.agents;
DROP POLICY IF EXISTS "Authenticated users can manage permissions" ON public.agent_permissions;
DROP POLICY IF EXISTS "Authenticated users can create orchestration logs" ON public.agent_orchestration_log;

-- Replace with proper insert-only for orchestration logs
CREATE POLICY "System can insert orchestration logs" ON public.agent_orchestration_log FOR INSERT TO authenticated WITH CHECK (true);

-- For departments, agents, permissions - add user_id based write policies
-- Since these are system-level config, we'll use service role for writes
-- and allow authenticated users read-only access (already have SELECT policies)
