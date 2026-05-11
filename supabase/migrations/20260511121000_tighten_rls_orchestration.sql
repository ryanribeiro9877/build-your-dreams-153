-- Sigilo profissional (EAOAB art. 34, VII) e principio da minimizacao (LGPD art. 6).
-- agent_orchestration_log hoje permite SELECT 'true' para qualquer authenticated,
-- expondo nomes de tarefas, clientes e agentes entre tenants/usuarios diferentes.
-- Corrigimos adicionando coluna user_id e fechando o RLS por dono.

-- 1) Adiciona user_id (nullable inicialmente para nao quebrar inserts legados;
--    novas linhas DEVEM preencher).
ALTER TABLE public.agent_orchestration_log
  ADD COLUMN IF NOT EXISTS user_id uuid;

-- Indice para o filtro de RLS.
CREATE INDEX IF NOT EXISTS idx_agent_orchestration_log_user_id
  ON public.agent_orchestration_log (user_id);

-- 2) Backfill: registros antigos sem user_id ficam visiveis apenas para admins.
--    Nao temos como inferir o dono retroativamente.

-- 3) Substitui politicas frouxas.
DROP POLICY IF EXISTS "Authenticated users can view orchestration logs" ON public.agent_orchestration_log;
DROP POLICY IF EXISTS "System can insert orchestration logs" ON public.agent_orchestration_log;
DROP POLICY IF EXISTS "Authenticated users can create orchestration logs" ON public.agent_orchestration_log;

-- Donos veem seus logs. Admins veem tudo (auditoria).
CREATE POLICY "Owners view own orchestration logs"
  ON public.agent_orchestration_log FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

-- Insert SO permitido quando o user_id bate com auth.uid().
-- Service role (edge functions) ignora RLS, entao agentes de backend continuam funcionando.
CREATE POLICY "Authenticated insert own orchestration logs"
  ON public.agent_orchestration_log FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- 4) Fecha agent_messages (ja tinha user_id, mas tinha policy generica em outro lugar?).
--    Reforçamos sem quebrar: select/insert apenas para o dono.
DROP POLICY IF EXISTS "Users can view own messages" ON public.agent_messages;
DROP POLICY IF EXISTS "Users can create own messages" ON public.agent_messages;
CREATE POLICY "Owners view own agent messages"
  ON public.agent_messages FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY "Owners insert own agent messages"
  ON public.agent_messages FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 5) departments e agents sao config compartilhada (sem PII).
--    Mantem SELECT para authenticated mas remove qualquer policy de write residual.
--    Writes ficam restritos a admin via service_role.
DROP POLICY IF EXISTS "Authenticated users can manage departments" ON public.departments;
DROP POLICY IF EXISTS "Authenticated users can manage agents" ON public.agents;
DROP POLICY IF EXISTS "Authenticated users can manage permissions" ON public.agent_permissions;

CREATE POLICY "Admins manage departments"
  ON public.departments FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins manage agents"
  ON public.agents FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins manage agent_permissions"
  ON public.agent_permissions FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
