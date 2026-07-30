-- ============================================================================
-- ESPELHO de migração JÁ APLICADA em produção (30/07/2026). NÃO rodar `db push`.
-- Recuperada verbatim de supabase_migrations.schema_migrations.statements[1]
-- (version 20260730144313), então bate byte a byte com o que está no ar.
--
-- ATENÇÃO (ordem de migração): esta migração CRIA a função
-- public.distribuir_caso(uuid,uuid,uuid,text,uuid), mas ela é REESCRITA logo depois
-- pela migração 20260730144518 (fix_impedimentos_array_append). A versão VIVA em
-- produção é a da migração de version MAIOR: 20260730144518. O corpo abaixo NÃO é
-- o que está rodando hoje (ele contém o bug do `v_impedimentos || 'texto'`).
-- ============================================================================
-- RESPOSTA DO RODRIGO — ITEM 8: "todos esses itens citados são impeditivos" + item 3 do
-- follow-up: "todos [os tipos] exigem" reclamação administrativa prévia.
--
-- ESTADO REAL MEDIDO ANTES: o §24.1 (documento âncora) JÁ ERA bloqueio duro no distribuir_caso.
-- Faltavam dois: procuração vigente e reclamação administrativa prévia.
--
-- ⚠️ POR QUE COM INTERRUPTOR: hoje a base tem 0 procurações com vigência e 0 reclamações
-- registradas (os dados existem nas planilhas, não no sistema). Ligar a regra agora recusaria
-- 100% das distribuições e pararia o escritório amanhã. Então:
--   • a REGRA fica gravada onde pertence (por tese, todas as 12 marcadas como exigem);
--   • o ENFORCEMENT fica atrás da flag 'distribuicao_impedimentos' (OFF);
--   • com a flag OFF, a distribuição PASSA mas registra a ressalva em data_review_log —
--     degradar com aviso, nunca em silêncio.
-- Ordem correta: importar reclamações + procurações das planilhas → ligar a flag.

