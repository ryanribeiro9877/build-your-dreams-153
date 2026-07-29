-- ============================================================================
-- Adendo ao Card 1 — importar_telefones_planilha (destrava o Card 4)
-- ============================================================================
-- ⚠️ NÃO APLICADA AINDA. Aguarda (a) o teu ok nas 4 correções abaixo e (b) o
-- dry-run com as planilhas. Nada aqui grava até o passo 5 do pipeline.
--
-- Contexto: 562 clientes, 6 com telefone (471 com banco de benefício). As
-- planilhas legadas são a única fonte — este import vem ANTES de apagar
-- C:\card1 e Downloads.
--
-- Mesmo trilho do Card 1 (conferido em `importar_clientes_planilha`, que está em
-- produção): SECURITY DEFINER, gate `has_role(admin) OR is_recepcao_or_socio()`,
-- item processado dentro de BEGIN/EXCEPTION próprio (um item ruim não derruba o
-- lote), retorno com contagens + erros. O script se autentica com
-- signInWithPassword, então `auth.uid()` é um usuário real e o gate passa —
-- service-role NÃO funciona aqui (auth.uid() seria NULL → 42501).
--
-- ─── DIVERGÊNCIAS DO DESENHO, todas medidas no banco em 29/07 ────────────────
--
-- 1) FORMATO COM MÁSCARA (o desenho propunha só dígitos).
--    Os 6 telefones existentes estão com máscara (10 e 11 dígitos + separadores)
--    — é o que o wizard grava. E o filtro `telefone` de search_clients é ILIKE:
--        '(71) 98888-7777' ILIKE '%71988%'  →  FALSE
--        '71988887777'     ILIKE '%71988%'  →  TRUE
--    Misturar formatos quebraria a busca em silêncio. O normalizador
--    (scripts/lib/telefoneNormalize.mjs) já entrega com máscara.
--
-- 2) SEM CASCATA DE SLOTS (o desenho preenchia phone → phone_home → phone_commercial).
--    A ficha rotula esses campos: phone="Celular", phone_commercial="Telefone
--    Comercial", phone_home="Telefone Residencial". Um segundo celular caindo em
--    phone_home gravaria "residencial" sem a planilha ter dito isso — palpite,
--    justo o que o princípio 2 do desenho proíbe. E não ajudaria o Card 4:
--    search_clients e a fila de campanha leem SÓ `phone`.
--    Aqui: grava o primeiro em `phone` e registra os demais como
--    `telefone_adicional` em data_review_log, com origem. A recepção rotula na
--    ligação. Some o FOREACH de slots inteiro.
--
-- 3) MATCH POR NOME COM txt_fold.
--    530 dos 562 têm cpf_bidx, então o CPF resolve a maioria e só ~32 dependem do
--    nome. Não há NENHUM nome duplicado na base hoje, então o ramo "ambíguo"
--    quase não dispara — o risco real é `sem_match` inflado por acento/cedilha
--    ("JOSÉ" vs "JOSE"). txt_fold (IMMUTABLE, já em produção) é igualdade
--    canônica, não similaridade: continua match de ALTA confiança. O ramo
--    ambíguo permanece porque dobrar J/j e É/E aumenta um pouco a chance de
--    colisão — e colisão tem de virar descarte, nunca palpite.
--
-- 4) COERÇÃO DO whatsapp_declarado.
--    `(it->>'whatsapp_declarado')::boolean` com "sim" levanta 22P02 e, como o
--    EXCEPTION do item captura tudo, o telefone TODO daquele cliente se perderia
--    por causa de um flag. Mesma armadilha do `gov` em search_clients medida hoje.
--    Aqui o valor é coagido e, se irreconhecível, o flag simplesmente não muda.
--
-- Mantido do desenho: coalesce nunca sobrescreve (os 6 atuais são intocáveis por
-- construção — só grava onde phone IS NULL), todo descarte vira linha em
-- data_review_log, e senhas/usuário GOV não viajam neste lote.
-- A RPC NÃO entra no tool_catalog: é ferramenta de migração, não de chat.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.importar_telefones_planilha(p_lote jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  it jsonb; v_cli uuid; v_qtd int; v_nome text; v_cpf text; v_origem text;
  v_tels text[]; v_t text; v_zap boolean; v_zap_txt text;
  v_phone_atual text; v_primeiro text; v_i int;
  v_atualizados int := 0; v_adicionais int := 0; v_ja_tinha int := 0;
  v_ambiguos int := 0; v_sem_match int := 0; v_erros jsonb := '[]'::jsonb;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin'::public.app_role) OR public.is_recepcao_or_socio()) THEN
    RAISE EXCEPTION 'importação restrita a admin/sócio/recepção' USING errcode='42501';
  END IF;

  FOR it IN SELECT * FROM jsonb_array_elements(p_lote) LOOP
    BEGIN
      v_nome   := btrim(coalesce(it->>'nome',''));
      v_cpf    := nullif(btrim(coalesce(it->>'cpf','')),'');
      v_origem := coalesce(nullif(btrim(coalesce(it->>'origem','')),''),'?');

      -- Ordem PRESERVADA (sem DISTINCT, que a reembaralha): o primeiro telefone
      -- do array é o que o normalizador julgou principal e vai para `phone`.
      SELECT array_agg(x ORDER BY ord) INTO v_tels
        FROM jsonb_array_elements_text(coalesce(it->'telefones','[]'::jsonb))
             WITH ORDINALITY AS t(x, ord);

      IF v_nome = '' OR v_tels IS NULL OR array_length(v_tels,1) IS NULL THEN CONTINUE; END IF;

      -- ── MATCH ──────────────────────────────────────────────────────────────
      -- 1º CPF (bidx, alta confiança). 2º nome canônico (txt_fold) E ÚNICO.
      v_cli := NULL;
      IF v_cpf IS NOT NULL THEN
        SELECT c.id INTO v_cli FROM public.clients c
         WHERE c.cpf_bidx = public.pii_bidx(v_cpf) LIMIT 1;
      END IF;

      IF v_cli IS NULL THEN
        -- Contagem e id em passos SEPARADOS de propósito: `min(c.id)` não existe
        -- para uuid ("function min(uuid) does not exist") e, como o EXCEPTION
        -- deste item captura tudo, o erro sumiria dentro de `erros` — perdendo
        -- em silêncio TODO telefone que depende do match por nome. Pego no
        -- dry-run de 29/07.
        SELECT count(*) INTO v_qtd
          FROM public.clients c
         WHERE public.txt_fold(btrim(c.full_name)) = public.txt_fold(v_nome);

        IF v_qtd = 1 THEN
          SELECT c.id INTO v_cli
            FROM public.clients c
           WHERE public.txt_fold(btrim(c.full_name)) = public.txt_fold(v_nome);
        END IF;

        IF v_qtd = 0 THEN
          v_sem_match := v_sem_match + 1;
          INSERT INTO public.data_review_log(client_id,campo,valor_original,valor_novo,motivo)
          VALUES (NULL,'phone',NULL,array_to_string(v_tels,' | '),
                  'telefone_sem_match: '||v_nome||' ['||v_origem||']');
          CONTINUE;
        ELSIF v_qtd > 1 THEN
          v_ambiguos := v_ambiguos + 1;
          INSERT INTO public.data_review_log(client_id,campo,valor_original,valor_novo,motivo)
          VALUES (NULL,'phone',NULL,array_to_string(v_tels,' | '),
                  'telefone_descartado_match_ambiguo ('||v_qtd||' clientes): '||v_nome||' ['||v_origem||']');
          CONTINUE;
        END IF;
      END IF;

      -- ── GRAVAÇÃO ───────────────────────────────────────────────────────────
      SELECT nullif(btrim(coalesce(c.phone,'')),'') INTO v_phone_atual
        FROM public.clients c WHERE c.id = v_cli;

      v_primeiro := v_tels[1];

      IF v_phone_atual IS NULL THEN
        -- Só aqui há UPDATE de phone. Cliente que já tem telefone nunca é tocado.
        v_zap_txt := lower(btrim(coalesce(it->>'whatsapp_declarado','')));
        v_zap := CASE
                   WHEN v_zap_txt IN ('true','t','1','sim','s','yes','y','x') THEN true
                   WHEN v_zap_txt IN ('false','f','0','nao','não','n','no')   THEN false
                   ELSE NULL                       -- não declarado / irreconhecível
                 END;
        UPDATE public.clients c
           SET phone = v_primeiro,
               phone_is_whatsapp = CASE WHEN v_zap IS TRUE THEN true ELSE c.phone_is_whatsapp END
         WHERE c.id = v_cli;
        v_atualizados := v_atualizados + 1;

        INSERT INTO public.data_review_log(client_id,campo,valor_original,valor_novo,motivo)
        VALUES (v_cli,'phone',NULL,v_primeiro,'importado_planilha ['||v_origem||']');
      ELSE
        -- Já tinha telefone: nada é sobrescrito. Se o da planilha é DIFERENTE, vira
        -- linha de conferência; se é o mesmo, é só confirmação e não polui o log.
        v_ja_tinha := v_ja_tinha + 1;
        IF v_phone_atual <> v_primeiro THEN
          INSERT INTO public.data_review_log(client_id,campo,valor_original,valor_novo,motivo)
          VALUES (v_cli,'phone',v_phone_atual,v_primeiro,
                  'telefone_divergente_conferir ['||v_origem||']');
        END IF;
      END IF;

      -- Do SEGUNDO em diante nos dois ramos: o primeiro já foi tratado acima
      -- (gravado em `phone`, ou logado como divergente, ou é o mesmo número que
      -- já está lá e não merece linha). Sem isso o nº 1 saía DUAS vezes no log
      -- — divergente E adicional — como o dry-run de 29/07 mostrou.
      v_i := 2;

      -- Todo telefone que não foi para `phone` fica registrado para a recepção
      -- rotular (comercial? residencial? de parente?) — não inventamos o rótulo.
      WHILE v_i <= array_length(v_tels,1) LOOP
        IF v_tels[v_i] IS DISTINCT FROM v_phone_atual THEN
          INSERT INTO public.data_review_log(client_id,campo,valor_original,valor_novo,motivo)
          VALUES (v_cli,'telefone_adicional',NULL,v_tels[v_i],
                  'telefone_adicional_aguardando_rotulo ['||v_origem||']');
          v_adicionais := v_adicionais + 1;
        END IF;
        v_i := v_i + 1;
      END LOOP;

    EXCEPTION WHEN OTHERS THEN
      v_erros := v_erros || jsonb_build_object('nome', v_nome, 'erro', SQLERRM);
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'clientes_atualizados', v_atualizados,   -- ganharam `phone` (estava vazio)
    'telefones_adicionais', v_adicionais,    -- logados para rótulo da recepção
    'ja_tinham_telefone',   v_ja_tinha,      -- intocados (inclui os 6 atuais)
    'ambiguos',             v_ambiguos,
    'sem_match',            v_sem_match,
    'erros',                v_erros);
END; $function$;

REVOKE EXECUTE ON FUNCTION public.importar_telefones_planilha(jsonb) FROM PUBLIC, anon;
