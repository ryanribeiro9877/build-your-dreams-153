-- [8.3] Agenda de Audiências — schema + RLS + RPCs de escrita.
--
-- ATENÇÃO (paridade repo↔banco): este objeto JÁ FOI APLICADO em produção sob a
-- versão 20260710215335 (por outra sessão, fora do repo). Este arquivo reconstrói
-- fielmente o que está no banco APENAS para versionamento. Como a versão já consta
-- em supabase_migrations.schema_migrations, `supabase migration up` NÃO o reexecuta.
-- Ainda assim é 100% idempotente (guards) para ser seguro em qualquer ambiente.
--
-- Regra de arquitetura (Rodrigo): audiências podem ser SIMULTÂNEAS — são um ponto
-- no tempo marcado pelo juízo. Por isso NÃO há slot/capacidade/expediente aqui
-- (nada reusado de meetings). O sistema registra e acompanha; não valida agenda.
--
-- Decisões PROVISÓRIAS (confirmar com Rodrigo; default seguro, não bloqueiam):
--   1) Quem gerencia: audiencias_can_manage() = recepção + sócio + advogado.
--   2) Ciclo de status (enum): marcada|confirmada|realizada|redesignada|cancelada.

BEGIN;

-- 1. Enum de status (provisório).
DO $$ BEGIN
  CREATE TYPE public.audiencia_status AS ENUM
    ('marcada','confirmada','realizada','redesignada','cancelada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Tabela principal.
CREATE TABLE IF NOT EXISTS public.audiencias (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- vínculo cliente: FK + denormalizado (padrão meetings/processes)
  client_id        UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  client_name      TEXT,
  -- vínculo processo: FK + nº denormalizado (§27.1 "nº processo")
  process_id       UUID REFERENCES public.processes(id) ON DELETE SET NULL,
  process_number   TEXT,
  -- §27.1
  tipo_acao        TEXT,
  parte_contraria  TEXT,
  data_hora        TIMESTAMPTZ NOT NULL,       -- ponto no tempo (tz-aware)
  link_local       TEXT,                       -- link (virtual) ou endereço (presencial)
  advogado_user_id UUID,
  advogado_nome    TEXT,
  status           public.audiencia_status NOT NULL DEFAULT 'marcada',
  observacoes      TEXT,
  docs             JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Passo 3 (captura automática): CAMPOS prontos, SEM lógica agora (RPA/V2).
  origem           TEXT NOT NULL DEFAULT 'manual',   -- 'manual' | 'automatica'
  data_captura     TIMESTAMPTZ,
  -- Sync gcal (Track externo): colunas prontas, SEM lógica agora (card INT).
  google_event_id     TEXT,
  google_calendar_id  TEXT,
  google_sync_status  TEXT,
  last_synced_at      TIMESTAMPTZ,
  -- auditoria
  created_by       UUID DEFAULT auth.uid(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audiencias_client_idx  ON public.audiencias (client_id);
CREATE INDEX IF NOT EXISTS audiencias_process_idx ON public.audiencias (process_id);
CREATE INDEX IF NOT EXISTS audiencias_data_idx    ON public.audiencias (data_hora);
CREATE INDEX IF NOT EXISTS audiencias_status_idx  ON public.audiencias (status);

ALTER TABLE public.audiencias ENABLE ROW LEVEL SECURITY;

-- 3. Gate (provisório): recepção + sócio + advogado.
CREATE OR REPLACE FUNCTION public.audiencias_can_manage()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.is_recepcao_or_socio() OR public.is_socio_or_advogado();
$$;
REVOKE ALL ON FUNCTION public.audiencias_can_manage() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.audiencias_can_manage() TO authenticated, service_role;

-- 4. RLS: leitura por quem gerencia OU o advogado da audiência. Escrita só via RPC.
DROP POLICY IF EXISTS "audiencias read" ON public.audiencias;
CREATE POLICY "audiencias read" ON public.audiencias
  FOR SELECT TO authenticated
  USING (public.audiencias_can_manage() OR advogado_user_id = auth.uid());
-- (SEM policy de INSERT/UPDATE/DELETE: escrita só pelas RPCs SECURITY DEFINER abaixo.)

-- 5. CREATE — denormaliza client_name/process_number a partir das FKs.
CREATE OR REPLACE FUNCTION public.create_audiencia(
  p_client_id uuid, p_process_id uuid, p_data_hora timestamptz,
  p_tipo_acao text DEFAULT NULL, p_parte_contraria text DEFAULT NULL,
  p_link_local text DEFAULT NULL, p_advogado_user_id uuid DEFAULT NULL,
  p_observacoes text DEFAULT NULL, p_docs jsonb DEFAULT '[]'::jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare v_id uuid; v_client_name text; v_proc_number text;
begin
  if auth.uid() is null then raise exception 'create_audiencia: não autenticado'; end if;
  if not public.audiencias_can_manage() then
    raise exception 'create_audiencia: sem permissão' using errcode='42501';
  end if;
  if p_data_hora is null then raise exception 'create_audiencia: data/hora obrigatória'; end if;

  select full_name into v_client_name from public.clients where id = p_client_id;
  select process_number into v_proc_number from public.processes where id = p_process_id;

  insert into public.audiencias (
    client_id, client_name, process_id, process_number, tipo_acao, parte_contraria,
    data_hora, link_local, advogado_user_id, observacoes, docs, origem, created_by
  ) values (
    p_client_id, v_client_name, p_process_id, v_proc_number, p_tipo_acao, p_parte_contraria,
    p_data_hora, p_link_local, p_advogado_user_id, p_observacoes, coalesce(p_docs,'[]'::jsonb),
    'manual', auth.uid()
  ) returning id into v_id;
  return v_id;
end $function$;
REVOKE ALL ON FUNCTION public.create_audiencia(uuid,uuid,timestamptz,text,text,text,uuid,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_audiencia(uuid,uuid,timestamptz,text,text,text,uuid,text,jsonb) TO authenticated, service_role;

-- 6. UPDATE — COALESCE parcial (null preserva; não reatribui cliente/processo).
CREATE OR REPLACE FUNCTION public.update_audiencia(
  p_id uuid, p_data_hora timestamptz DEFAULT NULL,
  p_tipo_acao text DEFAULT NULL, p_parte_contraria text DEFAULT NULL,
  p_link_local text DEFAULT NULL, p_advogado_user_id uuid DEFAULT NULL,
  p_status public.audiencia_status DEFAULT NULL, p_observacoes text DEFAULT NULL,
  p_docs jsonb DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
begin
  if auth.uid() is null then raise exception 'update_audiencia: não autenticado'; end if;
  if not public.audiencias_can_manage() then
    raise exception 'update_audiencia: sem permissão' using errcode='42501';
  end if;
  update public.audiencias set
    data_hora        = coalesce(p_data_hora, data_hora),
    tipo_acao        = coalesce(p_tipo_acao, tipo_acao),
    parte_contraria  = coalesce(p_parte_contraria, parte_contraria),
    link_local       = coalesce(p_link_local, link_local),
    advogado_user_id = coalesce(p_advogado_user_id, advogado_user_id),
    status           = coalesce(p_status, status),
    observacoes      = coalesce(p_observacoes, observacoes),
    docs             = coalesce(p_docs, docs),
    updated_at       = now()
  where id = p_id;
  if not found then raise exception 'update_audiencia: audiência não encontrada'; end if;
end $function$;
REVOKE ALL ON FUNCTION public.update_audiencia(uuid,timestamptz,text,text,text,uuid,public.audiencia_status,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_audiencia(uuid,timestamptz,text,text,text,uuid,public.audiencia_status,text,jsonb) TO authenticated, service_role;

COMMIT;
