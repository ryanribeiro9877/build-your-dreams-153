-- ============================================================================
-- V14 — LexForce Organizational Model (Bacellar Advogados)
-- ============================================================================
-- Cria a estrutura multi-papel da empresa:
--   - role_templates    catalogo de cargos (10)
--   - agent_templates   catalogo de agentes (~75)
--   - task_types        catalogo de tipos de tarefa (66)
--   - role_agent_matrix N:N entre cargos e agentes (provisionamento V15)
--   - role_task_matrix  N:N entre cargos e tipos de tarefa (autorizacao)
--   - user_areas        N:N entre usuarios e areas juridicas
--   - role_coverage     mapa de cobertura/backup (ferias)
--   - external_collaborators colaboradores sem login (Robson)
--   - user_tasks        atribuicao humano -> humano (sócio -> advogada etc.)
--   - inter_assistant_requests pedidos entre Assistant Roots
--   - captacao_canais   canais de captacao (cooperativa, ressaque, indicacao)
--
-- Alteracoes em tabelas existentes:
--   - agent_role enum: + 'assistant_root'
--   - profiles: + role_template_id, organization_id, full_name
--   - agents:   + owner_user_id, source_template_id, is_overridden, is_personal
--
-- Seeds (catalogos vazios sao ruim — sem isso a V15 nao consegue provisionar):
--   - 10 role_templates
--   - 75 agent_templates
--   - 66 task_types
--   - role_agent_matrix completa
--   - role_task_matrix completa
--   - 3 captacao_canais (cooperativa, ressaque, indicacao)
--
-- NAO cria usuarios reais (Rodrigo, Ana, etc.) — isso e responsabilidade
-- da V15 (provision_users_from_seed + handle_new_user trigger).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. ENUMS
-- ----------------------------------------------------------------------------

-- Etapa do processo (com qual fase o cargo/agente/tarefa lida)
CREATE TYPE public.org_stage AS ENUM (
  'atendimento',
  'confeccao',
  'revisao',
  'protocolo',
  'audiencia',
  'execucao',
  'execucao_sindicato',
  'recursos',
  'recursos_criticos',
  'alvara',
  'diligencia',
  'acompanhamento',
  'financeiro',
  'recepcao',
  'recepcao_supervisionada',
  'admin_equipe',
  'captacao_cooperativa',
  'kanban_pendencias',
  'gestao',
  'todas'
);

-- Areas juridicas atendidas
CREATE TYPE public.legal_area AS ENUM (
  'bancario',
  'familia',
  'plano_saude',
  'consumidor',
  'civil',
  'previdenciario',
  'tributario'
);

-- Status das user_tasks (humano->humano). NAO confundir com task_status pre-existente.
CREATE TYPE public.user_task_status AS ENUM (
  'draft',
  'assigned',
  'in_progress',
  'awaiting_external',
  'awaiting_validation',
  'blocked',
  'completed',
  'cancelled'
);

-- Status da cobertura/backup
CREATE TYPE public.coverage_status AS ENUM (
  'scheduled',
  'active',
  'finished',
  'cancelled'
);

-- Status das requisicoes inter-Assistente
CREATE TYPE public.inter_assistant_status AS ENUM (
  'pending',
  'in_progress',
  'answered',
  'denied',
  'expired'
);

-- Tipo de canal de captacao
CREATE TYPE public.captacao_canal_tipo AS ENUM (
  'cooperativa',
  'ressaque',
  'indicacao',
  'site',
  'outro'
);

-- Adiciona 'assistant_root' ao enum agent_role pre-existente (idempotente).
-- Este e o "Meu Assistente" pessoal de cada usuario nao-socio.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'public.agent_role'::regtype
      AND enumlabel = 'assistant_root'
  ) THEN
    ALTER TYPE public.agent_role ADD VALUE 'assistant_root' AFTER 'ceo';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. ALTERACOES EM TABELAS EXISTENTES
-- ----------------------------------------------------------------------------

-- profiles ganha vinculo ao role_template e organizacao (multi-tenant ready)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role_template_id UUID,
  ADD COLUMN IF NOT EXISTS organization_id  UUID,
  ADD COLUMN IF NOT EXISTS full_name        TEXT;

-- agents ganha vinculo ao dono e ao template de origem (nullable: agentes
-- antigos seedados ficam global, owner=null)
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS owner_user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS source_template_id  UUID,
  ADD COLUMN IF NOT EXISTS is_overridden       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_personal         BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS agents_owner_user_id_idx
  ON public.agents (owner_user_id) WHERE owner_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS agents_source_template_id_idx
  ON public.agents (source_template_id) WHERE source_template_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 3. TABELAS NOVAS — CATALOGOS
-- ----------------------------------------------------------------------------

