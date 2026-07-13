-- 20260713162822_onda2_73_kanban_board_config_scaffold.sql
--
-- ESPELHO de reconciliação repo<->banco (NÃO fazer `db push`).
-- Já aplicada em PRODUÇÃO via MCP (apply_migration):
--     version = 20260713162822
--     name    = onda2_73_kanban_board_config_scaffold
--
-- ONDA 2 · Card 7.3 — config por Kanban (SCAFFOLD).
-- Tabela vazia/inerte até Rodrigo definir prazos por tipo e limiares de criticidade.
-- Etapas por Kanban já são kanban_columns (não recriadas aqui).
-- ============================================================================

create table if not exists public.kanban_board_config (
  id                  uuid primary key default gen_random_uuid(),
  board_id            uuid not null unique references public.kanban_boards(id) on delete cascade,
  prazo_dias          integer,
  responsavel_user_id uuid references auth.users(id),
  criticidade         jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.kanban_board_config is
  'ONDA2/7.3: config por board (prazo/responsável/critérios de criticidade). Valores pendentes (Rodrigo).';

alter table public.kanban_board_config enable row level security;

drop policy if exists "board config select" on public.kanban_board_config;
create policy "board config select"
  on public.kanban_board_config for select to authenticated
  using ( public.kanban_can_access_board(board_id, auth.uid()) );

drop policy if exists "board config admin write" on public.kanban_board_config;
create policy "board config admin write"
  on public.kanban_board_config for all to authenticated
  using ( public.kanban_can_admin(auth.uid()) )
  with check ( public.kanban_can_admin(auth.uid()) );
