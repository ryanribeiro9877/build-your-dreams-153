-- Seed canonico: departments, agents, agent_permissions e reports_to.
-- Esta migracao consolida as duas listas hardcoded (JurisCloudOS.tsx e OrgChart.tsx)
-- numa unica fonte de verdade no banco. A partir daqui, a UI le do Supabase.

-- Pre-requisitos:
-- - Enum agent_role precisa ter 'ceo' (a UI usa). Adicionamos se nao existir.
-- - Adicionar coluna reports_to em agents (existia so na UI).
-- - Adicionar colunas current_tasks / max_concurrent_tasks ja existem.

-- 1) Extensao do enum agent_role para incluir 'ceo'.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'public.agent_role'::regtype AND enumlabel = 'ceo') THEN
    ALTER TYPE public.agent_role ADD VALUE 'ceo' BEFORE 'director';
  END IF;
END$$;

-- 2) Coluna reports_to em agents.
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS external_id integer UNIQUE,
  ADD COLUMN IF NOT EXISTS reports_to integer;

CREATE INDEX IF NOT EXISTS idx_agents_external_id ON public.agents (external_id);
CREATE INDEX IF NOT EXISTS idx_agents_reports_to ON public.agents (reports_to);

-- 3) Idempotencia: limpar seeds anteriores (so seeds, mantem dados de usuario se houver).
DELETE FROM public.agent_permissions WHERE agent_id IN (SELECT id FROM public.agents WHERE external_id IS NOT NULL);
DELETE FROM public.agents WHERE external_id IS NOT NULL;
DELETE FROM public.departments WHERE name IN (
  'assistente','diretoria','eficiencia','conversao','recepcao','marketing','criacao',
  'civel','trabalhista','tributario','protocolo','calculos','audiencias',
  'monitoramento','financeiro','cobrancas','tech','compliance','familia'
);

-- 4) Departamentos.
INSERT INTO public.departments (name, description, color) VALUES
  ('assistente',    'Meu Assistente',                 '#c9a84c'),
  ('diretoria',     'Diretoria / CEO',                '#c9a84c'),
  ('eficiencia',    'Central de Eficiencia',          '#ff6b6b'),
  ('conversao',     'Conversao',                      '#e74c3c'),
  ('recepcao',      'Recepcao',                       '#3b82f6'),
  ('marketing',     'Marketing',                      '#f59e0b'),
  ('criacao',       'Criacao',                        '#e67e22'),
  ('civel',         'Contencioso Civel',              '#8b5cf6'),
  ('trabalhista',   'Contencioso Trabalhista',        '#ef4444'),
  ('tributario',    'Contencioso Tributario',         '#10b981'),
  ('protocolo',     'Protocolo',                      '#6366f1'),
  ('calculos',      'Calculos Juridicos',             '#ec4899'),
  ('audiencias',    'Audiencias',                     '#14b8a6'),
  ('monitoramento', 'Monitoramento Processual',       '#f97316'),
  ('financeiro',    'Financeiro',                     '#2ecc71'),
  ('cobrancas',     'Cobrancas',                      '#84cc16'),
  ('tech',          'Tecnologia',                     '#9b59b6'),
  ('compliance',    'Compliance',                     '#0ea5e9'),
  ('familia',       'Familia e Sucessoes',            '#a855f7');

-- 5) Agentes. external_id = id usado historicamente no front. department_id resolvido por name.
--    Usamos uma CTE para mapear name->id.
WITH d AS (SELECT id, name FROM public.departments)
INSERT INTO public.agents (external_id, name, color, department_id, role, status, can_orchestrate, max_concurrent_tasks, current_tasks, reports_to, description)
SELECT v.external_id, v.name, v.color, d.id, v.role::agent_role, v.status::agent_status,
       v.can_orchestrate, v.max_concurrent_tasks, v.current_tasks, v.reports_to, v.description