-- 3.1. role_templates ---------------------------------------------------------
CREATE TABLE public.role_templates (
  id            UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,           -- 'socio', 'adv_confeccao_geral', etc.
  display_name  TEXT NOT NULL,                  -- 'Sócio', 'Advogada de Confecção'
  description   TEXT,
  stages        public.org_stage[] NOT NULL,    -- multiplas etapas
  areas         public.legal_area[],            -- nullable: cargos como recepcao nao tem area
  is_admin      BOOLEAN NOT NULL DEFAULT false, -- true so para o socio
  has_login     BOOLEAN NOT NULL DEFAULT true,  -- false para audiencia_externa
  can_assign_tasks BOOLEAN NOT NULL DEFAULT false,
  sort_order    INTEGER NOT NULL DEFAULT 100,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX role_templates_code_idx ON public.role_templates (code);

-- 3.2. agent_templates --------------------------------------------------------
CREATE TABLE public.agent_templates (
  id                  UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code                TEXT NOT NULL UNIQUE,     -- 'ceo_lexforce', 'esp_conf_bancario'
  display_name        TEXT NOT NULL,
  description         TEXT,
  role                public.agent_role NOT NULL,    -- 'ceo'|'director'|'manager'|'specialist'|'monitor'|'assistant_root'|etc
  stage               public.org_stage,              -- etapa principal (nullable)
  area                public.legal_area,             -- area principal (nullable)
  default_color       TEXT NOT NULL DEFAULT '#EAB308',
  default_provider    public.provider_code NOT NULL DEFAULT 'anthropic',
  default_model       TEXT NOT NULL DEFAULT 'claude-sonnet-4-20250514',
  default_temperature NUMERIC(3,2) NOT NULL DEFAULT 0.7,
  default_max_tokens  INTEGER NOT NULL DEFAULT 4096,
  default_system_prompt TEXT,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  sort_order          INTEGER NOT NULL DEFAULT 100,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX agent_templates_code_idx ON public.agent_templates (code);
CREATE INDEX agent_templates_role_idx ON public.agent_templates (role);

-- 3.3. role_agent_matrix ------------------------------------------------------
CREATE TABLE public.role_agent_matrix (
  id                  UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  role_template_id    UUID NOT NULL REFERENCES public.role_templates(id) ON DELETE CASCADE,
  agent_template_id   UUID NOT NULL REFERENCES public.agent_templates(id) ON DELETE CASCADE,
  is_default          BOOLEAN NOT NULL DEFAULT true,    -- provisiona automaticamente
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (role_template_id, agent_template_id)
);

CREATE INDEX role_agent_matrix_role_idx  ON public.role_agent_matrix (role_template_id);
CREATE INDEX role_agent_matrix_agent_idx ON public.role_agent_matrix (agent_template_id);

-- 3.4. task_types -------------------------------------------------------------
CREATE TABLE public.task_types (
  id                      UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code                    TEXT NOT NULL UNIQUE,    -- 'protocolar_peca', 'audiencia_online_suporte'
  display_name            TEXT NOT NULL,
  description             TEXT,
  stage                   public.org_stage NOT NULL,
  area                    public.legal_area,       -- nullable: tarefas multi-area
  default_sla_hours       INTEGER,                 -- nullable se nao tem prazo padrao
  requires_validation     BOOLEAN NOT NULL DEFAULT false,
  validator_role_code     TEXT,                    -- ex: 'lider_recepcao' valida cadastros da Yasmin
  is_active               BOOLEAN NOT NULL DEFAULT true,
  sort_order              INTEGER NOT NULL DEFAULT 100,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX task_types_code_idx  ON public.task_types (code);
CREATE INDEX task_types_stage_idx ON public.task_types (stage);

-- 3.5. role_task_matrix -------------------------------------------------------
CREATE TABLE public.role_task_matrix (
  id                  UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_type_id        UUID NOT NULL REFERENCES public.task_types(id) ON DELETE CASCADE,
  role_template_id    UUID NOT NULL REFERENCES public.role_templates(id) ON DELETE CASCADE,
  can_execute         BOOLEAN NOT NULL DEFAULT true,
  can_assign          BOOLEAN NOT NULL DEFAULT false,    -- pode atribuir essa tarefa a outros?
  is_default_assignee BOOLEAN NOT NULL DEFAULT false,    -- default na UI de atribuicao
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (task_type_id, role_template_id)
);

CREATE INDEX role_task_matrix_task_idx ON public.role_task_matrix (task_type_id);
CREATE INDEX role_task_matrix_role_idx ON public.role_task_matrix (role_template_id);

-- ----------------------------------------------------------------------------
-- 4. TABELAS NOVAS — OPERACIONAIS
-- ----------------------------------------------------------------------------

-- 4.1. user_areas (N:N usuario <-> area) -------------------------------------
CREATE TABLE public.user_areas (
  id          UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  area        public.legal_area NOT NULL,
  is_primary  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, area)
);

CREATE INDEX user_areas_user_idx ON public.user_areas (user_id);

-- 4.2. role_coverage (backup quando alguem esta de ferias) -------------------
CREATE TABLE public.role_coverage (
  id              UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  primary_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  backup_user_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- backup_user_id NULL = pausa (caso Laura previdenciario, ninguem cobre)
  scope_stage     public.org_stage,
  scope_area      public.legal_area,
  status          public.coverage_status NOT NULL DEFAULT 'scheduled',
  active_from     DATE NOT NULL,
  active_until    DATE NOT NULL,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (active_until >= active_from)
);

CREATE INDEX role_coverage_primary_idx ON public.role_coverage (primary_user_id);
CREATE INDEX role_coverage_backup_idx  ON public.role_coverage (backup_user_id);
CREATE INDEX role_coverage_active_idx  ON public.role_coverage (active_from, active_until) WHERE status = 'active';

-- 4.3. external_collaborators (Robson) ---------------------------------------
CREATE TABLE public.external_collaborators (
  id                UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name         TEXT NOT NULL,
  role_template_id  UUID REFERENCES public.role_templates(id),
  phone_whatsapp    TEXT,
  email             TEXT,
  notes             TEXT,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4.4. user_tasks (atribuicao humano -> humano) ------------------------------
-- Separada de agent_tasks (que e orquestracao entre agentes).
CREATE TABLE public.user_tasks (
  id                      UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_type_id            UUID NOT NULL REFERENCES public.task_types(id),
  title                   TEXT NOT NULL,
  description             TEXT,

  assigner_user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assignee_user_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assignee_external_id    UUID REFERENCES public.external_collaborators(id) ON DELETE SET NULL,
  CHECK (
    (assignee_user_id IS NOT NULL AND assignee_external_id IS NULL)
    OR
    (assignee_user_id IS NULL AND assignee_external_id IS NOT NULL)
  ),

  process_id              UUID REFERENCES public.processes(id) ON DELETE SET NULL,
  client_id               UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  area                    public.legal_area,
  status                  public.user_task_status NOT NULL DEFAULT 'assigned',
  priority                public.task_priority NOT NULL DEFAULT 'medium',
  documentation_completed_at TIMESTAMPTZ,            -- gatilho do SLA de 3 dias
  deadline_at             TIMESTAMPTZ,
  external_kanban_ref     TEXT,                      -- link/id do cartao no kanban externo
  payload                 JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes                   TEXT,
  validator_user_id       UUID REFERENCES auth.users(id),
  validated_at            TIMESTAMPTZ,
  completed_at            TIMESTAMPTZ,
  cancelled_at            TIMESTAMPTZ,
  cancellation_reason     TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX user_tasks_assigner_idx     ON public.user_tasks (assigner_user_id);
CREATE INDEX user_tasks_assignee_idx     ON public.user_tasks (assignee_user_id) WHERE assignee_user_id IS NOT NULL;
CREATE INDEX user_tasks_status_idx       ON public.user_tasks (status);
CREATE INDEX user_tasks_deadline_idx     ON public.user_tasks (deadline_at) WHERE status NOT IN ('completed', 'cancelled');
CREATE INDEX user_tasks_external_ref_idx ON public.user_tasks (external_kanban_ref) WHERE external_kanban_ref IS NOT NULL;

-- 4.5. inter_assistant_requests (pedidos entre Assistant Roots) --------------
CREATE TABLE public.inter_assistant_requests (
  id                  UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  from_user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_agent_id       UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  to_agent_id         UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  request_type        TEXT NOT NULL,
  payload             JSONB NOT NULL DEFAULT '{}'::jsonb,
  status              public.inter_assistant_status NOT NULL DEFAULT 'pending',
  response_payload    JSONB,
  related_task_id     UUID REFERENCES public.user_tasks(id) ON DELETE SET NULL,
  related_session_id  UUID REFERENCES public.chat_sessions(id) ON DELETE SET NULL,
  expires_at          TIMESTAMPTZ,
  answered_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX iar_from_idx   ON public.inter_assistant_requests (from_user_id);
CREATE INDEX iar_to_idx     ON public.inter_assistant_requests (to_user_id);
CREATE INDEX iar_status_idx ON public.inter_assistant_requests (status) WHERE status IN ('pending','in_progress');

-- 4.6. captacao_canais --------------------------------------------------------
CREATE TABLE public.captacao_canais (
  id              UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code            TEXT NOT NULL UNIQUE,
  display_name    TEXT NOT NULL,
  tipo            public.captacao_canal_tipo NOT NULL,
  description     TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  default_assignee_role_code TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 5. FOREIGN KEY DELAYED (role_template_id em profiles)
-- ----------------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_template_fk
  FOREIGN KEY (role_template_id) REFERENCES public.role_templates(id) ON DELETE SET NULL;

ALTER TABLE public.agents
  ADD CONSTRAINT agents_source_template_fk
  FOREIGN KEY (source_template_id) REFERENCES public.agent_templates(id) ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- 6. TRIGGERS — updated_at automatico
-- ----------------------------------------------------------------------------

CREATE TRIGGER trg_role_templates_updated      BEFORE UPDATE ON public.role_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_agent_templates_updated     BEFORE UPDATE ON public.agent_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_task_types_updated          BEFORE UPDATE ON public.task_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_role_coverage_updated       BEFORE UPDATE ON public.role_coverage
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_external_collab_updated     BEFORE UPDATE ON public.external_collaborators
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_user_tasks_updated          BEFORE UPDATE ON public.user_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_iar_updated                 BEFORE UPDATE ON public.inter_assistant_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_captacao_canais_updated     BEFORE UPDATE ON public.captacao_canais
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 7. RLS POLICIES
-- ----------------------------------------------------------------------------

-- Catalogos: leitura publica autenticada, escrita so admin
ALTER TABLE public.role_templates    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_templates   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_agent_matrix ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_types        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_task_matrix  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.captacao_canais   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read role_templates"    ON public.role_templates    FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write role_templates"  ON public.role_templates    FOR ALL    TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "auth read agent_templates"   ON public.agent_templates   FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write agent_templates" ON public.agent_templates   FOR ALL    TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "auth read role_agent_matrix" ON public.role_agent_matrix FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write role_agent_matrix" ON public.role_agent_matrix FOR ALL  TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "auth read task_types"        ON public.task_types        FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write task_types"      ON public.task_types        FOR ALL    TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "auth read role_task_matrix"  ON public.role_task_matrix  FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write role_task_matrix" ON public.role_task_matrix FOR ALL    TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "auth read captacao_canais"   ON public.captacao_canais   FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write captacao_canais" ON public.captacao_canais   FOR ALL    TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- user_areas: usuario ve as proprias areas; admin ve tudo
ALTER TABLE public.user_areas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user reads own areas"  ON public.user_areas FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin writes areas"    ON public.user_areas FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- role_coverage: usuario ve coberturas em que esta envolvido; admin ve tudo
ALTER TABLE public.role_coverage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user reads own coverage"  ON public.role_coverage FOR SELECT TO authenticated
  USING (auth.uid() IN (primary_user_id, backup_user_id) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin writes coverage"    ON public.role_coverage FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- external_collaborators: leitura geral, escrita admin
ALTER TABLE public.external_collaborators ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read external_collab"   ON public.external_collaborators FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write external_collab" ON public.external_collaborators FOR ALL    TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- user_tasks: assigner, assignee ou admin podem ver
ALTER TABLE public.user_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user reads involved tasks" ON public.user_tasks FOR SELECT TO authenticated
  USING (
    auth.uid() IN (assigner_user_id, assignee_user_id, validator_user_id)
    OR public.has_role(auth.uid(), 'admin')
  );
CREATE POLICY "user creates tasks they assign" ON public.user_tasks FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = assigner_user_id);
CREATE POLICY "involved updates task" ON public.user_tasks FOR UPDATE TO authenticated
  USING (
    auth.uid() IN (assigner_user_id, assignee_user_id, validator_user_id)
    OR public.has_role(auth.uid(), 'admin')
  );
CREATE POLICY "admin deletes task" ON public.user_tasks FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- inter_assistant_requests: from/to ou admin
ALTER TABLE public.inter_assistant_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "iar read involved"   ON public.inter_assistant_requests FOR SELECT TO authenticated
  USING (auth.uid() IN (from_user_id, to_user_id) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "iar create from self" ON public.inter_assistant_requests FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = from_user_id);
CREATE POLICY "iar update involved"  ON public.inter_assistant_requests FOR UPDATE TO authenticated
  USING (auth.uid() IN (from_user_id, to_user_id) OR public.has_role(auth.uid(), 'admin'));

-- ----------------------------------------------------------------------------
-- 8. SEEDS — ROLE_TEMPLATES (10)
-- ----------------------------------------------------------------------------

INSERT INTO public.role_templates (code, display_name, description, stages, areas, is_admin, has_login, can_assign_tasks, sort_order) VALUES
('socio',                  'Sócio',
 'Acesso total. Único admin. Cobre Ana e Daiane em férias. Recursos Agiproteg/Agibank/Facta exclusivos.',
 ARRAY['gestao','revisao','execucao','alvara','recursos_criticos']::public.org_stage[],
 ARRAY['bancario','familia','plano_saude','consumidor','civil','previdenciario','tributario']::public.legal_area[],
 true, true, true, 10),

('adv_confeccao_geral',    'Advogada de Confecção',
 'Confecciona peças de bancário, plano de saúde, consumidor e civil. Não faz família nem previdenciário. Cobre Luísa em férias.',
 ARRAY['confeccao','atendimento']::public.org_stage[],
 ARRAY['bancario','plano_saude','consumidor','civil']::public.legal_area[],
 false, true, false, 20),

('adv_protocolo',          'Advogada de Protocolo',
 'Protocolo exclusivo das ações revisadas. Não protocola previdenciário. Cobre Ana em férias.',
 ARRAY['protocolo']::public.org_stage[],
 ARRAY['bancario','familia','plano_saude','consumidor','civil','tributario']::public.legal_area[],
 false, true, false, 30),

('adv_audiencia_execucao', 'Advogada de Audiência',
 'Audiências, execução de sindicato, recursos (exceto Agiproteg/Agibank/Facta), diligências de alvará, acompanhamento de família. Daiane faz ciclo completo de família.',
 ARRAY['audiencia','execucao','execucao_sindicato','recursos','diligencia','acompanhamento','confeccao']::public.org_stage[],
 ARRAY['bancario','familia']::public.legal_area[],
 false, true, false, 40),

('adv_previdenciario',     'Advogada Previdenciária',
 'Ciclo completo de previdenciário (atendimento, peça, protocolo, audiência, execução). Em férias dela, previdenciário pausa até retorno.',
 ARRAY['todas']::public.org_stage[],
 ARRAY['previdenciario']::public.legal_area[],
 false, true, false, 50),

('lider_recepcao',         'Líder de Recepção',
 'Gerencia Taís e Yasmin. Captação cooperativa. Valida cadastros da Yasmin. Organiza kanban de pendências gerais. PROCON/SUSEP. Cria/finaliza cadastro de processos no ProJuris.',
 ARRAY['recepcao','admin_equipe','captacao_cooperativa','kanban_pendencias']::public.org_stage[],
 NULL,
 false, true, true, 60),

('recepcionista',          'Recepcionista',
 'Mesmo escopo da líder menos gestão de equipe. PROCON/SUSEP confirmado. Assume liderança em férias da Kailane.',
 ARRAY['recepcao','kanban_pendencias']::public.org_stage[],
 NULL,
 false, true, false, 70),

('estagiaria_recepcao',    'Estagiária de Recepção',
 'Escopo supervisionado. PROCON/SUSEP confirmado. Cadastra processos com Kailane validando.',
 ARRAY['recepcao_supervisionada']::public.org_stage[],
 NULL,
 false, true, false, 80),

('financeiro',             'Financeiro',
 'Conferência processo a processo. Aciona recepção para pedir PIX. Controle mensal de pagamentos.',
 ARRAY['financeiro']::public.org_stage[],
 NULL,
 false, true, false, 90),

('audiencia_externa',      'Colaborador Externo de Audiência',
 'Sem login. Uso esporádico. Mensagem via WhatsApp gerada pelo sistema. Bancário e família.',
 ARRAY['audiencia']::public.org_stage[],
 ARRAY['bancario','familia']::public.legal_area[],
 false, false, false, 100);

-- ----------------------------------------------------------------------------
-- 9. SEEDS — AGENT_TEMPLATES (75 agentes)
-- ----------------------------------------------------------------------------
-- Convencao de code: <prefixo>_<descricao_snake>
-- Prefixos: ceo, dir (director), asst (assistant_root), esp (specialist), mon (monitor)

-- 9.1. Sócio (9 agentes) ----------------------------------------------------
INSERT INTO public.agent_templates (code, display_name, description, role, stage, area, default_color, default_system_prompt, sort_order) VALUES
('ceo_lexforce',
 'CEO LexForce',
 'Agente raiz do sócio. Visão total da empresa. Orquestra e delega para diretores e Meus Assistentes.',
 'ceo', 'gestao', NULL, '#EAB308',
 'Você é o CEO LexForce, agente máximo do escritório Bacellar Advogados. Você tem visão completa de todas as áreas, todos os colaboradores e todos os processos. Sua função é orquestrar, delegar e responder ao sócio Rodrigo Bacellar. Você pode acionar qualquer outro agente do sistema. Seja conciso, estratégico e jurídicamente preciso.',
 10),

('dir_operacoes',
 'Diretor de Operações',
 'Acompanha fluxo geral, identifica gargalos, "empurra" recepção automaticamente.',
 'director', 'gestao', NULL, '#B45309',
 'Você é o Diretor de Operações do Bacellar Advogados. Acompanha o fluxo de tarefas entre recepção, advogadas e protocolo. Identifica gargalos (peças paradas, audiências sem preparo, documentos pendentes) e alerta o CEO LexForce.',
 20),

('dir_juridico_revisao',
 'Diretor Jurídico — Revisão',
 'Revisa peças confeccionadas antes do protocolo. SLA 3 dias.',
 'director', 'revisao', NULL, '#B45309',
 'Você é o Diretor Jurídico de Revisão. Sua função é revisar tecnicamente as peças confeccionadas pelas advogadas antes do protocolo. Verifique fundamentação, jurisprudência, requisitos formais e anexos. Aponte correções de forma objetiva.',
 30),

('dir_financeiro',
 'Diretor Financeiro',
 'Conferência processo a processo. Honorários advocatícios, sucumbência, atualização.',
 'director', 'financeiro', NULL, '#B45309',
 'Você é o Diretor Financeiro. Confere cada processo individualmente: sentença, recursos, honorários de sucumbência, atualização monetária, divisão entre escritório e cliente. Reporta inconsistências ao CEO LexForce.',
 40),

('dir_equipe',
 'Diretor de Equipe',
 'Acompanha cobertura/férias e produtividade de cada advogada/recepção.',
 'director', 'admin_equipe', NULL, '#B45309',
 'Você é o Diretor de Equipe. Acompanha férias, coberturas, carga de trabalho e produtividade. Sugere redistribuição quando alguém está sobrecarregado.',
 50),

('esp_execucao',
 'Especialista Execução',
 'Cálculo Dr. Calc, planilha de indébitos, +10% antecipado, dano material e moral.',
 'specialist', 'execucao', NULL, '#92400E',
 'Você é o Especialista em Execução. Conhece a planilha de indébitos, o Dr. Calc, e a fórmula do escritório: dano material atualizado + dano moral atualizado + sucumbência + 10% antecipados de atraso. Petições de execução com pedido de urgência (15 dias para o réu pagar).',
 60),

('esp_alvara',
 'Especialista Alvará',
 'Validação de procuração (PF vs Sociedade) antes de pedir alvará.',
 'specialist', 'alvara', NULL, '#92400E',
 'Você é o Especialista em Alvará. Sempre valide se a procuração está em nome da sociedade (Rodrigo Bacellar Sociedade Individual de Advocacia), não da pessoa física, antes de pedir expedição. Procurações com mais de 12 meses precisam de atualização.',
 70),

('esp_recursos_criticos',
 'Especialista Recursos Críticos',
 'Recursos Agiproteg, Agibank e Facta Seguros — exclusivos do sócio.',
 'specialist', 'recursos_criticos', NULL, '#92400E',
 'Você é o Especialista em Recursos Críticos. Atua exclusivamente em Agiproteg (seguro vinculado ao refinanciamento do Agibank), Agibank e Facta Seguros. Recursos inominados, contrarrazões e agravos internos desses três temas.',
 80),

('mon_sla_global',
 'Monitor de SLA Global',
 'Painel: tarefas vencendo, doc pendente, execuções paradas, alvarás aguardando.',
 'monitor', 'gestao', NULL, '#6B7280',
 'Você é o Monitor de SLA Global. Reporta diariamente: tarefas com prazo vencendo, documentos pendentes >5 dias, execuções sem movimento >7 dias, alvarás aguardando expedição.',
 90);

-- 9.2. Ana Cristina — Confecção (7 agentes) ----------------------------------
INSERT INTO public.agent_templates (code, display_name, description, role, stage, area, default_color, default_system_prompt, sort_order) VALUES
('asst_root_confeccao',
 'Meu Assistente',
 'Raiz pessoal da advogada de confecção. Recebe pedidos do CEO LexForce e dos Assistentes dos outros usuários.',
 'assistant_root', 'confeccao', NULL, '#7a7a92',
 'Você é o Meu Assistente da advogada de confecção (Ana Cristina). Você conhece todos os processos em confecção, os clientes atendidos, e pode ser acionado pelo CEO LexForce ou pelos Assistentes de outros colegas. Reformule respostas técnicas em linguagem clara.',
 100),

('esp_conf_bancario',
 'Especialista Confecção Bancário',
 'Cartão consignado, RMC, RCC, refinanciamentos, portabilidades, empréstimo pessoal, seguros, capitalização, descontos indevidos.',
 'specialist', 'confeccao', 'bancario', '#92400E',
 'Você é o Especialista em Confecção de peças bancárias. Conhece os temas: cartão consignado, RMC, RCC, refinanciamentos não reconhecidos, portabilidades, empréstimo pessoal, seguros bancários, título de capitalização, descontos indevidos. Anexe sempre planilha de indébitos, extratos SCOM/SCRE quando aplicável.',
 110),

('esp_conf_plano_saude',
 'Especialista Confecção Plano de Saúde',
 'Negativa de cobertura, reajustes abusivos, descredenciamento, urgência médica.',
 'specialist', 'confeccao', 'plano_saude', '#92400E',
 'Você é o Especialista em Confecção de peças de plano de saúde. Foco: negativa de cobertura, reajustes abusivos, descredenciamento de rede, atendimento de urgência. Use ANS e Lei dos Planos de Saúde.',
 120),

('esp_conf_consumidor',
 'Especialista Confecção Consumidor',
 'CDC: cobranças abusivas, publicidade enganosa, vícios de produto/serviço, negativações indevidas.',
 'specialist', 'confeccao', 'consumidor', '#92400E',
 'Você é o Especialista em Confecção de peças de Direito do Consumidor. Base: CDC. Temas: cobrança abusiva, publicidade enganosa, vícios, negativação indevida, descumprimento contratual.',
 130),

('esp_conf_civil',
 'Especialista Confecção Civil',
 'Responsabilidade civil, indenizações, contratos, obrigações.',
 'specialist', 'confeccao', 'civil', '#92400E',
 'Você é o Especialista em Confecção de peças de Direito Civil. Responsabilidade civil contratual e extracontratual, indenizações por dano material e moral, ações de cobrança, revisões contratuais.',
 140),

('esp_atendimento_geral',
 'Especialista Atendimento',
 'Sondagem e fechamento de cliente novo nas áreas de confecção.',
 'specialist', 'atendimento', NULL, '#92400E',
 'Você é o Especialista em Atendimento da advogada de confecção. Conduz sondagem inicial do cliente, identifica a demanda, confirma documentação necessária por tipo de caso, fecha contrato (procuração, contrato, ficha de cooperação, declaração de hipossuficiência).',
 150),

('mon_andamento_cliente_ana',
 'Monitor Andamento por Cliente',
 'Espelho da planilha "andamento dos processos por cliente".',
 'monitor', 'confeccao', NULL, '#6B7280',
 'Você é o Monitor de Andamento por Cliente. Espelho da planilha externa de andamento. Reporta status atual de cada processo agrupado por cliente.',
 160);

-- 9.3. Luisa — Protocolo (5 agentes) -----------------------------------------
INSERT INTO public.agent_templates (code, display_name, description, role, stage, area, default_color, default_system_prompt, sort_order) VALUES
('asst_root_protocolo',
 'Meu Assistente',
 'Raiz pessoal da advogada de protocolo (Luísa).',
 'assistant_root', 'protocolo', NULL, '#7a7a92',
 'Você é o Meu Assistente da advogada de protocolo. Conhece a fila de protocolos e o SLA de 3 dias após documentação completa.',
 170),

('esp_protocolo_projuris',
 'Especialista Protocolo ProJuris',
 'Protocolo principal das ações via ProJuris.',
 'specialist', 'protocolo', NULL, '#92400E',
 'Você é o Especialista em Protocolo via ProJuris. Sistema principal do escritório.',
 180),

('esp_protocolo_pje',
 'Especialista Protocolo PJe',
 'Protocolo em comarcas que usam PJe.',
 'specialist', 'protocolo', NULL, '#92400E',
 'Você é o Especialista em Protocolo via PJe.',
 190),

('esp_protocolo_projudi',
 'Especialista Protocolo PROJUDI',
 'Protocolo em comarcas que usam PROJUDI. No PROJUDI a data de audiência é marcada já no protocolo.',
 'specialist', 'protocolo', NULL, '#92400E',
 'Você é o Especialista em Protocolo via PROJUDI. Atenção: no PROJUDI a data de audiência é marcada já no momento do protocolo.',
 200),

('mon_docs_protocolo',
 'Monitor de Documentos para Protocolo',
 'Checklist por tipo de demanda. Espelho da planilha de documentos.',
 'monitor', 'protocolo', NULL, '#6B7280',
 'Você é o Monitor de Documentos para Protocolo. Verifica se cada peça tem identidade, comprovante, procuração, declaração de hipossuficiência, contrato e os anexos específicos do caso.',
 210);

-- 9.4. Daiane — Audiência/Execução/Recursos/Família (8 agentes) --------------
INSERT INTO public.agent_templates (code, display_name, description, role, stage, area, default_color, default_system_prompt, sort_order) VALUES
('asst_root_audiencia',
 'Meu Assistente',
 'Raiz pessoal da advogada de audiência/execução (Daiane).',
 'assistant_root', 'audiencia', NULL, '#7a7a92',
 'Você é o Meu Assistente da advogada de audiência e execução. Conhece a tabela de audiências do dia, os processos em execução, os alvarás em diligência e os recursos pendentes.',
 220),

('esp_audiencia_preparo',
 'Especialista Audiência',
 'Preparo: número do processo, data, horário, link, manifestação prevista.',
 'specialist', 'audiencia', NULL, '#92400E',
 'Você é o Especialista em Preparo de Audiência. Cada tarefa de audiência deve ter: número da audiência, número do processo, data, horário, link, e manifestação a ser feita.',
 230),

('esp_alvara_diligencia',
 'Especialista Alvará (Diligência)',
 'Diligência no cartório, concluso ao juiz, validação de procuração.',
 'specialist', 'diligencia', NULL, '#92400E',
 'Você é o Especialista em Diligência de Alvará. Verifica se a procuração está atualizada e no nome da sociedade antes de pedir expedição. Diligencia no cartório para colocar concluso.',
 240),

('esp_recurso_inominado',
 'Especialista Recurso Inominado',
 'Recursos inominados (todos exceto Agiproteg/Agibank/Facta — esses ficam com o sócio).',
 'specialist', 'recursos', NULL, '#92400E',
 'Você é o Especialista em Recurso Inominado. Atua em todos os temas EXCETO Agiproteg, Agibank e Facta (esses três são do sócio).',
 250),

('esp_contrarrazoes',
 'Especialista Contrarrazões',
 'Contrarrazões à contestação e ao recurso inominado adversário.',
 'specialist', 'recursos', NULL, '#92400E',
 'Você é o Especialista em Contrarrazões. Atua à contestação e ao recurso inominado adversário (exceto Agiproteg/Agibank/Facta).',
 260),

('esp_agravo_interno',
 'Especialista Agravo Interno',
 'Contrarrazões ao agravo interno do réu (prazo 15 dias).',
 'specialist', 'recursos', NULL, '#92400E',
 'Você é o Especialista em Agravo Interno. Contrarrazões ao agravo interno apresentado pelo réu — prazo de 15 dias após propositura.',
 270),

('esp_familia',
 'Especialista Direito de Família',
 'Ciclo completo de família: atendimento, peça inicial, audiência, execução, acompanhamento.',
 'specialist', 'todas', 'familia', '#92400E',
 'Você é o Especialista em Direito de Família. Conduz o ciclo completo (atendimento, petição inicial, audiência, execução, acompanhamento). Temas: divórcio, alimentos, guarda, visitas, partilha, inventário.',
 280),

('mon_execucao_sindicato',
 'Monitor Execução Sindicato',
 'Sequência: Sisbajud → Renajud → Infojud → Serasajud → redirecionamento ao presidente do sindicato.',
 'monitor', 'execucao_sindicato', NULL, '#6B7280',
 'Você é o Monitor da Execução de Sindicato. Acompanha a sequência fixa: Sisbajud → (se negativo) Renajud → (se negativo) Infojud → (se negativo) Serasajud → (se negativo) redirecionamento ao presidente do sindicato. Espelha a planilha externa.',
 290);

-- 9.5. Laura — Previdenciário (7 agentes) ------------------------------------
INSERT INTO public.agent_templates (code, display_name, description, role, stage, area, default_color, default_system_prompt, sort_order) VALUES
('asst_root_previdenciario',
 'Meu Assistente',
 'Raiz pessoal da advogada previdenciária (Laura).',
 'assistant_root', 'todas', 'previdenciario', '#7a7a92',
 'Você é o Meu Assistente da advogada previdenciária. Conduz o ciclo completo da área. Quando estiver de férias, previdenciário pausa até o retorno.',
 300),

('esp_atendimento_previdenciario',
 'Especialista Atendimento Previdenciário',
 'Sondagem e fechamento de novo cliente previdenciário.',
 'specialist', 'atendimento', 'previdenciario', '#92400E',
 'Você é o Especialista em Atendimento Previdenciário. Sondagem inicial, documentos necessários (CTPS, exames, laudos, receitas, histórico INSS).',
 310),

('esp_conf_previdenciario',
 'Especialista Confecção Previdenciário',
 'Petições iniciais previdenciárias.',
 'specialist', 'confeccao', 'previdenciario', '#92400E',
 'Você é o Especialista em Confecção Previdenciária. Aposentadorias, benefícios por incapacidade, pensões, revisões.',
 320),

('esp_protocolo_previdenciario',
 'Especialista Protocolo Previdenciário',
 'Laura protocola o que ela mesma confecciona.',
 'specialist', 'protocolo', 'previdenciario', '#92400E',
 'Você é o Especialista em Protocolo Previdenciário. Laura protocola suas próprias peças (não passa pela Luísa).',
 330),

('esp_audiencia_previdenciaria',
 'Especialista Audiência Previdenciária',
 'Audiências previdenciárias + cobertura de outras áreas em emergência.',
 'specialist', 'audiencia', 'previdenciario', '#92400E',
 'Você é o Especialista em Audiência Previdenciária. Também cobre audiências de outras áreas em emergência.',
 340),

('esp_execucao_previdenciaria',
 'Especialista Execução Previdenciária',
 'Cálculo específico de execução previdenciária.',
 'specialist', 'execucao', 'previdenciario', '#92400E',
 'Você é o Especialista em Execução Previdenciária. Cálculos específicos: atrasados, RMI, juros e correção previdenciária.',
 350),

('mon_docs_medicos',
 'Monitor Documentação Médica/CTPS',
 'Checklist: exames, laudos, receitas, carteiras de trabalho.',
 'monitor', 'confeccao', 'previdenciario', '#6B7280',
 'Você é o Monitor de Documentação Médica e CTPS. Confirma se cada caso previdenciário tem CTPS, exames, laudos e receitas necessárias.',
 360);

-- 9.6. Kailane — Líder Recepção (12 agentes) ---------------------------------
INSERT INTO public.agent_templates (code, display_name, description, role, stage, area, default_color, default_system_prompt, sort_order) VALUES
('asst_root_lider_recepcao',
 'Meu Assistente',
 'Raiz pessoal da líder de recepção (Kailane).',
 'assistant_root', 'recepcao', NULL, '#7a7a92',
 'Você é o Meu Assistente da líder de recepção. Gerencia Taís e Yasmin, organiza o kanban de pendências, valida cadastros da estagiária.',
 370),

('esp_triagem',
 'Especialista Triagem de Cliente Novo',
 'Sondagem inicial via WhatsApp + decisão presencial vs online.',
 'specialist', 'recepcao', NULL, '#92400E',
 'Você é o Especialista em Triagem. Faz sondagem inicial do cliente novo (geralmente por indicação), verifica compatibilidade da demanda, agenda atendimento. Default: presencial. Online só se: mobilidade reduzida, fora de Salvador ou agenda incompatível.',
 380),

('esp_tabela_audiencias',
 'Especialista Tabela de Audiências',
 'Prioridade do dia. Acompanhamento online e presencial.',
 'specialist', 'recepcao', NULL, '#92400E',
 'Você é o Especialista em Tabela de Audiências. Primeira atividade do dia. Identifica audiências online e presenciais, envia links, garante presença, conduz cliente até a sala, opera câmera e áudio.',
 390),

('esp_whatsapp_fila',
 'Especialista WhatsApp',
 'Fila do dia + zerar mensagens da noite anterior antes das 9h.',
 'specialist', 'recepcao', NULL, '#92400E',
 'Você é o Especialista em WhatsApp. Zera a fila da noite anterior antes das 9h. Responde clientes durante o dia. Triagem inicial.',
 400),

('esp_cadastro_projuris_lider',
 'Especialista Cadastro ProJuris',
 'Cadastro de processos, atendimentos, documentos. Valida cadastros da Yasmin.',
 'specialist', 'recepcao', NULL, '#92400E',
 'Você é o Especialista em Cadastro ProJuris. Cria atendimentos, cadastra processos recebidos pela manhã via WhatsApp, anexa documentos. Valida obrigatoriamente cadastros feitos pela Yasmin.',
 410),

('esp_documentacao_geral',
 'Especialista Documentação Geral',
 'Checklist por tipo: ID, CPF, comprovante, extrato Consignado/Vendas, contracheque, contrato, CTPS, docs médicos.',
 'specialist', 'recepcao', NULL, '#92400E',
 'Você é o Especialista em Documentação Geral. Sabe qual documento pedir por tipo de cliente: INSS → extrato Consignado/Vendas; servidor → contracheque; CLT empréstimo → contrato; previdenciário → CTPS + exames + laudos + receitas; sempre → ID + comprovante de endereço.',
 420),

('esp_demandas_admin',
 'Especialista Demandas Administrativas',
 'PROCON, SUSEP, plataformas digitais de reclamação, senha/código INSS.',
 'specialist', 'recepcao', NULL, '#92400E',
 'Você é o Especialista em Demandas Administrativas. Abre reclamações no PROCON, SUSEP e outras plataformas. Solicita senha e código de acesso INSS ao cliente.',
 430),

('esp_lembretes',
 'Especialista Lembretes',
 'Disparos diários, semanais e mensais para clientes.',
 'specialist', 'recepcao', NULL, '#92400E',
 'Você é o Especialista em Lembretes. Dispara lembretes diários (audiência do dia seguinte), semanais e mensais. Reforça horário local e necessidade de aplicativo se audiência online.',
 440),

('esp_captacao_cooperativa',
 'Especialista Captação Cooperativa',
 'Ligações de captação junto à cooperativa. Canal a detalhar.',
 'specialist', 'captacao_cooperativa', NULL, '#92400E',
 'Você é o Especialista em Captação via Cooperativa. Conduz ligações de captação junto à cooperativa parceira.',
 450),

('esp_kanban_pendencias',
 'Especialista Kanban de Pendências',
 'Organiza e resolve pendências do kanban geral externo. Sistema espelha (não substitui).',
 'specialist', 'kanban_pendencias', NULL, '#92400E',
 'Você é o Especialista em Kanban de Pendências. O kanban geral mora em sistema externo; aqui você organiza, distribui e resolve pendências. Cada user_task pode referenciar um cartão via external_kanban_ref.',
 460),

('mon_pendencias_cliente',
 'Monitor Pendências de Cliente',
 'Cobrança ativa de documentos pendentes por cliente.',
 'monitor', 'recepcao', NULL, '#6B7280',
 'Você é o Monitor de Pendências de Cliente. Cobra documentos pendentes ativamente: na mesma semana, sob risco do SLA de 3 dias para protocolo.',
 470),

('mon_equipe_recepcao',
 'Monitor Equipe Recepção',
 'Status de Taís e Yasmin: tarefas abertas, fila, prazo. Exclusivo da líder.',
 'monitor', 'admin_equipe', NULL, '#6B7280',
 'Você é o Monitor da Equipe de Recepção. Acompanha tarefas abertas, fila e prazos de Taís (recepcionista) e Yasmin (estagiária). Exclusivo da líder.',
 480);

-- 9.7. Taís — Recepcionista (9 agentes) — reusa templates da líder ---------
-- (sem agente próprio de Captação Cooperativa nem Monitor Equipe; o resto reaproveita)

-- 9.8. Yasmin — Estagiária (7 agentes) ---------------------------------------
INSERT INTO public.agent_templates (code, display_name, description, role, stage, area, default_color, default_system_prompt, sort_order) VALUES
('asst_root_estagiaria',
 'Meu Assistente',
 'Raiz pessoal da estagiária de recepção (Yasmin).',
 'assistant_root', 'recepcao_supervisionada', NULL, '#7a7a92',
 'Você é o Meu Assistente da estagiária de recepção. Cadastros que você fizer serão validados pela líder. Você pode abrir reclamações em PROCON e SUSEP.',
 490),

('esp_cadastro_projuris_rascunho',
 'Especialista Cadastro ProJuris (Rascunho)',
 'Faz o cadastro mas Kailane valida antes de finalizar.',
 'specialist', 'recepcao_supervisionada', NULL, '#92400E',
 'Você é o Especialista em Cadastro ProJuris (Rascunho). Você cadastra processos recebidos, mas a Kailane precisa validar antes de finalizar.',
 500);
-- Os outros 5 agentes da estagiaria (WhatsApp, Tabela Audiencias, Documentacao, Lembretes, Demandas Admin)
-- reaproveitam templates ja criados via role_agent_matrix.

-- 9.9. Ana Rosa — Financeiro (5 agentes) -------------------------------------
INSERT INTO public.agent_templates (code, display_name, description, role, stage, area, default_color, default_system_prompt, sort_order) VALUES
('asst_root_financeiro',
 'Meu Assistente',
 'Raiz pessoal do financeiro (Ana Rosa).',
 'assistant_root', 'financeiro', NULL, '#7a7a92',
 'Você é o Meu Assistente do financeiro. Conhece os links de pagamento recebidos, os PIX pendentes e os controles mensais.',
 510),

('esp_conferencia_pagamento',
 'Especialista Conferência de Pagamento',
 'Análise processo a processo: sentença, recurso, sucumbência, atualização.',
 'specialist', 'financeiro', NULL, '#92400E',
 'Você é o Especialista em Conferência de Pagamento. Quando um pagamento cai, abre o processo: confere sentença, recurso, sucumbência, atualização. Divide entre cliente e escritório.',
 520),

('esp_cobranca_pix',
 'Especialista Cobrança de PIX',
 'Aciona a recepção para pedir PIX ao cliente.',
 'specialist', 'financeiro', NULL, '#92400E',
 'Você é o Especialista em Cobrança de PIX. Aciona a recepção (preferencialmente líder) para solicitar PIX ao cliente. Acompanha o retorno.',
 530),

('esp_controle_mensal',
 'Especialista Controle Mensal',
 'Pagamentos mensais do escritório.',
 'specialist', 'financeiro', NULL, '#92400E',
 'Você é o Especialista em Controle Mensal. Pagamentos recorrentes do escritório (folha, fornecedores, terceiros).',
 540),

('mon_honorarios',
 'Monitor Honorários',
 'Separação valor cliente / valor escritório (honorário advocatício + sucumbência).',
 'monitor', 'financeiro', NULL, '#6B7280',
 'Você é o Monitor de Honorários. Confere a separação entre valor do cliente e valor do escritório (honorário advocatício + sucumbência).',
 550);

-- ----------------------------------------------------------------------------
-- 10. SEEDS — ROLE_AGENT_MATRIX
-- ----------------------------------------------------------------------------
-- Liga cada role_template aos seus agent_templates para provisionamento V15.

WITH r AS (
  SELECT id, code FROM public.role_templates
), a AS (
  SELECT id, code FROM public.agent_templates
)
INSERT INTO public.role_agent_matrix (role_template_id, agent_template_id, is_default)
SELECT r.id, a.id, true
FROM r, a
WHERE
  -- Sócio: 9 agentes
  (r.code = 'socio' AND a.code IN (
    'ceo_lexforce', 'dir_operacoes', 'dir_juridico_revisao', 'dir_financeiro', 'dir_equipe',
    'esp_execucao', 'esp_alvara', 'esp_recursos_criticos', 'mon_sla_global'
  ))
  -- Ana Cristina: 7 agentes
  OR (r.code = 'adv_confeccao_geral' AND a.code IN (
    'asst_root_confeccao',
    'esp_conf_bancario', 'esp_conf_plano_saude', 'esp_conf_consumidor', 'esp_conf_civil',
    'esp_atendimento_geral', 'mon_andamento_cliente_ana'
  ))
  -- Luísa: 5 agentes
  OR (r.code = 'adv_protocolo' AND a.code IN (
    'asst_root_protocolo',
    'esp_protocolo_projuris', 'esp_protocolo_pje', 'esp_protocolo_projudi',
    'mon_docs_protocolo'
  ))
  -- Daiane: 8 agentes
  OR (r.code = 'adv_audiencia_execucao' AND a.code IN (
    'asst_root_audiencia',
    'esp_audiencia_preparo', 'esp_alvara_diligencia',
    'esp_recurso_inominado', 'esp_contrarrazoes', 'esp_agravo_interno',
    'esp_familia', 'mon_execucao_sindicato'
  ))
  -- Laura: 7 agentes
  OR (r.code = 'adv_previdenciario' AND a.code IN (
    'asst_root_previdenciario',
    'esp_atendimento_previdenciario', 'esp_conf_previdenciario',
    'esp_protocolo_previdenciario', 'esp_audiencia_previdenciaria',
    'esp_execucao_previdenciaria', 'mon_docs_medicos'
  ))
  -- Kailane (líder): 12 agentes
  OR (r.code = 'lider_recepcao' AND a.code IN (
    'asst_root_lider_recepcao',
    'esp_triagem', 'esp_tabela_audiencias', 'esp_whatsapp_fila',
    'esp_cadastro_projuris_lider', 'esp_documentacao_geral', 'esp_demandas_admin',
    'esp_lembretes', 'esp_captacao_cooperativa', 'esp_kanban_pendencias',
    'mon_pendencias_cliente', 'mon_equipe_recepcao'
  ))
  -- Taís (recepcionista): 9 agentes — reusa templates da líder (sem captacao cooperativa nem monitor equipe)
  OR (r.code = 'recepcionista' AND a.code IN (
    'asst_root_lider_recepcao',  -- reusa o template "Meu Assistente" da recepcao
    'esp_triagem', 'esp_tabela_audiencias', 'esp_whatsapp_fila',
    'esp_cadastro_projuris_lider', 'esp_documentacao_geral', 'esp_demandas_admin',
    'esp_lembretes', 'esp_kanban_pendencias', 'mon_pendencias_cliente'
  ))
  -- Yasmin (estagiária): 7 agentes
  OR (r.code = 'estagiaria_recepcao' AND a.code IN (
    'asst_root_estagiaria',
    'esp_whatsapp_fila', 'esp_tabela_audiencias', 'esp_documentacao_geral',
    'esp_lembretes', 'esp_cadastro_projuris_rascunho', 'esp_demandas_admin'
  ))
  -- Ana Rosa (financeiro): 5 agentes
  OR (r.code = 'financeiro' AND a.code IN (
    'asst_root_financeiro',
    'esp_conferencia_pagamento', 'esp_cobranca_pix', 'esp_controle_mensal',
    'mon_honorarios'
  ));
-- audiencia_externa nao tem agentes (Robson sem login)

-- ----------------------------------------------------------------------------
-- 11. SEEDS — TASK_TYPES (66 tipos)
-- ----------------------------------------------------------------------------

INSERT INTO public.task_types (code, display_name, description, stage, area, default_sla_hours, requires_validation, validator_role_code, sort_order) VALUES
-- 11.1 Atendimento (8)
('triagem_whatsapp',                  'Triagem de novo cliente via WhatsApp',           'Sondagem inicial.', 'recepcao', NULL, 4, false, NULL, 10),
('agendar_atendimento',               'Agendar atendimento presencial/online',          'Presencial default; online só com motivo.', 'recepcao', NULL, 24, false, NULL, 20),
('recepcionar_cliente_presencial',    'Recepcionar cliente presencial',                 'Cliente chegou ao escritório.', 'recepcao', NULL, 1, false, NULL, 30),
('cadastro_novo_cliente',             'Cadastro novo cliente no ProJuris',              'Nome, CPF, telefone, endereço, foto ID/comprovante.', 'recepcao', NULL, 2, false, NULL, 40),
('atendimento_juridico_fechamento',   'Atendimento jurídico de fechamento',             'Assina docs, define demanda.', 'atendimento', NULL, 24, false, NULL, 50),
('coleta_documental_inss',            'Coleta documental INSS',                         'Extrato Consignado/Vendas.', 'recepcao', NULL, 2, false, NULL, 60),
('coleta_documental_servidor',        'Coleta documental servidor',                     'Contracheque.', 'recepcao', NULL, 2, false, NULL, 70),
('coleta_documental_previdenciario',  'Coleta documental previdenciário',               'CTPS + exames + laudos + receitas.', 'recepcao', 'previdenciario', 24, false, NULL, 80),

-- 11.2 Confecção (5)
('confeccionar_peca_bancario',        'Confecção de peça bancária',                     '3 dias após documentação completa.', 'confeccao', 'bancario', 72, false, NULL, 90),
('confeccionar_peca_familia',         'Confecção de peça de família',                   'Daiane faz ciclo completo.', 'confeccao', 'familia', 72, false, NULL, 100),
('confeccionar_peca_consumidor',      'Confecção de peça de consumidor',                '3 dias após documentação completa.', 'confeccao', 'consumidor', 72, false, NULL, 110),
('confeccionar_peca_civil',           'Confecção de peça civil',                        '3 dias após documentação completa.', 'confeccao', 'civil', 72, false, NULL, 120),
('confeccionar_peca_plano_saude',     'Confecção de peça de plano de saúde',            '3 dias após documentação completa.', 'confeccao', 'plano_saude', 72, false, NULL, 130),
('confeccionar_peca_previdenciario',  'Confecção de peça previdenciária',               'Laura faz.', 'confeccao', 'previdenciario', 72, false, NULL, 140),
('confeccionar_peca_tributario',      'Confecção de peça tributária',                   'Sócio mesmo faz.', 'confeccao', 'tributario', 72, false, NULL, 150),

-- 11.3 Revisão e Protocolo (3)
('revisar_peca',                      'Revisar peça',                                   'Antes do protocolo. Sócio.', 'revisao', NULL, 24, false, NULL, 160),
('protocolar_peca',                   'Protocolar peça',                                'Em ProJuris/PJe/PROJUDI conforme comarca.', 'protocolo', NULL, 8, false, NULL, 170),
('emendar_inicial',                   'Atender emenda à inicial',                       'Doc desatualizado etc. Prazo do juiz.', 'protocolo', NULL, NULL, false, NULL, 180),

-- 11.4 Audiência (6)
('preparar_tarefa_audiencia',         'Preparar tarefa de audiência',                   'Número, processo, data, horário, link, manifestação.', 'audiencia', NULL, 24, false, NULL, 190),
('audiencia_online_suporte_cliente',  'Suporte a cliente em audiência online',          'Link, ligação, vídeo, presença.', 'recepcao', NULL, 1, false, NULL, 200),
('audiencia_presencial_suporte',      'Suporte a cliente em audiência presencial',      'Sala, link, câmera, áudio.', 'recepcao', NULL, 1, false, NULL, 210),
('realizar_audiencia',                'Realizar audiência',                             'Conduzir o ato.', 'audiencia', NULL, NULL, false, NULL, 220),
('lembrete_audiencia',                'Lembrete de audiência',                          'Véspera 17h.', 'recepcao', NULL, 1, false, NULL, 230),
('justificar_ausencia_cliente',       'Justificar ausência do cliente',                 'Petição em 2 dias úteis.', 'audiencia', NULL, 48, false, NULL, 240),

-- 11.5 Contestação/Impugnação (2)
('impugnar_contestacao',              'Impugnar contestação',                           'Prazo do processo.', 'recursos', NULL, NULL, false, NULL, 250),
('peticao_remarcacao_audiencia',      'Pedir remarcação de audiência',                  'Após justificativa de ausência.', 'audiencia', NULL, NULL, false, NULL, 260),

-- 11.6 Recursos (4)
('recurso_inominado_geral',           'Recurso inominado geral',                        'Daiane. 10 dias.', 'recursos', NULL, 240, false, NULL, 270),
('recurso_inominado_critico',         'Recurso inominado crítico',                      'Agiproteg/Agibank/Facta. Sócio. 10 dias.', 'recursos_criticos', NULL, 240, false, NULL, 280),
('contrarrazoes_recurso_inominado',   'Contrarrazões a recurso inominado',              '10 dias.', 'recursos', NULL, 240, false, NULL, 290),
('contrarrazoes_agravo_interno',      'Contrarrazões a agravo interno',                 '15 dias.', 'recursos', NULL, 360, false, NULL, 300),

-- 11.7 Execução (7)
('peticao_execucao',                  'Petição de execução',                            'Com cálculo + 10% antecipados.', 'execucao', NULL, NULL, false, NULL, 310),
('calcular_dr_calc',                  'Calcular execução no Dr. Calc',                  'Antes da petição.', 'execucao', NULL, NULL, false, NULL, 320),
('peticao_prosseguimento',            'Pedir prosseguimento de execução',               '3 dias / semanal.', 'execucao', NULL, 72, false, NULL, 330),
('peticao_penhora_sisbajud',          'Penhora Sisbajud',                               '1ª etapa.', 'execucao_sindicato', NULL, NULL, false, NULL, 340),
('peticao_penhora_renajud',           'Penhora Renajud',                                '2ª etapa.', 'execucao_sindicato', NULL, NULL, false, NULL, 350),
('peticao_penhora_infojud',           'Penhora Infojud',                                '3ª etapa.', 'execucao_sindicato', NULL, NULL, false, NULL, 360),
('peticao_penhora_serasajud',         'Penhora Serasajud + redirecionamento sindicato', '4ª etapa.', 'execucao_sindicato', NULL, NULL, false, NULL, 370),

-- 11.8 Alvará (3)
('peticao_alvara',                    'Petição de expedição de alvará',                 'Após depósito judicial.', 'alvara', NULL, NULL, false, NULL, 380),
('validar_procuracao_pre_alvara',     'Validar procuração antes do alvará',             'Nome da sociedade, não PF.', 'alvara', NULL, 24, false, NULL, 390),
('diligencia_alvara',                 'Diligência de alvará no cartório',               'Atualizar procuração se necessário.', 'diligencia', NULL, 120, false, NULL, 400),

-- 11.9 Financeiro (5)
('link_pagamento_recebido',           'Registrar link de pagamento recebido',           'Ana Rosa envia link no WhatsApp.', 'financeiro', NULL, 1, false, NULL, 410),
('conferencia_processo_financeiro',   'Conferência financeira do processo',             'Sentença/recurso/sucumbência/atualização.', 'financeiro', NULL, 4, false, NULL, 420),
('solicitar_pix_cliente',             'Solicitar PIX ao cliente',                       'Via recepção.', 'financeiro', NULL, 24, false, NULL, 430),
('repassar_pix_para_financeiro',      'Repassar PIX do cliente ao financeiro',          'Recepção -> financeiro.', 'recepcao', NULL, 4, false, NULL, 440),
('controle_mensal_pagamentos',        'Controle mensal de pagamentos',                  'Pagamentos recorrentes.', 'financeiro', NULL, NULL, false, NULL, 450),

-- 11.10 Administrativo/Cobrança (7)
('cobrar_documento_pendente',         'Cobrar documento pendente do cliente',           'Mesma semana.', 'recepcao', NULL, 96, false, NULL, 460),
('solicitar_senha_inss',              'Solicitar senha do INSS ao cliente',             'Conforme caso.', 'recepcao', NULL, 24, false, NULL, 470),
('solicitar_codigo_acesso_inss',      'Solicitar código de acesso INSS',                'Conforme caso.', 'recepcao', NULL, 24, false, NULL, 480),
('abrir_reclamacao_procon',           'Abrir reclamação PROCON',                        'Líder/recepcionista/estagiária.', 'recepcao', NULL, NULL, false, NULL, 490),
('abrir_reclamacao_susep',            'Abrir reclamação SUSEP',                         'Líder/recepcionista/estagiária.', 'recepcao', NULL, NULL, false, NULL, 500),
('preencher_planilha_admin',          'Preencher planilha administrativa',              'Solicitada pelo sócio/advogada.', 'recepcao', NULL, NULL, false, NULL, 510),
('atender_ligacao_cliente',           'Atender ligação de cliente',                     'Durante o dia.', 'recepcao', NULL, 1, false, NULL, 520),

-- 11.11 Pós-fechamento (4)
('imprimir_contratuais',              'Imprimir contratuais para assinatura',           'Após fechamento com advogado.', 'recepcao', NULL, 1, false, NULL, 530),
('colher_assinatura',                 'Colher assinatura nos contratuais',              'Imediato após impressão.', 'recepcao', NULL, 1, false, NULL, 540),
('digitalizar_anexar_contratuais',    'Digitalizar e anexar contratuais ao ProJuris',   'Mesmo dia.', 'recepcao', NULL, 4, false, NULL, 550),
('entregar_via_cliente',              'Entregar via física ao cliente',                 'Mesmo dia.', 'recepcao', NULL, 4, false, NULL, 560),

-- 11.12 Petições especiais (3)
('peticao_isencao_custas',            'Petição de isenção de custas/multa',             'Gratuidade da justiça.', 'recursos', NULL, NULL, false, NULL, 570),
('analisar_acordo',                   'Analisar acordo proposto pelo réu',              'Decisão final humana.', 'execucao', NULL, NULL, false, NULL, 580),
('protocolar_acordo',                 'Protocolar acordo aceito',                       'Mesmo dia.', 'protocolo', NULL, 8, false, NULL, 590),

-- 11.13 Captação (4)
('captacao_cooperativa_ligacao',      'Ligação de captação via cooperativa',            'Kailane (Taís quando em férias).', 'captacao_cooperativa', NULL, NULL, false, NULL, 600),
('captacao_ressaque',                 'Captação via Ressaque',                          'Plataforma suspensa hoje. Quando voltar.', 'recepcao', NULL, 4, false, NULL, 610),
('captacao_indicacao',                'Sondagem de cliente por indicação',              'Via WhatsApp.', 'recepcao', NULL, 4, false, NULL, 620),
('captacao_reaproveitamento',         'Reaproveitamento de cliente existente',          'Planilhas Bradesco, SUSEP, etc.', 'gestao', NULL, NULL, false, NULL, 630),

-- 11.14 Kanban (4)
('criar_card_kanban',                 'Criar card no kanban de pendências',             'Sistema espelha kanban externo.', 'kanban_pendencias', NULL, 1, false, NULL, 640),
('mover_card_kanban',                 'Mover card no kanban',                           'Mudança de coluna.', 'kanban_pendencias', NULL, 1, false, NULL, 650),
('resolver_pendencia_kanban',         'Resolver pendência do kanban',                   'Encerra card.', 'kanban_pendencias', NULL, NULL, false, NULL, 660),

-- 11.15 Validação (1)
('validar_cadastro_yasmin',           'Validar cadastro feito pela Yasmin',             'Exclusivo da Kailane.', 'admin_equipe', NULL, 8, true, 'lider_recepcao', 670);

-- ----------------------------------------------------------------------------
-- 12. SEEDS — ROLE_TASK_MATRIX
-- ----------------------------------------------------------------------------

WITH r AS (SELECT id, code FROM public.role_templates),
     t AS (SELECT id, code FROM public.task_types)
INSERT INTO public.role_task_matrix (task_type_id, role_template_id, can_execute, can_assign, is_default_assignee)
SELECT t.id, r.id,
       true,                                            -- can_execute default
       (r.code = 'socio' OR r.code = 'lider_recepcao'), -- can_assign so socio e lider
       false                                            -- ajustaremos defaults abaixo
FROM r, t
WHERE
  -- =========== ATENDIMENTO ===========
  (t.code IN ('triagem_whatsapp','agendar_atendimento','recepcionar_cliente_presencial','cadastro_novo_cliente')
    AND r.code IN ('lider_recepcao','recepcionista','estagiaria_recepcao','socio'))
  OR (t.code = 'atendimento_juridico_fechamento'
    AND r.code IN ('socio','adv_confeccao_geral','adv_previdenciario'))
  OR (t.code IN ('coleta_documental_inss','coleta_documental_servidor')
    AND r.code IN ('lider_recepcao','recepcionista','estagiaria_recepcao'))
  OR (t.code = 'coleta_documental_previdenciario'
    AND r.code IN ('lider_recepcao','recepcionista','estagiaria_recepcao','adv_previdenciario'))

  -- =========== CONFECÇÃO ===========
  OR (t.code = 'confeccionar_peca_bancario'        AND r.code IN ('adv_confeccao_geral','socio'))
  OR (t.code = 'confeccionar_peca_familia'         AND r.code IN ('adv_audiencia_execucao','socio'))
  OR (t.code = 'confeccionar_peca_consumidor'      AND r.code IN ('adv_confeccao_geral','socio'))
  OR (t.code = 'confeccionar_peca_civil'           AND r.code IN ('adv_confeccao_geral','socio'))
  OR (t.code = 'confeccionar_peca_plano_saude'     AND r.code IN ('adv_confeccao_geral','socio'))
  OR (t.code = 'confeccionar_peca_previdenciario'  AND r.code IN ('adv_previdenciario','socio'))
  OR (t.code = 'confeccionar_peca_tributario'      AND r.code IN ('socio'))

  -- =========== REVISÃO E PROTOCOLO ===========
  OR (t.code = 'revisar_peca'      AND r.code IN ('socio'))
  OR (t.code = 'protocolar_peca'   AND r.code IN ('adv_protocolo','adv_previdenciario','adv_confeccao_geral','socio'))
  OR (t.code = 'emendar_inicial'   AND r.code IN ('socio','adv_confeccao_geral','adv_previdenciario','adv_audiencia_execucao'))

  -- =========== AUDIÊNCIA ===========
  OR (t.code = 'preparar_tarefa_audiencia'
    AND r.code IN ('socio','adv_audiencia_execucao','adv_previdenciario'))
  OR (t.code IN ('audiencia_online_suporte_cliente','audiencia_presencial_suporte','lembrete_audiencia')
    AND r.code IN ('lider_recepcao','recepcionista','estagiaria_recepcao'))
  OR (t.code = 'realizar_audiencia'
    AND r.code IN ('socio','adv_audiencia_execucao','adv_previdenciario','audiencia_externa'))
  OR (t.code = 'justificar_ausencia_cliente'
    AND r.code IN ('socio','adv_audiencia_execucao'))

  -- =========== CONTESTAÇÃO/IMPUGNAÇÃO ===========
  OR (t.code = 'impugnar_contestacao'           AND r.code IN ('socio','adv_audiencia_execucao'))
  OR (t.code = 'peticao_remarcacao_audiencia'   AND r.code IN ('socio'))

  -- =========== RECURSOS ===========
  OR (t.code = 'recurso_inominado_geral'        AND r.code IN ('adv_audiencia_execucao','socio'))
  OR (t.code = 'recurso_inominado_critico'      AND r.code IN ('socio'))
  OR (t.code = 'contrarrazoes_recurso_inominado' AND r.code IN ('adv_audiencia_execucao','socio'))
  OR (t.code = 'contrarrazoes_agravo_interno'   AND r.code IN ('socio'))

  -- =========== EXECUÇÃO ===========
  OR (t.code IN ('peticao_execucao','calcular_dr_calc')
    AND r.code IN ('socio','adv_previdenciario'))
  OR (t.code = 'peticao_prosseguimento'
    AND r.code IN ('adv_audiencia_execucao','socio'))
  OR (t.code IN ('peticao_penhora_sisbajud','peticao_penhora_renajud','peticao_penhora_infojud','peticao_penhora_serasajud')
    AND r.code IN ('adv_audiencia_execucao'))

  -- =========== ALVARÁ ===========
  OR (t.code IN ('peticao_alvara','validar_procuracao_pre_alvara')
    AND r.code IN ('socio'))
  OR (t.code = 'diligencia_alvara'
    AND r.code IN ('adv_audiencia_execucao'))

  -- =========== FINANCEIRO ===========
  OR (t.code IN ('link_pagamento_recebido','conferencia_processo_financeiro','controle_mensal_pagamentos','solicitar_pix_cliente')
    AND r.code IN ('financeiro','socio'))
  OR (t.code = 'repassar_pix_para_financeiro'
    AND r.code IN ('lider_recepcao','recepcionista','estagiaria_recepcao'))

  -- =========== ADMINISTRATIVO/COBRANÇA ===========
  OR (t.code IN ('cobrar_documento_pendente','solicitar_senha_inss','solicitar_codigo_acesso_inss',
                 'abrir_reclamacao_procon','abrir_reclamacao_susep',
                 'preencher_planilha_admin','atender_ligacao_cliente')
    AND r.code IN ('lider_recepcao','recepcionista','estagiaria_recepcao'))

  -- =========== PÓS-FECHAMENTO ===========
  OR (t.code IN ('imprimir_contratuais','colher_assinatura','digitalizar_anexar_contratuais','entregar_via_cliente')
    AND r.code IN ('lider_recepcao','recepcionista','estagiaria_recepcao'))

  -- =========== PETIÇÕES ESPECIAIS ===========
  OR (t.code = 'peticao_isencao_custas'  AND r.code IN ('socio'))
  OR (t.code = 'analisar_acordo'         AND r.code IN ('socio'))
  OR (t.code = 'protocolar_acordo'       AND r.code IN ('adv_protocolo','adv_previdenciario'))

  -- =========== CAPTAÇÃO ===========
  OR (t.code = 'captacao_cooperativa_ligacao' AND r.code IN ('lider_recepcao','recepcionista'))
  OR (t.code IN ('captacao_ressaque','captacao_indicacao')
    AND r.code IN ('lider_recepcao','recepcionista','estagiaria_recepcao'))
  OR (t.code = 'captacao_reaproveitamento'    AND r.code IN ('socio'))

  -- =========== KANBAN ===========
  OR (t.code IN ('criar_card_kanban','mover_card_kanban','resolver_pendencia_kanban')
    AND r.code IN ('lider_recepcao','recepcionista','estagiaria_recepcao'))

  -- =========== VALIDAÇÃO ===========
  OR (t.code = 'validar_cadastro_yasmin' AND r.code IN ('lider_recepcao'));

-- Marca defaults de assignee (na UI, esse e o "sugerido" quando o socio atribui)
UPDATE public.role_task_matrix rtm
SET is_default_assignee = true
FROM public.task_types tt, public.role_templates rt
WHERE rtm.task_type_id = tt.id AND rtm.role_template_id = rt.id
  AND (
    (tt.code = 'confeccionar_peca_bancario'        AND rt.code = 'adv_confeccao_geral')
    OR (tt.code = 'confeccionar_peca_familia'         AND rt.code = 'adv_audiencia_execucao')
    OR (tt.code = 'confeccionar_peca_consumidor'      AND rt.code = 'adv_confeccao_geral')
    OR (tt.code = 'confeccionar_peca_civil'           AND rt.code = 'adv_confeccao_geral')
    OR (tt.code = 'confeccionar_peca_plano_saude'     AND rt.code = 'adv_confeccao_geral')
    OR (tt.code = 'confeccionar_peca_previdenciario'  AND rt.code = 'adv_previdenciario')
    OR (tt.code = 'confeccionar_peca_tributario'      AND rt.code = 'socio')
    OR (tt.code = 'protocolar_peca'                   AND rt.code = 'adv_protocolo')
    OR (tt.code = 'revisar_peca'                      AND rt.code = 'socio')
    OR (tt.code = 'recurso_inominado_geral'           AND rt.code = 'adv_audiencia_execucao')
    OR (tt.code = 'recurso_inominado_critico'         AND rt.code = 'socio')
    OR (tt.code = 'diligencia_alvara'                 AND rt.code = 'adv_audiencia_execucao')
    OR (tt.code = 'realizar_audiencia'                AND rt.code = 'adv_audiencia_execucao')
    OR (tt.code = 'conferencia_processo_financeiro'   AND rt.code = 'financeiro')
    OR (tt.code = 'cobrar_documento_pendente'         AND rt.code = 'lider_recepcao')
    OR (tt.code = 'captacao_cooperativa_ligacao'      AND rt.code = 'lider_recepcao')
    OR (tt.code = 'validar_cadastro_yasmin'           AND rt.code = 'lider_recepcao')
  );

-- ----------------------------------------------------------------------------
-- 13. SEEDS — CAPTACAO_CANAIS
-- ----------------------------------------------------------------------------

INSERT INTO public.captacao_canais (code, display_name, tipo, description, default_assignee_role_code, is_active) VALUES
('cooperativa', 'Cooperativa',  'cooperativa', 'Captação ativa via cooperativa parceira. Detalhes a serem confirmados pelo sócio.', 'lider_recepcao', true),
('ressaque',    'Ressaque',     'ressaque',    'Plataforma de captação suspensa hoje. Quando voltar, atribuir à recepção.',          'lider_recepcao', false),
('indicacao',   'Indicação',    'indicacao',   'Canal principal atual. Cliente chega por indicação via WhatsApp.',                   'lider_recepcao', true);

-- ----------------------------------------------------------------------------
-- 14. EXTERNAL_COLLABORATORS — Robson (registro inicial)
-- ----------------------------------------------------------------------------

INSERT INTO public.external_collaborators (full_name, role_template_id, notes, is_active)
SELECT 'Robson', rt.id, 'Colaborador externo de audiência. Uso esporádico ("quando precisa"). Comunicação via WhatsApp gerado pelo sistema. Sem login.', true
FROM public.role_templates rt WHERE rt.code = 'audiencia_externa';

-- ----------------------------------------------------------------------------
-- 15. REALTIME PUBLICATION (idempotente)
-- ----------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    -- adiciona tabelas que beneficiam de realtime
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.user_tasks; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.inter_assistant_requests; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.role_coverage; EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 16. COMMENTS PARA DOCUMENTACAO
-- ----------------------------------------------------------------------------

COMMENT ON TABLE public.role_templates           IS 'Catálogo de cargos da empresa. Bacellar Advogados: 10 cargos.';
COMMENT ON TABLE public.agent_templates          IS 'Catálogo de agentes IA disponíveis. ~75 templates seedados.';
COMMENT ON TABLE public.role_agent_matrix        IS 'N:N entre role_templates e agent_templates. Define quem ganha quais agentes na V15.';
COMMENT ON TABLE public.task_types               IS 'Catálogo de tipos de tarefa. 66 tipos.';
COMMENT ON TABLE public.role_task_matrix         IS 'N:N entre task_types e role_templates. Define quem pode executar/atribuir cada tarefa.';
COMMENT ON TABLE public.user_areas               IS 'Áreas jurídicas que cada usuário atende.';
COMMENT ON TABLE public.role_coverage            IS 'Cobertura/backup entre usuários (férias). backup_user_id NULL = pausa.';
COMMENT ON TABLE public.external_collaborators   IS 'Colaboradores sem login (Robson). Tarefas geram mensagem WhatsApp pelo sistema.';
COMMENT ON TABLE public.user_tasks               IS 'Atribuição humano -> humano. Não confundir com agent_tasks (agente -> agente).';
COMMENT ON TABLE public.inter_assistant_requests IS 'Protocolo entre Assistant Roots dos usuários (V19).';
COMMENT ON TABLE public.captacao_canais          IS 'Canais de captação: cooperativa, ressaque, indicação.';

COMMIT;
