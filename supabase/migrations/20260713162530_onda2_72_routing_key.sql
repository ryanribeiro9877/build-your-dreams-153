-- 20260713162530_onda2_72_routing_key.sql
--
-- ESPELHO de reconciliação repo<->banco (NÃO fazer `db push`).
-- Já aplicada em PRODUÇÃO via MCP (apply_migration):
--     version = 20260713162530
--     name    = onda2_72_routing_key
--
-- ONDA 2 · Card 7.2 — chave de roteamento.
-- (a) o caso (processes) passa a carregar o tipo de ação (antes nada roteado carregava tipo).
-- (b) tipos_acao.default_task_type_id = alvo do roteamento (qual task_type o card recebe).
-- ============================================================================

alter table public.processes
  add column if not exists tipo_acao_id uuid references public.tipos_acao(id);

create index if not exists idx_processes_tipo_acao_id
  on public.processes(tipo_acao_id);

alter table public.tipos_acao
  add column if not exists default_task_type_id uuid references public.task_types(id);

comment on column public.processes.tipo_acao_id is
  'ONDA2/7.2: tipo de ação do caso (chave de roteamento p/ board tipado). Setado por IA (sugestão) e/ou recepção (confirmação).';
comment on column public.tipos_acao.default_task_type_id is
  'ONDA2/7.2: task_type atribuído ao card criado por distribuir_caso quando o chamador não informa p_task_type_id.';
