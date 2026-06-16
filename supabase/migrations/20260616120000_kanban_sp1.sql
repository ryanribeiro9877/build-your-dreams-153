-- ============================================================================
-- KANBAN CONFIGURÁVEL (SP1) — Model B (boards/colunas por SITUAÇÃO)
-- ============================================================================
-- Introduz um modelo de duas camadas:
--   * STATUS (user_task_status, 8 valores) = verdade operacional/V18 (preservado)
--   * SITUAÇÃO (task_situacao, 5 valores)   = visão de quadro do usuário
-- O usuário monta quadros (kanban_boards) com colunas (kanban_columns), cada
-- coluna ancorada numa SITUAÇÃO. Cards (kanban_card_placements) referenciam
-- user_tasks e guardam só posição/coluna; a SITUAÇÃO vive em user_tasks.situacao
-- e é derivada do STATUS por trigger. Mover um card recalcula o STATUS
-- representativo SEM destruir desvios V18 (awaiting_validation, etc).
--
-- Idempotente: CREATE ... IF NOT EXISTS / CREATE OR REPLACE / DROP IF EXISTS /
-- guardas DO $$ pra ENUM e coluna. Todas as RPCs SECURITY DEFINER, search_path
-- fixo, null-check de auth.uid(), gate via RAISE EXCEPTION, REVOKE ALL FROM
-- PUBLIC + GRANT EXECUTE TO authenticated.
--
-- DEPRECAÇÃO (NÃO dropado nesta migration — ver bloco final):
--   get_kanban_board(boolean) [Model A], advance_user_task,
--   kanban_next_stage, kanban_stage_owner_role.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- (1) ENUM task_situacao — as 5 situações de quadro
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE t.typname = 'task_situacao' AND n.nspname = 'public') THEN
    CREATE TYPE public.task_situacao AS ENUM (
      'pendente',
      'em_execucao',
      'concluida_sucesso',
      'concluida_sem_sucesso',
      'cancelado'
    );
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- (2) kanban_situacao_from_status(user_task_status) -> task_situacao
-- ----------------------------------------------------------------------------
-- Mapa canônico 8 STATUS -> 5 SITUAÇÃO (modelo duplo do contrato). 'completed'
-- sai como concluida_sucesso por padrão; o desvio para concluida_sem_sucesso
-- depende de payload.outcome e é tratado no trigger (esta função só vê status).
CREATE OR REPLACE FUNCTION public.kanban_situacao_from_status(p_status public.user_task_status)
RETURNS public.task_situacao
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (CASE p_status
    WHEN 'draft'               THEN 'pendente'
    WHEN 'assigned'            THEN 'pendente'
    WHEN 'in_progress'         THEN 'em_execucao'
    WHEN 'awaiting_external'   THEN 'em_execucao'
    WHEN 'awaiting_validation' THEN 'em_execucao'
    WHEN 'blocked'             THEN 'em_execucao'
    WHEN 'completed'           THEN 'concluida_sucesso'
    WHEN 'cancelled'           THEN 'cancelado'
    ELSE 'pendente'
  END)::public.task_situacao;
$$;

GRANT EXECUTE ON FUNCTION public.kanban_situacao_from_status(public.user_task_status) TO authenticated;

COMMENT ON FUNCTION public.kanban_situacao_from_status(public.user_task_status) IS
  'Mapa 8->5: STATUS operacional -> SITUAÇÃO de quadro. completed -> concluida_sucesso (desvio sem_sucesso fica no trigger via payload.outcome).';

-- ----------------------------------------------------------------------------
-- (3) user_tasks.situacao — coluna nova + índice + backfill
-- ----------------------------------------------------------------------------
-- Adiciona a SITUAÇÃO derivada na própria tarefa (default pendente).
ALTER TABLE public.user_tasks
  ADD COLUMN IF NOT EXISTS situacao public.task_situacao NOT NULL DEFAULT 'pendente';

CREATE INDEX IF NOT EXISTS user_tasks_situacao_idx ON public.user_tasks (situacao);

-- Backfill: deriva do status atual, respeitando o desvio concluida_sem_sucesso
-- quando payload.outcome = 'sem_sucesso' e o status é completed.
UPDATE public.user_tasks ut
SET situacao = CASE
    WHEN ut.status = 'completed' AND (ut.payload->>'outcome') = 'sem_sucesso'
      THEN 'concluida_sem_sucesso'::public.task_situacao
    ELSE public.kanban_situacao_from_status(ut.status)
  END
WHERE ut.situacao IS DISTINCT FROM (CASE
    WHEN ut.status = 'completed' AND (ut.payload->>'outcome') = 'sem_sucesso'
      THEN 'concluida_sem_sucesso'::public.task_situacao
    ELSE public.kanban_situacao_from_status(ut.status)
  END);

-- ----------------------------------------------------------------------------
-- (4) Tabelas novas do Kanban configurável + índices
-- ----------------------------------------------------------------------------