CREATE TABLE public.sistema_flags (
  chave text PRIMARY KEY,
  ativo boolean NOT NULL DEFAULT false,
  descricao text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sistema_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "flags read" ON public.sistema_flags FOR SELECT TO authenticated USING (true);

INSERT INTO public.sistema_flags (chave, ativo, descricao) VALUES
 ('distribuicao_impedimentos', false,
  'Quando ON, distribuir_caso RECUSA caso sem procuração vigente e/ou sem reclamação administrativa prévia (regra do Dr. Rodrigo, 30/07/2026). OFF hoje porque a base tem 0 procurações e 0 reclamações: ligar antes de importar os dados pararia o escritório. Com OFF, a ressalva é registrada em data_review_log.');

CREATE OR REPLACE FUNCTION public.set_sistema_flag(p_chave text, p_ativo boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE v_desc text;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin'::public.app_role) THEN
    RAISE EXCEPTION 'somente admin altera flags do sistema' USING errcode='42501';
  END IF;
  UPDATE public.sistema_flags SET ativo=p_ativo, updated_by=auth.uid(), updated_at=now()
   WHERE chave=p_chave RETURNING descricao INTO v_desc;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'motivo','flag_inexistente'); END IF;
  RETURN jsonb_build_object('ok',true,'chave',p_chave,'ativo',p_ativo,'descricao',v_desc);
END; $$;
REVOKE EXECUTE ON FUNCTION public.set_sistema_flag(text,boolean) FROM PUBLIC, anon;

-- a regra vive por tese (permite exceção futura sem mexer em função)
ALTER TABLE public.tipos_acao ADD COLUMN exige_procuracao_vigente boolean NOT NULL DEFAULT false;
ALTER TABLE public.tipos_acao ADD COLUMN exige_reclamacao_previa  boolean NOT NULL DEFAULT false;
UPDATE public.tipos_acao SET exige_procuracao_vigente = true, exige_reclamacao_previa = true;
COMMENT ON COLUMN public.tipos_acao.exige_reclamacao_previa IS
'Rodrigo 30/07/2026: TODAS as teses exigem reclamação administrativa prévia (interesse de agir).';

CREATE OR REPLACE FUNCTION public.distribuir_caso(
  p_process_id uuid, p_tipo_acao_id uuid DEFAULT NULL, p_task_type_id uuid DEFAULT NULL,
  p_title text DEFAULT NULL, p_responsible_lawyer_user_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
declare
  v_uid          uuid;
  v_process      public.processes;
  v_tipo_acao_id uuid;
  v_task_type_id uuid;
  v_board_id     uuid;
  v_column_id    uuid;
  v_task_id      uuid;
  v_title        text;
  v_ok           boolean;
  v_faltando     text[];
  v_area         public.legal_area;
  v_responsible  uuid;
  v_exige_proc   boolean;
  v_exige_recl   boolean;
  v_impedimentos text[] := ARRAY[]::text[];
  v_enforce      boolean;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'distribuir_caso: não autenticado';
  end if;

  if not (public.is_recepcao_or_socio() or public.is_socio_or_advogado()) then
    raise exception 'distribuir_caso: sem permissão para distribuir' using errcode = '42501';
  end if;

  select * into v_process from public.processes where id = p_process_id;
  if v_process.id is null then
    raise exception 'distribuir_caso: processo não encontrado';
  end if;

  v_tipo_acao_id := coalesce(p_tipo_acao_id, v_process.tipo_acao_id);
  if v_tipo_acao_id is null then
    raise exception 'distribuir_caso: tipo de ação não definido (informe p_tipo_acao_id ou preencha processes.tipo_acao_id)';
  end if;

  if p_tipo_acao_id is not null and v_process.tipo_acao_id is distinct from p_tipo_acao_id then
    update public.processes set tipo_acao_id = p_tipo_acao_id, updated_at = now()
    where id = p_process_id;
  end if;

  select coalesce(p_task_type_id, t.default_task_type_id)
    into v_task_type_id
    from public.tipos_acao t
    where t.id = v_tipo_acao_id;
  if v_task_type_id is null then
    raise exception 'distribuir_caso: task_type não resolvido — informe p_task_type_id ou configure tipos_acao.default_task_type_id';
  end if;

  select id into v_board_id
    from public.kanban_boards
    where tipo_acao_id = v_tipo_acao_id
    limit 1;
  if v_board_id is null then
    raise exception 'distribuir_caso: nenhum board configurado para este tipo de ação';
  end if;

  select id into v_column_id
    from public.kanban_columns
    where board_id = v_board_id
    order by position asc, created_at asc
    limit 1;
  if v_column_id is null then
    raise exception 'distribuir_caso: board sem colunas';
  end if;

  -- §24.1: âncora documental por tipo (bloqueio duro; conteúdo ratificado pelo Dr. Rodrigo).
  select a.ok, a.faltando into v_ok, v_faltando
    from public.verificar_ancora_24_1(p_process_id, v_tipo_acao_id) a;
  if not coalesce(v_ok, true) then
    raise exception 'distribuir_caso: §24.1 — documento âncora ausente. Obrigatório pelo menos um de: %. Distribuição bloqueada até anexar.',
      array_to_string(v_faltando, ', ') using errcode = 'P0001';
  end if;

  -- ===== IMPEDIMENTOS ADICIONAIS (Rodrigo 30/07/2026) =====
  select t.exige_procuracao_vigente, t.exige_reclamacao_previa
    into v_exige_proc, v_exige_recl
    from public.tipos_acao t where t.id = v_tipo_acao_id;

  if coalesce(v_exige_proc,false) and not exists (
       select 1 from public.procuracoes pr
        where pr.client_id = v_process.client_id
          and pr.status = 'vigente' and pr.validade_ate >= current_date)
  then
    v_impedimentos := v_impedimentos || 'procuração vigente';
  end if;

  if coalesce(v_exige_recl,false) and not exists (
       select 1 from public.reclamacoes_administrativas r
        where r.client_id = v_process.client_id
          and (r.process_id is null or r.process_id = p_process_id))
  then
    v_impedimentos := v_impedimentos || 'reclamação administrativa prévia';
  end if;

  if array_length(v_impedimentos,1) > 0 then
    select f.ativo into v_enforce from public.sistema_flags f where f.chave='distribuicao_impedimentos';
    if coalesce(v_enforce,false) then
      raise exception 'distribuir_caso: distribuição bloqueada — falta %. (regra do Dr. Rodrigo, 30/07/2026)',
        array_to_string(v_impedimentos, ' e ') using errcode = 'P0001';
    else
      insert into public.data_review_log(client_id, campo, valor_original, valor_novo, motivo)
      values (v_process.client_id, 'distribuicao_com_ressalva',
              array_to_string(v_impedimentos, ' e '), null,
              'distribuir_caso: impedimento presente mas flag distribuicao_impedimentos=OFF — distribuído com ressalva. Processo '
              || coalesce(v_process.process_number, p_process_id::text));
    end if;
  end if;

  -- responsável = override manual > já definido no processo > default por área.
  select tt.area into v_area from public.task_types tt where tt.id = v_task_type_id;
  v_responsible := coalesce(
    p_responsible_lawyer_user_id,
    v_process.responsible_lawyer_user_id,
    (select r.responsible_user_id from public.area_advogado_responsavel r where r.area = v_area)
  );

  if v_responsible is null then
    raise exception 'distribuir_caso: não há advogado responsável para a área "%" — informe p_responsible_lawyer_user_id, preencha processes.responsible_lawyer_user_id, ou cadastre area_advogado_responsavel para esta área.',
      coalesce(v_area::text, '(sem área)') using errcode = 'P0001';
  end if;

  if v_responsible is distinct from v_process.responsible_lawyer_user_id then
    update public.processes
      set responsible_lawyer_user_id = v_responsible, updated_at = now()
      where id = p_process_id;
  end if;

  v_title := coalesce(nullif(btrim(p_title), ''),
                      'Caso: ' || coalesce(v_process.process_number, v_process.client_name, p_process_id::text));

  insert into public.user_tasks (task_type_id, title, assigner_user_id, assignee_user_id, process_id, client_id, status, situacao)
  values (v_task_type_id, v_title, v_uid, v_responsible, p_process_id, v_process.client_id, 'assigned', 'pendente')
  returning id into v_task_id;

  insert into public.kanban_card_placements (board_id, column_id, user_task_id, position)
  values (v_board_id, v_column_id, v_task_id, 0)
  on conflict (user_task_id) do update
    set board_id = excluded.board_id,
        column_id = excluded.column_id,
        position = excluded.position,
        updated_at = now();

  return v_task_id;
end;
$$;