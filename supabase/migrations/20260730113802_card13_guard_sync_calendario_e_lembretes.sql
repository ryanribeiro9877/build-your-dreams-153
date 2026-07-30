-- ============================================================================
-- ESPELHO de migração JÁ APLICADA em produção (30/07/2026). NÃO rodar `db push`.
-- Recuperada verbatim de supabase_migrations.schema_migrations.statements[1]
-- (version 20260730113802), então bate byte a byte com o que está no ar.
-- ============================================================================

-- CARD 13 (P2) — parte 1: válvula de sync + entidade de lembretes.
--
-- PROBLEMA MEDIDO ANTES DE CONSTRUIR: trg_sync_calendar_record dispara net.http_post
-- para google-calendar-sync em CADA INSERT/UPDATE, em meetings E audiencias, sem filtro
-- de data. A planilha tem ~500 audiências/mês (junho/2025: 656 linhas; ago/2026→jan/2027:
-- ~316 futuras). Importar em massa = centenas de POSTs na fila do pg_net e centenas de
-- eventos no calendário do escritório de uma vez. O bloqueio de data passada vive na edge,
-- então os POSTs sairiam mesmo para audiências de 2025.
--
-- SOLUÇÃO: guarda de transação, agnóstica de tabela (a função é compartilhada com meetings,
-- por isso NÃO referencia colunas específicas). O importador liga a guarda com set_config
-- local; qualquer outro caminho (tela, chat) segue sincronizando normalmente.
-- Nada mais do corpo original foi alterado — só a linha de guarda no topo.

CREATE OR REPLACE FUNCTION public.trg_sync_calendar_record()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_token text;
BEGIN
  -- guarda de importação em massa (escopo de transação; default = sincroniza)
  IF coalesce(current_setting('app.skip_calendar_sync', true), '') = 'on' THEN
    RETURN NEW;
  END IF;
  BEGIN
    SELECT decrypted_secret INTO v_token FROM vault.decrypted_secrets WHERE name = 'google_sync_internal_auth';
    IF v_token IS NULL THEN RETURN NEW; END IF;
    PERFORM net.http_post(
      url := 'https://tsltxvswzdnlmvljpryh.supabase.co/functions/v1/google-calendar-sync',
      headers := jsonb_build_object('Content-Type','application/json','X-Sync-Secret', v_token),
      body := jsonb_build_object('recordType', TG_ARGV[0], 'recordId', NEW.id)
    );
  EXCEPTION WHEN OTHERS THEN NULL; -- nunca quebra criar/editar por causa do sync
  END;
  RETURN NEW;
END;
$function$;

-- ===== LEMBRETES: a planilha revela que não é um campo, é uma tabela filha =====
-- As colunas "Horário - ligação" repetidas mês a mês são VÁRIAS ligações por audiência
-- (exemplos reais: audiência 04/08/2025 → avisos 29/07, 01/08, 04/08; audiência 01/04 →
-- 27/03, 31/03, 01/04). O padrão varia por mês, então o default é DECLARADO (D-7/D-3/D-1/D-0)
-- e sobrescritível por parâmetro — não inventado como regra fixa.
-- pendencia_task_id nasce aqui por lição do Card 11 (link guardado, nunca derivado).

CREATE TABLE public.audiencia_lembretes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audiencia_id uuid NOT NULL REFERENCES public.audiencias(id) ON DELETE CASCADE,
  data_prevista date NOT NULL,
  canal text NOT NULL DEFAULT 'ligacao' CHECK (canal IN ('ligacao','whatsapp','outro')),
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','feito','nao_atendeu','cancelado')),
  feito_em timestamptz,
  feito_por uuid,
  observacao text,
  pendencia_task_id uuid REFERENCES public.user_tasks(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (audiencia_id, data_prevista, canal)
);
CREATE INDEX idx_lembretes_do_dia ON public.audiencia_lembretes(data_prevista) WHERE status='pendente';

ALTER TABLE public.audiencia_lembretes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lembretes read" ON public.audiencia_lembretes
  FOR SELECT TO authenticated
  USING (public.can_view_clients() OR public.is_socio_or_advogado());