-- Quadro: pertence a um dono; privado por padrão. Flags de exibição (ocultar
-- concluídos após N dias, cards simplificados) e ordem de listagem.
CREATE TABLE IF NOT EXISTS public.kanban_boards (
  id                       UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name                     TEXT NOT NULL,
  owner_user_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_private               BOOLEAN NOT NULL DEFAULT true,
  hide_completed_after_days INTEGER,
  simplified_cards         BOOLEAN NOT NULL DEFAULT false,
  sort_order               INTEGER NOT NULL DEFAULT 100,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kanban_boards_owner_idx ON public.kanban_boards (owner_user_id);

-- Coluna do quadro: ancorada numa SITUAÇÃO; ordem por position.
CREATE TABLE IF NOT EXISTS public.kanban_columns (
  id          UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  board_id    UUID NOT NULL REFERENCES public.kanban_boards(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  situacao    public.task_situacao NOT NULL,
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kanban_columns_board_idx ON public.kanban_columns (board_id, position);

-- Posicionamento de um card (user_task) num quadro/coluna. UNIQUE(user_task_id):
-- cada tarefa aparece em no máximo um quadro por vez (placement único).
CREATE TABLE IF NOT EXISTS public.kanban_card_placements (
  id           UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  board_id     UUID NOT NULL REFERENCES public.kanban_boards(id) ON DELETE CASCADE,
  column_id    UUID NOT NULL REFERENCES public.kanban_columns(id) ON DELETE CASCADE,
  user_task_id UUID NOT NULL REFERENCES public.user_tasks(id) ON DELETE CASCADE,
  position     INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT kanban_card_placements_task_uq UNIQUE (user_task_id)
);
CREATE INDEX IF NOT EXISTS kanban_card_placements_board_idx  ON public.kanban_card_placements (board_id);
CREATE INDEX IF NOT EXISTS kanban_card_placements_column_idx ON public.kanban_card_placements (column_id, position);

-- Favoritos por usuário (PK composta).
CREATE TABLE IF NOT EXISTS public.kanban_board_favorites (
  board_id   UUID NOT NULL REFERENCES public.kanban_boards(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (board_id, user_id)
);

-- Concessões de acesso a quadro não-privado: por usuário OU por cargo (code).
-- CHECK garante ao menos um dos dois preenchido.
CREATE TABLE IF NOT EXISTS public.kanban_board_grants (
  id               UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  board_id         UUID NOT NULL REFERENCES public.kanban_boards(id) ON DELETE CASCADE,
  grantee_user_id  UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  grantee_role_code TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT kanban_board_grants_target_chk
    CHECK (grantee_user_id IS NOT NULL OR grantee_role_code IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS kanban_board_grants_board_idx ON public.kanban_board_grants (board_id);
CREATE INDEX IF NOT EXISTS kanban_board_grants_user_idx  ON public.kanban_board_grants (grantee_user_id) WHERE grantee_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS kanban_board_grants_role_idx  ON public.kanban_board_grants (grantee_role_code) WHERE grantee_role_code IS NOT NULL;

-- updated_at automático (reaproveita a função padrão do projeto).
DROP TRIGGER IF EXISTS trg_kanban_boards_updated ON public.kanban_boards;
CREATE TRIGGER trg_kanban_boards_updated BEFORE UPDATE ON public.kanban_boards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_kanban_columns_updated ON public.kanban_columns;
CREATE TRIGGER trg_kanban_columns_updated BEFORE UPDATE ON public.kanban_columns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_kanban_card_placements_updated ON public.kanban_card_placements;
CREATE TRIGGER trg_kanban_card_placements_updated BEFORE UPDATE ON public.kanban_card_placements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- (6) Helpers de gate (definidos antes das policies/RPCs que os usam)
-- ----------------------------------------------------------------------------

-- Quem pode CONFIGURAR quadros (create/update/delete/columns/grants).
CREATE OR REPLACE FUNCTION public.kanban_can_admin(p_uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_master_admin(p_uid) OR public.has_role(p_uid, 'admin');
$$;

GRANT EXECUTE ON FUNCTION public.kanban_can_admin(UUID) TO authenticated;

COMMENT ON FUNCTION public.kanban_can_admin(UUID) IS
  'Gate de configuração de quadros: is_master_admin OU has_role(admin).';

-- Quem pode VER/MOVER num quadro: admin, dono, ou (board não-privado +
-- concessão por usuário/cargo).
CREATE OR REPLACE FUNCTION public.kanban_can_access_board(p_board_id UUID, p_uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.kanban_boards b
    WHERE b.id = p_board_id
      AND (
        public.kanban_can_admin(p_uid)
        OR b.owner_user_id = p_uid
        -- Quadro público: qualquer autenticado acessa.
        OR b.is_private = false
        -- Quadro privado: precisa de concessão (por usuário ou por cargo).
        OR EXISTS (
            SELECT 1 FROM public.kanban_board_grants g
            WHERE g.board_id = b.id
              AND (
                g.grantee_user_id = p_uid
                OR (g.grantee_role_code IS NOT NULL AND g.grantee_role_code IN (
                  SELECT rt.code FROM public.profiles p
                  JOIN public.role_templates rt ON rt.id = p.role_template_id
                  WHERE p.user_id = p_uid
                ))
              )
        )
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.kanban_can_access_board(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION public.kanban_can_access_board(UUID, UUID) IS
  'Acesso de leitura/movimentação a um quadro: admin, dono, ou concessão (usuário/cargo) em quadro não-privado.';

-- ----------------------------------------------------------------------------
-- (5) RLS — habilita e cria policies
-- ----------------------------------------------------------------------------
-- Observação: as RPCs (SECURITY DEFINER) são o caminho oficial de escrita.
-- As policies abaixo definem o que é visível/escrevível por acesso direto à
-- tabela (PostgREST), refletindo o gate: ver por acesso, escrever só admin;
-- colunas/placements/grants derivam do board; favoritos só do próprio usuário.

ALTER TABLE public.kanban_boards          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kanban_columns         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kanban_card_placements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kanban_board_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kanban_board_grants    ENABLE ROW LEVEL SECURITY;

-- boards: SELECT por acesso; escrita só admin.
DROP POLICY IF EXISTS "kanban_boards read by access" ON public.kanban_boards;
CREATE POLICY "kanban_boards read by access" ON public.kanban_boards FOR SELECT TO authenticated
  USING (public.kanban_can_access_board(id, auth.uid()));
DROP POLICY IF EXISTS "kanban_boards write admin" ON public.kanban_boards;
CREATE POLICY "kanban_boards write admin" ON public.kanban_boards FOR ALL TO authenticated
  USING (public.kanban_can_admin(auth.uid()))
  WITH CHECK (public.kanban_can_admin(auth.uid()));

-- columns: derivam do board (visíveis se o board é acessível; escrita só admin).
DROP POLICY IF EXISTS "kanban_columns read by board access" ON public.kanban_columns;
CREATE POLICY "kanban_columns read by board access" ON public.kanban_columns FOR SELECT TO authenticated
  USING (public.kanban_can_access_board(board_id, auth.uid()));
DROP POLICY IF EXISTS "kanban_columns write admin" ON public.kanban_columns;
CREATE POLICY "kanban_columns write admin" ON public.kanban_columns FOR ALL TO authenticated
  USING (public.kanban_can_admin(auth.uid()))
  WITH CHECK (public.kanban_can_admin(auth.uid()));

-- placements: leitura/escrita por quem tem acesso ao board (mover card).
DROP POLICY IF EXISTS "kanban_placements read by board access" ON public.kanban_card_placements;
CREATE POLICY "kanban_placements read by board access" ON public.kanban_card_placements FOR SELECT TO authenticated
  USING (public.kanban_can_access_board(board_id, auth.uid()));
DROP POLICY IF EXISTS "kanban_placements write by board access" ON public.kanban_card_placements;
CREATE POLICY "kanban_placements write by board access" ON public.kanban_card_placements FOR ALL TO authenticated
  USING (public.kanban_can_access_board(board_id, auth.uid()))
  WITH CHECK (public.kanban_can_access_board(board_id, auth.uid()));

-- grants: visíveis a quem acessa o board; escrita só admin.
DROP POLICY IF EXISTS "kanban_grants read by board access" ON public.kanban_board_grants;
CREATE POLICY "kanban_grants read by board access" ON public.kanban_board_grants FOR SELECT TO authenticated
  USING (public.kanban_can_access_board(board_id, auth.uid()));
DROP POLICY IF EXISTS "kanban_grants write admin" ON public.kanban_board_grants;
CREATE POLICY "kanban_grants write admin" ON public.kanban_board_grants FOR ALL TO authenticated
  USING (public.kanban_can_admin(auth.uid()))
  WITH CHECK (public.kanban_can_admin(auth.uid()));

-- favorites: só do próprio usuário.
DROP POLICY IF EXISTS "kanban_favorites own" ON public.kanban_board_favorites;
CREATE POLICY "kanban_favorites own" ON public.kanban_board_favorites FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- (7) RPCs — todas SECURITY DEFINER, search_path fixo, null-check, gate.
-- ----------------------------------------------------------------------------

-- get_kanban_boards() — lista quadros visíveis ao usuário + meta (favorito,
-- contagem de cards, é dono). Ordena por sort_order e nome.
CREATE OR REPLACE FUNCTION public.get_kanban_boards()
RETURNS TABLE (
  id UUID,
  name TEXT,
  owner_user_id UUID,
  is_private BOOLEAN,
  hide_completed_after_days INTEGER,
  simplified_cards BOOLEAN,
  sort_order INTEGER,
  is_owner BOOLEAN,
  is_favorite BOOLEAN,
  can_admin BOOLEAN,
  card_count INTEGER,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'get_kanban_boards: não autenticado';
  END IF;

  RETURN QUERY
  SELECT
    b.id, b.name, b.owner_user_id, b.is_private, b.hide_completed_after_days,
    b.simplified_cards, b.sort_order,
    (b.owner_user_id = v_uid) AS is_owner,
    EXISTS (SELECT 1 FROM public.kanban_board_favorites f
            WHERE f.board_id = b.id AND f.user_id = v_uid) AS is_favorite,
    public.kanban_can_admin(v_uid) AS can_admin,
    (SELECT count(*)::INTEGER FROM public.kanban_card_placements cp
     WHERE cp.board_id = b.id) AS card_count,
    b.created_at, b.updated_at
  FROM public.kanban_boards b
  WHERE public.kanban_can_access_board(b.id, v_uid)
  ORDER BY b.sort_order ASC, b.name ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_kanban_boards() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_kanban_boards() TO authenticated;

-- get_kanban_board(p_board_id) — detalhe de um quadro: metadados + colunas +
-- cards enriquecidos. JOINs em clients/processes/profiles devolvem labels.
-- Card traz: full_name do cliente, process_number, nome + iniciais do
-- responsável, etiqueta de origem (payload.source ou tipo), situacao, status,
-- priority, deadline, is_overdue, awaiting_role, column_id, position.
-- Retorna 1 linha por COLUNA-ou-CARD num formato "rows" via JSON agregado.
DROP FUNCTION IF EXISTS public.get_kanban_board(uuid);
CREATE FUNCTION public.get_kanban_board(p_board_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_board public.kanban_boards;
  v_columns jsonb;
  v_cards jsonb;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'get_kanban_board: não autenticado';
  END IF;

  IF NOT public.kanban_can_access_board(p_board_id, v_uid) THEN
    RAISE EXCEPTION 'get_kanban_board: acesso restrito';
  END IF;

  SELECT * INTO v_board FROM public.kanban_boards WHERE id = p_board_id;
  IF v_board.id IS NULL THEN
    RAISE EXCEPTION 'get_kanban_board: quadro não encontrado';
  END IF;

  -- Colunas ordenadas.
  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'id', c.id,
             'name', c.name,
             'situacao', c.situacao,
             'position', c.position
           ) ORDER BY c.position ASC, c.created_at ASC
         ), '[]'::jsonb)
  INTO v_columns
  FROM public.kanban_columns c
  WHERE c.board_id = p_board_id;

  -- Cards enriquecidos. Iniciais do responsável calculadas no SQL.
  SELECT COALESCE(jsonb_agg(card ORDER BY card->>'situacao', (card->>'position')::int, card->>'created_at'), '[]'::jsonb)
  INTO v_cards
  FROM (
    SELECT jsonb_build_object(
      'id', ut.id,                 -- KanbanCardV2.id = user_task_id (usado como draggableId e em moveCard)
      'placement_id', cp.id,
      'user_task_id', ut.id,
      'column_id', cp.column_id,
      'position', cp.position,
      'title', ut.title,
      'situacao', ut.situacao,
      'status', ut.status,
      'priority', ut.priority,
      'area', ut.area,
      'deadline_at', ut.deadline_at,
      'is_overdue', (ut.deadline_at IS NOT NULL AND ut.deadline_at < now()
                     AND ut.status NOT IN ('completed','cancelled')),
      'awaiting_role', (ut.payload->>'awaiting_role'),
      'client_id', ut.client_id,
      'client_name', cl.full_name,
      'process_id', ut.process_id,
      'process_number', pr.process_number,
      'assignee_user_id', ut.assignee_user_id,
      'assignee_name', COALESCE(pa.full_name, pa.display_name, '—'),
      'assignee_initials', (
        CASE
          WHEN COALESCE(pa.full_name, pa.display_name) IS NULL THEN '—'
          ELSE upper(
            COALESCE(
              substring(split_part(trim(COALESCE(pa.full_name, pa.display_name)), ' ', 1) FROM 1 FOR 1), ''
            ) ||
            COALESCE(
              NULLIF(substring(
                regexp_replace(trim(COALESCE(pa.full_name, pa.display_name)), '^\S+\s*', '')
                FROM 1 FOR 1
              ), ''),
              ''
            )
          )
        END
      ),
      'source_label', COALESCE(ut.payload->>'source', tt.display_name),
      'task_type_label', tt.display_name,
      'created_at', ut.created_at
    ) AS card
    FROM public.kanban_card_placements cp
    JOIN public.user_tasks ut ON ut.id = cp.user_task_id
    JOIN public.task_types tt ON tt.id = ut.task_type_id
    LEFT JOIN public.clients cl ON cl.id = ut.client_id
    LEFT JOIN public.processes pr ON pr.id = ut.process_id
    LEFT JOIN public.profiles pa ON pa.user_id = ut.assignee_user_id
    WHERE cp.board_id = p_board_id
      AND (
        v_board.hide_completed_after_days IS NULL
        OR ut.situacao NOT IN ('concluida_sucesso','concluida_sem_sucesso','cancelado')
        OR ut.updated_at >= now() - (v_board.hide_completed_after_days || ' days')::interval
      )
  ) sub;

  RETURN jsonb_build_object(
    'board', jsonb_build_object(
      'id', v_board.id,
      'name', v_board.name,
      'owner_user_id', v_board.owner_user_id,
      'is_private', v_board.is_private,
      'hide_completed_after_days', v_board.hide_completed_after_days,
      'simplified_cards', v_board.simplified_cards,
      'sort_order', v_board.sort_order,
      'is_owner', (v_board.owner_user_id = v_uid),
      'can_admin', public.kanban_can_admin(v_uid),
      'is_favorite', EXISTS (SELECT 1 FROM public.kanban_board_favorites f
                             WHERE f.board_id = v_board.id AND f.user_id = v_uid),
      'card_count', (SELECT count(*)::INTEGER FROM public.kanban_card_placements cp
                     WHERE cp.board_id = v_board.id),
      'grant_user_ids', COALESCE((SELECT jsonb_agg(g.grantee_user_id)
                                  FROM public.kanban_board_grants g
                                  WHERE g.board_id = v_board.id AND g.grantee_user_id IS NOT NULL),
                                 '[]'::jsonb),
      'grant_role_codes', COALESCE((SELECT jsonb_agg(g.grantee_role_code)
                                    FROM public.kanban_board_grants g
                                    WHERE g.board_id = v_board.id AND g.grantee_role_code IS NOT NULL),
                                   '[]'::jsonb),
      'created_at', v_board.created_at,
      'updated_at', v_board.updated_at
    ),
    'columns', v_columns,
    'cards', v_cards
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_kanban_board(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_kanban_board(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_kanban_board(uuid) IS
  'Detalhe do quadro (Model B): board + colunas + cards enriquecidos (cliente, processo, responsável com iniciais, origem, situacao, status, deadline). Gate kanban_can_access_board.';

-- kanban_create_board — só admin. Cria o quadro do owner = caller.
CREATE OR REPLACE FUNCTION public.kanban_create_board(
  p_name TEXT,
  p_is_private BOOLEAN DEFAULT true,
  p_hide_completed_after_days INTEGER DEFAULT NULL,
  p_simplified_cards BOOLEAN DEFAULT false
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_board_id UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'kanban_create_board: não autenticado';
  END IF;
  IF NOT public.kanban_can_admin(v_uid) THEN
    RAISE EXCEPTION 'kanban_create_board: apenas administradores podem configurar quadros';
  END IF;
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'kanban_create_board: nome obrigatório';
  END IF;

  INSERT INTO public.kanban_boards (name, owner_user_id, is_private, hide_completed_after_days, simplified_cards)
  VALUES (trim(p_name), v_uid, COALESCE(p_is_private, true), p_hide_completed_after_days, COALESCE(p_simplified_cards, false))
  RETURNING id INTO v_board_id;

  -- Colunas padrão: uma por SITUAÇÃO (na ordem canônica do quadro).
  INSERT INTO public.kanban_columns (board_id, name, situacao, position) VALUES
    (v_board_id, 'Pendente',              'pendente',              0),
    (v_board_id, 'Em execução',           'em_execucao',           1),
    (v_board_id, 'Concluída (sucesso)',   'concluida_sucesso',     2),
    (v_board_id, 'Concluída (sem sucesso)','concluida_sem_sucesso', 3),
    (v_board_id, 'Cancelada',             'cancelado',             4);

  RETURN v_board_id;
END;
$$;

REVOKE ALL ON FUNCTION public.kanban_create_board(TEXT, BOOLEAN, INTEGER, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kanban_create_board(TEXT, BOOLEAN, INTEGER, BOOLEAN) TO authenticated;

-- kanban_update_board — só admin. Atualiza metadados do quadro.
CREATE OR REPLACE FUNCTION public.kanban_update_board(
  p_board_id UUID,
  p_name TEXT,
  p_is_private BOOLEAN,
  p_hide_completed_after_days INTEGER,
  p_simplified_cards BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'kanban_update_board: não autenticado';
  END IF;
  IF NOT public.kanban_can_admin(v_uid) THEN
    RAISE EXCEPTION 'kanban_update_board: apenas administradores podem configurar quadros';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.kanban_boards WHERE id = p_board_id) THEN
    RAISE EXCEPTION 'kanban_update_board: quadro não encontrado';
  END IF;

  UPDATE public.kanban_boards
  SET name = COALESCE(NULLIF(trim(p_name), ''), name),
      is_private = COALESCE(p_is_private, is_private),
      hide_completed_after_days = p_hide_completed_after_days,
      simplified_cards = COALESCE(p_simplified_cards, simplified_cards),
      updated_at = now()
  WHERE id = p_board_id;
END;
$$;

REVOKE ALL ON FUNCTION public.kanban_update_board(UUID, TEXT, BOOLEAN, INTEGER, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kanban_update_board(UUID, TEXT, BOOLEAN, INTEGER, BOOLEAN) TO authenticated;

-- kanban_delete_board — só admin. Cascade remove colunas/placements/grants/favoritos.
CREATE OR REPLACE FUNCTION public.kanban_delete_board(p_board_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'kanban_delete_board: não autenticado';
  END IF;
  IF NOT public.kanban_can_admin(v_uid) THEN
    RAISE EXCEPTION 'kanban_delete_board: apenas administradores podem configurar quadros';
  END IF;

  DELETE FROM public.kanban_boards WHERE id = p_board_id;
END;
$$;

REVOKE ALL ON FUNCTION public.kanban_delete_board(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kanban_delete_board(UUID) TO authenticated;

-- kanban_set_columns — só admin. Substitui o conjunto de colunas do quadro
-- a partir de um jsonb [{id?, name, situacao, position}]. Faz upsert por id
-- (quando enviado) e remove colunas omitidas. Cada coluna precisa de uma
-- SITUAÇÃO válida.
CREATE OR REPLACE FUNCTION public.kanban_set_columns(
  p_board_id UUID,
  p_columns JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_keep UUID[] := ARRAY[]::UUID[];
  v_elem JSONB;
  v_id UUID;
  v_name TEXT;
  v_situacao public.task_situacao;
  v_position INTEGER;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'kanban_set_columns: não autenticado';
  END IF;
  IF NOT public.kanban_can_admin(v_uid) THEN
    RAISE EXCEPTION 'kanban_set_columns: apenas administradores podem configurar quadros';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.kanban_boards WHERE id = p_board_id) THEN
    RAISE EXCEPTION 'kanban_set_columns: quadro não encontrado';
  END IF;
  IF p_columns IS NULL OR jsonb_typeof(p_columns) <> 'array' THEN
    RAISE EXCEPTION 'kanban_set_columns: p_columns deve ser um array JSON';
  END IF;

  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_columns)
  LOOP
    v_name := NULLIF(trim(COALESCE(v_elem->>'name', '')), '');
    IF v_name IS NULL THEN
      RAISE EXCEPTION 'kanban_set_columns: coluna sem nome';
    END IF;
    IF (v_elem->>'situacao') IS NULL THEN
      RAISE EXCEPTION 'kanban_set_columns: coluna "%" sem situacao', v_name;
    END IF;
    v_situacao := (v_elem->>'situacao')::public.task_situacao;
    v_position := COALESCE((v_elem->>'position')::INTEGER, 0);
    v_id := NULLIF(v_elem->>'id', '')::UUID;

    IF v_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.kanban_columns WHERE id = v_id AND board_id = p_board_id
    ) THEN
      UPDATE public.kanban_columns
      SET name = v_name, situacao = v_situacao, position = v_position, updated_at = now()
      WHERE id = v_id;
    ELSE
      INSERT INTO public.kanban_columns (board_id, name, situacao, position)
      VALUES (p_board_id, v_name, v_situacao, v_position)
      RETURNING id INTO v_id;
    END IF;

    v_keep := array_append(v_keep, v_id);
  END LOOP;

  -- Nenhuma coluna restante (array vazio): só é permitido se o quadro não tiver
  -- cards — senão os placements ficariam órfãos (column_id NOT NULL). (BUG corrigido)
  IF array_length(v_keep, 1) IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.kanban_card_placements WHERE board_id = p_board_id) THEN
      RAISE EXCEPTION 'kanban_set_columns: não é possível remover todas as colunas enquanto há cards no quadro';
    END IF;
    DELETE FROM public.kanban_columns WHERE board_id = p_board_id;
    RETURN;
  END IF;

  -- Move placements das colunas removidas para uma coluna remanescente da mesma
  -- situacao (ou a primeira do quadro) antes de apagar, evitando perder cards.
  UPDATE public.kanban_card_placements cp
  SET column_id = COALESCE(
        (SELECT kc.id FROM public.kanban_columns kc
          WHERE kc.board_id = p_board_id AND kc.id = ANY(v_keep)
            AND kc.situacao = (SELECT situacao FROM public.kanban_columns WHERE id = cp.column_id)
          ORDER BY kc.position ASC LIMIT 1),
        (SELECT kc.id FROM public.kanban_columns kc
          WHERE kc.board_id = p_board_id AND kc.id = ANY(v_keep)
          ORDER BY kc.position ASC LIMIT 1)
      ),
      updated_at = now()
  WHERE cp.board_id = p_board_id
    AND NOT (cp.column_id = ANY(v_keep));

  DELETE FROM public.kanban_columns
  WHERE board_id = p_board_id
    AND NOT (id = ANY(v_keep));
END;
$$;

REVOKE ALL ON FUNCTION public.kanban_set_columns(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kanban_set_columns(UUID, JSONB) TO authenticated;

-- kanban_set_board_grants — só admin. Substitui as concessões do quadro pelos
-- arrays de user_ids e role_codes informados.
CREATE OR REPLACE FUNCTION public.kanban_set_board_grants(
  p_board_id UUID,
  p_user_ids UUID[],
  p_role_codes TEXT[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_u UUID;
  v_r TEXT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'kanban_set_board_grants: não autenticado';
  END IF;
  IF NOT public.kanban_can_admin(v_uid) THEN
    RAISE EXCEPTION 'kanban_set_board_grants: apenas administradores podem configurar quadros';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.kanban_boards WHERE id = p_board_id) THEN
    RAISE EXCEPTION 'kanban_set_board_grants: quadro não encontrado';
  END IF;

  DELETE FROM public.kanban_board_grants WHERE board_id = p_board_id;

  IF p_user_ids IS NOT NULL THEN
    FOREACH v_u IN ARRAY p_user_ids LOOP
      IF v_u IS NOT NULL THEN
        INSERT INTO public.kanban_board_grants (board_id, grantee_user_id)
        VALUES (p_board_id, v_u);
      END IF;
    END LOOP;
  END IF;

  IF p_role_codes IS NOT NULL THEN
    FOREACH v_r IN ARRAY p_role_codes LOOP
      IF NULLIF(trim(v_r), '') IS NOT NULL THEN
        INSERT INTO public.kanban_board_grants (board_id, grantee_role_code)
        VALUES (p_board_id, trim(v_r));
      END IF;
    END LOOP;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.kanban_set_board_grants(UUID, UUID[], TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kanban_set_board_grants(UUID, UUID[], TEXT[]) TO authenticated;

-- ----------------------------------------------------------------------------
-- kanban_move_card — coração do modelo duplo.
-- ----------------------------------------------------------------------------
-- Move um card (user_task) para outra coluna/posição. Regras:
--  * Acesso: kanban_can_access_board do board da coluna destino.
--  * Coluna destino define a SITUAÇÃO alvo.
--  * Se SITUAÇÃO alvo == SITUAÇÃO atual: NÃO mexe no status (só placement).
--  * Se mudou de SITUAÇÃO: recalcula um STATUS representativo:
--      pendente              -> 'assigned'
--      em_execucao           -> 'in_progress'  (NÃO-SOBRESCRITA: se status atual
--                               ∈ {awaiting_validation, awaiting_external, blocked}
--                               mantém o status, atualiza só a situacao)
--      concluida_sucesso     -> via update_user_task_status('completed') p/
--                               preservar o desvio V18 (awaiting_validation)
--      concluida_sem_sucesso -> 'completed' + payload.outcome='sem_sucesso'
--      cancelado             -> 'cancelled'
CREATE OR REPLACE FUNCTION public.kanban_move_card(
  p_task_id UUID,
  p_column_id UUID,
  p_position INTEGER DEFAULT 0
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_col public.kanban_columns;
  v_task public.user_tasks;
  v_target public.task_situacao;
  v_current public.task_situacao;
  v_requires_validation BOOLEAN;
  v_validated_at TIMESTAMPTZ;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'kanban_move_card: não autenticado';
  END IF;

  SELECT * INTO v_col FROM public.kanban_columns WHERE id = p_column_id;
  IF v_col.id IS NULL THEN
    RAISE EXCEPTION 'kanban_move_card: coluna não encontrada';
  END IF;

  IF NOT public.kanban_can_access_board(v_col.board_id, v_uid) THEN
    RAISE EXCEPTION 'kanban_move_card: acesso restrito';
  END IF;

  SELECT * INTO v_task FROM public.user_tasks WHERE id = p_task_id;
  IF v_task.id IS NULL THEN
    RAISE EXCEPTION 'kanban_move_card: tarefa não encontrada';
  END IF;

  v_target := v_col.situacao;
  v_current := v_task.situacao;

  -- 1) Atualiza/insere o placement (sempre, independente de mudar status).
  INSERT INTO public.kanban_card_placements (board_id, column_id, user_task_id, position)
  VALUES (v_col.board_id, p_column_id, p_task_id, COALESCE(p_position, 0))
  ON CONFLICT (user_task_id) DO UPDATE
    SET board_id = EXCLUDED.board_id,
        column_id = EXCLUDED.column_id,
        position = EXCLUDED.position,
        updated_at = now();

  -- 2) Mesma situacao: só placement, status intacto.
  IF v_target = v_current THEN
    RETURN;
  END IF;

  -- 3) Mudou de situacao: recalcula status representativo conforme regras.
  IF v_target = 'pendente' THEN
    UPDATE public.user_tasks
    SET status = 'assigned', situacao = 'pendente', updated_at = now()
    WHERE id = p_task_id;

  ELSIF v_target = 'em_execucao' THEN
    -- NÃO-SOBRESCRITA: preserva desvios já existentes em em_execucao.
    IF v_task.status IN ('awaiting_validation','awaiting_external','blocked') THEN
      UPDATE public.user_tasks
      SET situacao = 'em_execucao', updated_at = now()
      WHERE id = p_task_id;
    ELSE
      UPDATE public.user_tasks
      SET status = 'in_progress', situacao = 'em_execucao', updated_at = now()
      WHERE id = p_task_id;
    END IF;

  ELSIF v_target = 'concluida_sucesso' THEN
    -- Limpa a marcação de sem_sucesso ANTES de mexer no status: o trigger
    -- trg_user_tasks_sync_situacao lê payload.outcome no momento do UPDATE de
    -- status; se limpássemos depois, a situacao ficaria 'concluida_sem_sucesso'
    -- residual (BUG corrigido).
    UPDATE public.user_tasks
    SET payload = (payload - 'outcome'), updated_at = now()
    WHERE id = p_task_id AND (payload ? 'outcome');

    -- Conclusão aplicada INLINE (não via update_user_task_status, que exige ser
    -- dono/responsável da tarefa — aqui o gate correto é acesso ao quadro).
    -- Preserva o desvio V18: tipos com requires_validation vão p/ awaiting_validation.
    SELECT COALESCE(tt.requires_validation, false), ut.validated_at
      INTO v_requires_validation, v_validated_at
      FROM public.user_tasks ut
      JOIN public.task_types tt ON tt.id = ut.task_type_id
      WHERE ut.id = p_task_id;

    IF v_requires_validation AND v_validated_at IS NULL THEN
      UPDATE public.user_tasks
      SET status = 'awaiting_validation', situacao = 'em_execucao', updated_at = now()
      WHERE id = p_task_id;
    ELSE
      UPDATE public.user_tasks
      SET status = 'completed', situacao = 'concluida_sucesso',
          completed_at = COALESCE(completed_at, now()), updated_at = now()
      WHERE id = p_task_id;
    END IF;

  ELSIF v_target = 'concluida_sem_sucesso' THEN
    UPDATE public.user_tasks
    SET status = 'completed',
        situacao = 'concluida_sem_sucesso',
        payload = COALESCE(payload, '{}'::jsonb) || jsonb_build_object('outcome', 'sem_sucesso'),
        completed_at = COALESCE(completed_at, now()),
        updated_at = now()
    WHERE id = p_task_id;

  ELSIF v_target = 'cancelado' THEN
    UPDATE public.user_tasks
    SET status = 'cancelled', situacao = 'cancelado',
        cancelled_at = COALESCE(cancelled_at, now()), updated_at = now()
    WHERE id = p_task_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.kanban_move_card(UUID, UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kanban_move_card(UUID, UUID, INTEGER) TO authenticated;

COMMENT ON FUNCTION public.kanban_move_card(UUID, UUID, INTEGER) IS
  'Move card entre colunas: atualiza placement e, se mudou de situacao, deriva STATUS representativo. Preserva desvios V18/awaiting_*; concluida_sucesso roteia por update_user_task_status.';

-- kanban_add_task_to_board — coloca uma tarefa existente num quadro/coluna
-- (placement) sem alterar status; ajusta a situacao da tarefa para a da coluna
-- destino reaproveitando a lógica de kanban_move_card.
CREATE OR REPLACE FUNCTION public.kanban_add_task_to_board(
  p_task_id UUID,
  p_column_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_col public.kanban_columns;
  v_next_pos INTEGER;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'kanban_add_task_to_board: não autenticado';
  END IF;

  SELECT * INTO v_col FROM public.kanban_columns WHERE id = p_column_id;
  IF v_col.id IS NULL THEN
    RAISE EXCEPTION 'kanban_add_task_to_board: coluna não encontrada';
  END IF;

  IF NOT public.kanban_can_access_board(v_col.board_id, v_uid) THEN
    RAISE EXCEPTION 'kanban_add_task_to_board: acesso restrito';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.user_tasks WHERE id = p_task_id) THEN
    RAISE EXCEPTION 'kanban_add_task_to_board: tarefa não encontrada';
  END IF;

  -- Próxima posição ao fim da coluna.
  SELECT COALESCE(max(position), -1) + 1 INTO v_next_pos
  FROM public.kanban_card_placements WHERE column_id = p_column_id;

  PERFORM public.kanban_move_card(p_task_id, p_column_id, v_next_pos);
END;
$$;

REVOKE ALL ON FUNCTION public.kanban_add_task_to_board(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kanban_add_task_to_board(UUID, UUID) TO authenticated;

-- kanban_remove_task_from_board — remove o placement (a tarefa não some, só
-- deixa de aparecer no quadro). Gate pelo board do placement.
CREATE OR REPLACE FUNCTION public.kanban_remove_task_from_board(p_task_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_placement public.kanban_card_placements;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'kanban_remove_task_from_board: não autenticado';
  END IF;

  SELECT * INTO v_placement FROM public.kanban_card_placements WHERE user_task_id = p_task_id;
  IF v_placement.id IS NULL THEN
    RETURN; -- nada a remover (idempotente)
  END IF;

  IF NOT public.kanban_can_access_board(v_placement.board_id, v_uid) THEN
    RAISE EXCEPTION 'kanban_remove_task_from_board: acesso restrito';
  END IF;

  DELETE FROM public.kanban_card_placements WHERE user_task_id = p_task_id;
END;
$$;

REVOKE ALL ON FUNCTION public.kanban_remove_task_from_board(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kanban_remove_task_from_board(UUID) TO authenticated;

-- kanban_toggle_favorite — alterna favorito do quadro p/ o usuário logado.
CREATE OR REPLACE FUNCTION public.kanban_toggle_favorite(p_board_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_exists BOOLEAN;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'kanban_toggle_favorite: não autenticado';
  END IF;
  IF NOT public.kanban_can_access_board(p_board_id, v_uid) THEN
    RAISE EXCEPTION 'kanban_toggle_favorite: acesso restrito';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.kanban_board_favorites
                 WHERE board_id = p_board_id AND user_id = v_uid) INTO v_exists;

  IF v_exists THEN
    DELETE FROM public.kanban_board_favorites WHERE board_id = p_board_id AND user_id = v_uid;
    RETURN false;
  ELSE
    INSERT INTO public.kanban_board_favorites (board_id, user_id)
    VALUES (p_board_id, v_uid)
    ON CONFLICT (board_id, user_id) DO NOTHING;
    RETURN true;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.kanban_toggle_favorite(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kanban_toggle_favorite(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- (8) Trigger: sincroniza user_tasks.situacao a partir do status
-- ----------------------------------------------------------------------------
-- Sempre que o STATUS muda (por qualquer caminho — RPCs V17/V18, advance, etc),
-- recalcula a SITUAÇÃO. Respeita o desvio concluida_sem_sucesso quando o
-- payload já carrega outcome='sem_sucesso' (kanban_move_card seta isso antes
-- desta lógica não rodar, pois lá o status final é 'completed' — mas se algum
-- outro caminho marcar completed com outcome sem_sucesso, refletimos aqui).
CREATE OR REPLACE FUNCTION public.kanban_sync_situacao_from_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed' AND (NEW.payload->>'outcome') = 'sem_sucesso' THEN
    NEW.situacao := 'concluida_sem_sucesso';
  ELSE
    NEW.situacao := public.kanban_situacao_from_status(NEW.status);
  END IF;
  RETURN NEW;
END;
$$;

-- BEFORE para poder ajustar NEW.situacao na própria linha que está sendo gravada.
DROP TRIGGER IF EXISTS trg_user_tasks_sync_situacao ON public.user_tasks;
CREATE TRIGGER trg_user_tasks_sync_situacao
  BEFORE UPDATE OF status ON public.user_tasks
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.kanban_sync_situacao_from_status();

COMMENT ON FUNCTION public.kanban_sync_situacao_from_status() IS
  'Trigger BEFORE UPDATE OF status em user_tasks: deriva situacao do status (8->5), respeitando payload.outcome=sem_sucesso.';

-- ----------------------------------------------------------------------------
-- (9) DEPRECAÇÃO — itens do Model A / Fase 1 mantidos por compatibilidade
-- ----------------------------------------------------------------------------
-- NÃO dropar nesta migration. SP1 introduz o Model B (boards por SITUAÇÃO).
-- Os itens abaixo continuam funcionando, mas são considerados legados:
--   * public.get_kanban_board(boolean)        -- Model A (coluna = stage)
--   * public.advance_user_task(uuid, uuid)    -- avanço linear por stage
--   * public.kanban_next_stage(org_stage)     -- mapa de próxima fase
--   * public.kanban_stage_owner_role(org_stage)
-- Remoção planejada para uma migration futura após a UI migrar 100% p/ SP1.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname = 'get_kanban_board'
               AND pg_get_function_identity_arguments(p.oid) = 'p_include_completed boolean') THEN
    COMMENT ON FUNCTION public.get_kanban_board(boolean) IS
      'DEPRECATED (SP1): Model A (coluna = task_types.stage). Substituído por get_kanban_board(uuid) / Model B. Não usar em código novo.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname = 'advance_user_task') THEN
    COMMENT ON FUNCTION public.advance_user_task(uuid, uuid) IS
      'DEPRECATED (SP1): avanço linear por stage do Model A. Movimentação agora via kanban_move_card.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname = 'kanban_next_stage') THEN
    COMMENT ON FUNCTION public.kanban_next_stage(org_stage) IS
      'DEPRECATED (SP1): mapa de próxima fase do Model A.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname = 'kanban_stage_owner_role') THEN
    COMMENT ON FUNCTION public.kanban_stage_owner_role(org_stage) IS
      'DEPRECATED (SP1): papel-dono por stage do Model A.';
  END IF;
END $$;

COMMIT;
