-- Chat agêntico: ferramentas por agente, ações pendentes e auditoria.
-- Aditivo e inerte até o edge (loop de ferramentas) ser deployado: allowed_tools
-- não é lido por ninguém até lá, então não há mudança de comportamento.

-- 1. Ferramentas habilitadas por agente (vazio = sem tool-calling).
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS allowed_tools text[] NOT NULL DEFAULT '{}';

-- 2. Ações propostas aguardando confirmação no run.
ALTER TABLE public.orchestration_runs
  ADD COLUMN IF NOT EXISTS pending_actions jsonb;

-- 3. Auditoria de ações do chat.
CREATE TABLE IF NOT EXISTS public.agent_actions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id      uuid REFERENCES public.orchestration_runs(id) ON DELETE SET NULL,
  session_id  uuid REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id    uuid REFERENCES public.agents(id) ON DELETE SET NULL,
  tool        text NOT NULL,
  args        jsonb NOT NULL DEFAULT '{}'::jsonb,
  status      text NOT NULL DEFAULT 'proposed'
              CHECK (status IN ('proposed','confirmed','executed','failed','cancelled','routed_pendencia')),
  result      jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  executed_at timestamptz
);

ALTER TABLE public.agent_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user sees own agent_actions" ON public.agent_actions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin') OR public.is_master_admin(auth.uid()));

CREATE POLICY "user inserts own agent_actions" ON public.agent_actions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user updates own agent_actions" ON public.agent_actions
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_agent_actions_session ON public.agent_actions(session_id);
CREATE INDEX IF NOT EXISTS idx_agent_actions_user ON public.agent_actions(user_id);

-- 4. Seed: habilitar ferramentas no assistente principal e na recepção/triagem.
-- assistant_root: todas as ferramentas v1.
UPDATE public.agents
SET allowed_tools = ARRAY[
  'consultar_cliente','consultar_usuario','consultar_tarefas','consultar_processo','consultar_documentos',
  'cadastrar_cliente','criar_card_tarefa','solicitar_documentos','pedir_acesso_arquivos'
]
WHERE role = 'assistant_root';

-- recepção/triagem/cadastro (specialist/monitor): cadastro + consultas + solicitações,
-- SEM criar card direto (se pedir, cai em pendência ao Admin pela decisão de RBAC).
UPDATE public.agents
SET allowed_tools = ARRAY[
  'consultar_cliente','consultar_usuario','consultar_tarefas','consultar_documentos',
  'cadastrar_cliente','solicitar_documentos','pedir_acesso_arquivos'
]
WHERE role IN ('specialist','monitor')
  AND (lower(name) LIKE '%recep%' OR lower(name) LIKE '%triagem%' OR lower(name) LIKE '%cadastro%');