FROM (VALUES
  -- CEO
  (0,   'CEO JurisAI',                'diretoria',   '#c9a84c', 'ceo',          'active', true,  20, 8,  NULL::integer, 'Supervisiona todos os diretores e a operacao global'),
  -- Diretores
  (1,   'Diretor de Recepcao',         'recepcao',    '#3b82f6', 'director',     'active', true,  10, 3,  0, 'Diretor da area de recepcao e intake'),
  (9,   'Diretor de Marketing',        'marketing',   '#f59e0b', 'director',     'active', true,  10, 5,  0, 'Diretor de marketing juridico'),
  (102, 'Diretor Contencioso Civel',   'civel',       '#8b5cf6', 'director',     'active', true,  10, 4,  0, 'Diretor do contencioso civel'),
  (104, 'Diretor Cont. Trabalhista',   'trabalhista', '#ef4444', 'director',     'active', true,  10, 3,  0, 'Diretor do contencioso trabalhista'),
  (106, 'Diretor Cont. Tributario',    'tributario',  '#10b981', 'director',     'active', true,  10, 3,  0, 'Diretor do contencioso tributario'),
  (108, 'Diretor de Protocolo',        'protocolo',   '#6366f1', 'director',     'active', true,  10, 4,  0, 'Diretor responsavel por protocolos judiciais'),
  (109, 'Diretor de Calculos',         'calculos',    '#ec4899', 'director',     'active', true,  8,  3,  0, 'Diretor de calculos juridicos'),
  (110, 'Diretor de Audiencias',       'audiencias',  '#14b8a6', 'director',     'active', true,  10, 4,  0, 'Diretor de audiencias'),
  (111, 'Diretor de Monitoramento',    'monitoramento','#f97316','director',     'active', true,  10, 4,  0, 'Diretor de monitoramento processual'),
  (112, 'Diretor Financeiro',          'financeiro',  '#2ecc71', 'director',     'active', true,  10, 5,  0, 'Diretor financeiro'),
  (113, 'Diretor de Compliance',       'compliance',  '#0ea5e9', 'director',     'active', true,  10, 3,  0, 'Diretor de compliance e LGPD'),
  (114, 'Diretor Familia/Sucessoes',   'familia',     '#a855f7', 'director',     'active', true,  10, 3,  0, 'Diretor de familia e sucessoes'),
  (115, 'Diretor Com. ao Cliente',     'recepcao',    '#06b6d4', 'director',     'active', true,  10, 4,  0, 'Diretor de comunicacao com o cliente'),
  (300, 'Diretor de Conversao',        'conversao',   '#e74c3c', 'director',     'active', true,  12, 7,  0, 'Diretor de conversao de leads'),
  (320, 'Diretor de Criacao',          'criacao',     '#e67e22', 'director',     'active', true,  10, 5,  0, 'Diretor de criativo e branding'),
  (330, 'Diretor Tech',                'tech',        '#9b59b6', 'director',     'active', true,  10, 4,  0, 'Diretor de tecnologia'),
  (400, 'Diretor de Eficiencia',       'eficiencia',  '#ff6b6b', 'director',     'active', true,  15, 8,  0, 'Diretor da central de eficiencia'),
  -- Gerentes (subordinados aos diretores)
  (2,   'Ger. Atendimento',            'recepcao',    '#3b82f6', 'manager',      'active', true,  8,  4,  1,   'Gerente de atendimento ao cliente'),
  (100, 'Ger. Intake',                 'recepcao',    '#3b82f6', 'manager',      'active', true,  8,  5,  1,   'Gerente de intake e qualificacao de leads'),
  (10,  'Ger. Campanhas',              'marketing',   '#f59e0b', 'manager',      'active', true,  8,  6,  9,   'Gerente de campanhas de midia'),
  (101, 'Ger. Conteudo',               'marketing',   '#f59e0b', 'manager',      'active', true,  8,  5,  9,   'Gerente de conteudo'),
  (20,  'Ger. Processual Civel',       'civel',       '#8b5cf6', 'manager',      'active', true,  10, 6,  102, 'Gerente processual civel'),
  (103, 'Ger. Analise Civel',          'civel',       '#8b5cf6', 'manager',      'active', true,  8,  5,  102, 'Gerente de analise civel'),
  (28,  'Ger. Processual Trab.',       'trabalhista', '#ef4444', 'manager',      'active', true,  10, 5,  104, 'Gerente processual trabalhista'),
  (34,  'Ger. Processual Tribut.',     'tributario',  '#10b981', 'manager',      'active', true,  10, 4,  106, 'Gerente processual tributario'),
  (40,  'Ger. de Protocolo',           'protocolo',   '#6366f1', 'manager',      'active', true,  10, 6,  108, 'Gerente de protocolo'),
  (46,  'Ger. de Calculos',            'calculos',    '#ec4899', 'manager',      'active', true,  8,  5,  109, 'Gerente de calculos'),
  (51,  'Ger. de Audiencias',          'audiencias',  '#14b8a6', 'manager',      'active', true,  10, 6,  110, 'Gerente de audiencias'),
  (57,  'Ger. de Monitoramento',       'monitoramento','#f97316','manager',      'active', true,  10, 7,  111, 'Gerente de monitoramento'),
  (200, 'Ger. Contas a Pagar',         'financeiro',  '#2ecc71', 'manager',      'active', true,  8,  4,  112, 'Gerente de contas a pagar'),
  (201, 'Ger. Contas a Receber',       'financeiro',  '#2ecc71', 'manager',      'active', true,  8,  5,  112, 'Gerente de contas a receber'),
  (202, 'Ger. Conciliacao',            'financeiro',  '#27ae60', 'manager',      'active', true,  8,  3,  112, 'Gerente de conciliacao'),
  (66,  'Ger. de Compliance',          'compliance',  '#0ea5e9', 'manager',      'active', true,  8,  3,  113, 'Gerente de compliance'),
  (70,  'Ger. de Familia',             'familia',     '#a855f7', 'manager',      'active', true,  10, 5,  114, 'Gerente de familia'),
  (75,  'Ger. Consulta Processual',    'recepcao',    '#06b6d4', 'manager',      'active', true,  8,  5,  115, 'Gerente de consulta processual'),
  (301, 'Ger. Intel. Motores',         'conversao',   '#e74c3c', 'manager',      'active', true,  8,  5,  300, 'Gerente de inteligencia de motores'),
  (302, 'Ger. Omnichannel',            'conversao',   '#c0392b', 'manager',      'active', true,  8,  6,  300, 'Gerente omnichannel'),
  (303, 'Ger. Personalizacao',         'conversao',   '#c0392b', 'manager',      'active', true,  8,  5,  300, 'Gerente de personalizacao'),
  (321, 'Ger. Monit. Concorrencia',    'criacao',     '#e67e22', 'manager',      'active', true,  8,  4,  320, 'Gerente de monitoramento da concorrencia'),
  (322, 'Ger. Estrategia Criativa',    'criacao',     '#d35400', 'manager',      'active', true,  8,  5,  320, 'Gerente de estrategia criativa'),
  (331, 'Ger. Integracoes',            'tech',        '#9b59b6', 'manager',      'alert',  true,  8,  6,  330, 'Gerente de integracoes'),
  (332, 'Ger. Dados Operacionais',     'tech',        '#8e44ad', 'manager',      'active', true,  8,  4,  330, 'Gerente de dados operacionais'),
  (333, 'Ger. Observabilidade',        'tech',        '#8e44ad', 'manager',      'alert',  true,  10, 7,  330, 'Gerente de observabilidade'),
  -- Executores chave
  (3,   'Agente Agendador',            'recepcao',    '#60a5fa', 'executor',     'active', false, 15, 7,  2,   'Agenda compromissos e audiencias'),
  (4,   'Confirmacao de Audiencias',   'audiencias',  '#60a5fa', 'executor',     'active', false, 20, 12, 2,   'Confirma audiencias com clientes e tribunais'),
  (5,   'Coletor de Documentos',       'recepcao',    '#93c5fd', 'executor',     'active', false, 10, 5,  100, 'Solicita e organiza documentos do cliente'),
  (6,   'Atendente WhatsApp',          'recepcao',    '#93c5fd', 'executor',     'active', false, 25, 15, 100, 'Atendimento via WhatsApp'),
  (8,   'Agente de Triagem',           'recepcao',    '#3b82f6', 'specialist',   'active', false, 10, 4,  2,   'Triagem inicial de leads'),
  (22,  'Redator de Peticoes',         'civel',       '#a78bfa', 'executor',     'active', false, 5,  3,  20,  'Redige minutas de peticoes para revisao humana'),
  -- Monitores
  (7,   'Monitor de Novos Clientes',   'recepcao',    '#3b82f6', 'monitor',      'active', false, 20, 8,  100, 'Monitora entrada de novos clientes'),
  (24,  'Monitor de Prazos Civel',     'civel',       '#c4b5fd', 'monitor',      'alert',  false, 50, 35, 20,  'Monitora prazos processuais civel'),
  -- Eficiencia / especialistas detectores
  (401, 'Detector Gargalos Op.',       'eficiencia',  '#ff6b6b', 'specialist',   'active', false, 50, 30, 400, 'Detecta gargalos operacionais'),
  (402, 'Detector Gargalos Mkt',       'eficiencia',  '#ff6b6b', 'specialist',   'active', false, 20, 12, 400, 'Detecta gargalos de marketing'),
  (403, 'Detector Gargalos Custos',    'eficiencia',  '#ff6b6b', 'specialist',   'active', false, 15, 8,  400, 'Detecta gargalos de custos'),
  (404, 'Detector Gargalos Jurid.',    'eficiencia',  '#ff6b6b', 'specialist',   'active', false, 50, 25, 400, 'Detecta gargalos juridicos'),
  (405, 'Otimizador Fluxo',            'eficiencia',  '#ff6b6b', 'specialist',   'active', false, 20, 10, 400, 'Otimiza fluxos de trabalho'),
  (406, 'Monitor KPIs Global',         'eficiencia',  '#ff6b6b', 'monitor',      'active', false, 50, 35, 400, 'Monitora KPIs globais do escritorio')
) AS v(external_id, name, dept_name, color, role, status, can_orchestrate, max_concurrent_tasks, current_tasks, reports_to, description)
JOIN d ON d.name = v.dept_name;