-- ===== IMPORTADOR EM MASSA =====
-- ⚠️ ÚNICA LINHA DESTE ESPELHO QUE NÃO É VERBATIM (redigida por Claude Code em 30/07):
-- o exemplo original trazia o NOME REAL de um cliente do escritório, a parte contrária,
-- o tipo de ação e a data da audiência dele. Conferido: o nome casava com 1 registro em
-- clients_decrypted. Este repositório é PÚBLICO, então o exemplo foi trocado por dados
-- FICTÍCIOS. Nada além destas 3 linhas foi alterado; o resto bate byte a byte com
-- statements[1]. Não recolocar dado de cliente em comentário de migração.
-- item: {"cliente":"FULANO DE TAL","parte_contraria":"BANCO EXEMPLO S.A.",
--        "data_hora":"2026-08-04T09:00:00-03:00","tipo_acao":"Empréstimo Pessoal",
--        "processo_numero":null,"observacao":"ONLINE","origem":"Tabela de audiências / Agosto"}
-- dry_run=true é o DEFAULT (lição do importador de telefones: contagem antes de gravar).
CREATE OR REPLACE FUNCTION public.importar_audiencias_planilha(
  p_lote jsonb, p_offsets int[] DEFAULT ARRAY[7,3,1,0], p_dry_run boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  it jsonb; v_nome text; v_cli uuid; v_n int; v_ts timestamptz; v_proc uuid; v_num text;
  v_id uuid; v_off int; v_data date;
  v_criadas int:=0; v_dup int:=0; v_sem_match int:=0; v_ambiguo int:=0;
  v_lembretes int:=0; v_passadas int:=0; v_erros jsonb:='[]'::jsonb;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin'::public.app_role) OR public.audiencias_can_manage()) THEN
    RAISE EXCEPTION 'importação de audiências restrita a quem gerencia audiências' USING errcode='42501';
  END IF;

  -- válvula: importação em massa NÃO enche o Google Calendar nem a fila do pg_net
  PERFORM set_config('app.skip_calendar_sync','on', true);

  FOR it IN SELECT * FROM jsonb_array_elements(p_lote) LOOP
    BEGIN
      v_nome := nullif(btrim(coalesce(it->>'cliente','')),'');
      v_ts   := nullif(btrim(coalesce(it->>'data_hora','')),'')::timestamptz;
      IF v_nome IS NULL OR v_ts IS NULL THEN CONTINUE; END IF;

      -- cliente: igualdade canônica e ÚNICA (txt_fold). Sem match não descarta a audiência:
      -- entra com client_name (a coluna existe) — perder audiência é pior que ficar sem vínculo.
      v_cli := NULL;
      SELECT count(*) INTO v_n FROM public.clients c WHERE public.txt_fold(c.full_name)=public.txt_fold(v_nome);
      IF v_n = 1 THEN
        SELECT c.id INTO v_cli FROM public.clients c WHERE public.txt_fold(c.full_name)=public.txt_fold(v_nome);
      ELSIF v_n > 1 THEN
        v_ambiguo := v_ambiguo + 1;
      ELSE
        v_sem_match := v_sem_match + 1;
      END IF;

      v_proc := public._resolver_processo(NULL, nullif(btrim(coalesce(it->>'processo_numero','')),''));
      IF v_proc IS NOT NULL THEN
        SELECT p.process_number INTO v_num FROM public.processes p WHERE p.id=v_proc;
      ELSE
        v_num := nullif(btrim(coalesce(it->>'processo_numero','')),'');
      END IF;

      -- dedup: mesma pessoa (por id OU por nome dobrado) no mesmo instante
      IF EXISTS (
        SELECT 1 FROM public.audiencias a
         WHERE a.data_hora = v_ts
           AND ((v_cli IS NOT NULL AND a.client_id = v_cli)
                OR (v_cli IS NULL AND public.txt_fold(coalesce(a.client_name,'')) = public.txt_fold(v_nome)))
      ) THEN
        v_dup := v_dup + 1;
        CONTINUE;
      END IF;

      IF v_ts < now() THEN v_passadas := v_passadas + 1; END IF;

      IF p_dry_run THEN
        v_criadas := v_criadas + 1;
        FOREACH v_off IN ARRAY p_offsets LOOP
          IF (v_ts::date - v_off) >= current_date THEN v_lembretes := v_lembretes + 1; END IF;
        END LOOP;
        CONTINUE;
      END IF;

      INSERT INTO public.audiencias
        (client_id, client_name, process_id, process_number, data_hora, tipo_acao,
         parte_contraria, observacoes, origem, data_captura, status, created_by)
      VALUES (v_cli, v_nome, v_proc, v_num, v_ts,
              nullif(btrim(coalesce(it->>'tipo_acao','')),''),
              nullif(btrim(coalesce(it->>'parte_contraria','')),''),
              nullif(btrim(coalesce(it->>'observacao','')),''),
              coalesce(nullif(btrim(coalesce(it->>'origem','')),''),'importacao_planilha'),
              now(), 'marcada'::public.audiencia_status, auth.uid())
      RETURNING id INTO v_id;
      v_criadas := v_criadas + 1;

      -- lembretes só para o futuro (avisar de audiência de 2025 seria ruído)
      FOREACH v_off IN ARRAY p_offsets LOOP
        v_data := v_ts::date - v_off;
        IF v_data >= current_date THEN
          INSERT INTO public.audiencia_lembretes (audiencia_id, data_prevista, canal)
          VALUES (v_id, v_data, 'ligacao')
          ON CONFLICT (audiencia_id, data_prevista, canal) DO NOTHING;
          v_lembretes := v_lembretes + 1;
        END IF;
      END LOOP;

    EXCEPTION WHEN OTHERS THEN
      v_erros := v_erros || jsonb_build_object('cliente', v_nome, 'erro', SQLERRM);
    END;
  END LOOP;

  RETURN jsonb_build_object('ok',true,'dry_run',p_dry_run,
    'audiencias_criadas',v_criadas,'duplicadas_ignoradas',v_dup,
    'sem_match_cliente',v_sem_match,'nome_ambiguo',v_ambiguo,
    'audiencias_passadas',v_passadas,'lembretes_criados',v_lembretes,
    'offsets_usados',p_offsets,'erros',v_erros,
    'nota','Sync com Google Calendar SUPRIMIDO nesta importação (evita centenas de eventos de uma vez). Audiências futuras precisam de sync manual ou edição pela tela se quiser no calendário.');
END; $$;
REVOKE EXECUTE ON FUNCTION public.importar_audiencias_planilha(jsonb,int[],boolean) FROM PUBLIC, anon;