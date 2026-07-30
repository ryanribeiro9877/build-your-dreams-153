-- ============================================================================
-- ESPELHO de migração JÁ APLICADA em produção (30/07/2026). NÃO rodar `db push`.
-- Recuperada verbatim de supabase_migrations.schema_migrations.statements[1]
-- (version 20260730134623), então bate byte a byte com o que está no ar.
--
-- NÃO estava na lista do briefing de P2 — achei varrendo as migrações de 30/07 e
-- espelhei porque estava aplicada em produção e ausente do repo. É o importador
-- que os dois wrappers posicionais (20260730134849 e 20260730134932) chamam.
-- ============================================================================

-- RESPOSTA DO RODRIGO — ITENS 3.1 e 3.3: importador de processos + execuções.
-- 3.1: cliente NÃO cadastrado → NÃO importa e devolve na lista para planilha separada (ordem dele).
-- 3.3: linha sem situação → entra como 'ajuizada' com a observação declarada (ordem dele).
-- Dedup por DÍGITOS do número (as 3 abas repetem processos entre si: 15 sobreposições medidas).
-- dry_run=true por default. Sentença procedente NÃO dispara prazos retroativos: sentenças de 2025
-- gerariam prazos vencidos e ruído no Kanban — fica registrado na descrição e o Ryan decide depois.
CREATE OR REPLACE FUNCTION public.importar_processos_execucoes_planilha(
  p_lote jsonb, p_dry_run boolean DEFAULT true, p_user_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  it jsonb; v_num text; v_dig text; v_nome text; v_cli uuid; v_n int; v_dono uuid;
  v_proc uuid; v_fase text; v_rev date; v_desc text;
  v_proc_criados int:=0; v_exec_criados int:=0; v_dup int:=0; v_sem_cadastro int:=0;
  v_ambiguo int:=0; v_tickler int:=0; v_erros jsonb:='[]'::jsonb; v_fora jsonb:='[]'::jsonb;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin'::public.app_role) OR public.is_socio_or_advogado()) THEN
    RAISE EXCEPTION 'importação restrita a admin/sócio/advogado' USING errcode='42501';
  END IF;
  v_dono := coalesce(p_user_id, auth.uid());
  IF v_dono IS NULL THEN
    RETURN jsonb_build_object('ok',false,'motivo','user_id_obrigatorio',
      'mensagem','processes.user_id é NOT NULL — informe o dono dos processos.');
  END IF;

  FOR it IN SELECT * FROM jsonb_array_elements(p_lote) LOOP
    BEGIN
      v_num  := nullif(btrim(coalesce(it->>'numero','')),'');
      v_nome := nullif(btrim(coalesce(it->>'cliente','')),'');
      v_dig  := regexp_replace(coalesce(v_num,''), '\D', '', 'g');
      IF v_num IS NULL OR v_nome IS NULL OR v_dig = '' THEN CONTINUE; END IF;

      -- dedup por dígitos (ignora máscara/sufixo tipo "(PJE)")
      IF EXISTS (SELECT 1 FROM public.processes p
                  WHERE regexp_replace(coalesce(p.process_number,''),'\D','','g') = v_dig) THEN
        v_dup := v_dup + 1; CONTINUE;
      END IF;

      -- cliente: igualdade canônica e ÚNICA
      SELECT count(*) INTO v_n FROM public.clients c WHERE public.txt_fold(c.full_name)=public.txt_fold(v_nome);
      IF v_n = 1 THEN
        SELECT c.id INTO v_cli FROM public.clients c WHERE public.txt_fold(c.full_name)=public.txt_fold(v_nome);
      ELSE
        IF v_n = 0 THEN v_sem_cadastro := v_sem_cadastro + 1; ELSE v_ambiguo := v_ambiguo + 1; END IF;
        v_fora := v_fora || jsonb_build_object('numero',v_num,'cliente',v_nome,
                    'motivo', CASE WHEN v_n=0 THEN 'cliente_sem_cadastro' ELSE 'nome_ambiguo_na_base' END,
                    'origem', it->>'origem', 'reu', it->>'reu',
                    'sentenca_procedente', coalesce((it->>'sentenca_procedente')::boolean,false),
                    'tem_execucao', coalesce((it->>'tem_execucao')::boolean,false),
                    'proxima_revisao', it->>'proxima_revisao');
        CONTINUE;
      END IF;

      v_desc := concat_ws(' | ',
                  nullif(btrim(coalesce(it->>'obs','')),''),
                  CASE WHEN coalesce((it->>'sentenca_procedente')::boolean,false)
                       THEN 'SENTENÇA PROCEDENTE (planilha do Rodrigo) — execução ainda não ajuizada' END,
                  'importado de: '||coalesce(it->>'origem','planilha'));

      IF p_dry_run THEN
        v_proc_criados := v_proc_criados + 1;
        IF coalesce((it->>'tem_execucao')::boolean,false) THEN v_exec_criados := v_exec_criados + 1; END IF;
        IF nullif(btrim(coalesce(it->>'proxima_revisao','')),'') IS NOT NULL THEN v_tickler := v_tickler + 1; END IF;
        CONTINUE;
      END IF;

      INSERT INTO public.processes (client_id, client_name, process_number, status, description, user_id)
      VALUES (v_cli, v_nome, v_num, 'ativo', v_desc, v_dono)
      RETURNING id INTO v_proc;
      v_proc_criados := v_proc_criados + 1;

      IF coalesce((it->>'tem_execucao')::boolean,false) THEN
        v_fase := coalesce(nullif(btrim(coalesce(it->>'fase','')),''),'ajuizada');
        v_rev  := nullif(btrim(coalesce(it->>'proxima_revisao','')),'')::date;
        INSERT INTO public.execucoes
          (process_id, fase, reu_nome, reu_tipo, responsavel_nome, proxima_revisao, notes, created_by)
        VALUES (v_proc, v_fase,
                nullif(btrim(coalesce(it->>'reu','')),''),
                nullif(btrim(coalesce(it->>'reu_tipo','')),''),
                nullif(btrim(coalesce(it->>'responsavel','')),''),
                v_rev,
                nullif(btrim(coalesce(it->>'obs','')),''), v_dono);
        v_exec_criados := v_exec_criados + 1;
        IF v_rev IS NOT NULL THEN v_tickler := v_tickler + 1; END IF;

        INSERT INTO public.execucao_eventos (execucao_id, fase_de, fase_para, observacao, created_by)
        SELECT e.id, NULL, v_fase, 'Importado da planilha ('||coalesce(it->>'origem','?')||')', v_dono
          FROM public.execucoes e WHERE e.process_id = v_proc;
      END IF;

    EXCEPTION WHEN OTHERS THEN
      v_erros := v_erros || jsonb_build_object('numero',v_num,'cliente',v_nome,'erro',SQLERRM);
    END;
  END LOOP;

  RETURN jsonb_build_object('ok',true,'dry_run',p_dry_run,
    'processos_criados',v_proc_criados,'execucoes_criadas',v_exec_criados,
    'duplicados_ignorados',v_dup,'clientes_sem_cadastro',v_sem_cadastro,'nomes_ambiguos',v_ambiguo,
    'com_tickler',v_tickler,'nao_importados',v_fora,'erros',v_erros);
END; $$;
REVOKE EXECUTE ON FUNCTION public.importar_processos_execucoes_planilha(jsonb,boolean,uuid) FROM PUBLIC, anon;