-- 6) Resolver reports_to: hoje guardamos external_id do superior; populamos o FK real depois.
--    Como agents.reports_to e integer (external_id), a UI usa direto. Sem FK.

-- 7) Permissoes por role.
--    CEO/director: read,write,approve,execute,admin
--    manager: read,write,approve
--    specialist: read,monitor,execute
--    monitor: read,monitor
--    executor: read,write
--    reviewer: read,write,approve
INSERT INTO public.agent_permissions (agent_id, permission)
SELECT a.id, p.permission::permission_type
FROM public.agents a
CROSS JOIN LATERAL (
  SELECT unnest(CASE a.role
    WHEN 'ceo'        THEN ARRAY['read','write','approve','execute','admin','monitor']
    WHEN 'director'   THEN ARRAY['read','write','approve','admin']
    WHEN 'manager'    THEN ARRAY['read','write','approve']
    WHEN 'specialist' THEN ARRAY['read','monitor','execute']
    WHEN 'monitor'    THEN ARRAY['read','monitor']
    WHEN 'executor'   THEN ARRAY['read','write']
    WHEN 'reviewer'   THEN ARRAY['read','write','approve']
    ELSE ARRAY['read']
  END) AS permission
) p
WHERE a.external_id IS NOT NULL;

-- 8) Permissoes especificas adicionais por departamento.
INSERT INTO public.agent_permissions (agent_id, permission)
SELECT a.id, 'petition'::permission_type
FROM public.agents a
JOIN public.departments d ON d.id = a.department_id
WHERE d.name = 'civel' AND a.role IN ('director','manager','executor')
ON CONFLICT (agent_id, permission) DO NOTHING;

INSERT INTO public.agent_permissions (agent_id, permission)
SELECT a.id, 'calculate'::permission_type
FROM public.agents a
JOIN public.departments d ON d.id = a.department_id
WHERE d.name = 'calculos'
ON CONFLICT (agent_id, permission) DO NOTHING;

INSERT INTO public.agent_permissions (agent_id, permission)
SELECT a.id, 'protocol'::permission_type
FROM public.agents a
JOIN public.departments d ON d.id = a.department_id
WHERE d.name = 'protocolo'
ON CONFLICT (agent_id, permission) DO NOTHING;

INSERT INTO public.agent_permissions (agent_id, permission)
SELECT a.id, 'schedule'::permission_type
FROM public.agents a
JOIN public.departments d ON d.id = a.department_id
WHERE d.name IN ('audiencias','recepcao')
ON CONFLICT (agent_id, permission) DO NOTHING;

INSERT INTO public.agent_permissions (agent_id, permission)
SELECT a.id, 'contact_client'::permission_type
FROM public.agents a
WHERE a.name IN ('Atendente WhatsApp','Coletor de Documentos','Confirmacao de Audiencias')
ON CONFLICT (agent_id, permission) DO NOTHING;
