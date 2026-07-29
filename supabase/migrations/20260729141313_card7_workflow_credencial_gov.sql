-- ============================================================================
-- ESPELHO de migração JÁ APLICADA em produção (29/07/2026). NÃO rodar `db push`.
-- Recuperada verbatim de supabase_migrations.schema_migrations.statements[1]
-- (version 20260729141313), então bate byte a byte com o que está no ar.
-- ============================================================================

-- CARD 7 (Motor 2) — Workflow de credencial GOV sobre o cofre do Card 1.
-- SUSEP organiza por estado da credencial: nível (clients.gov_br_profile),
-- tem_2fa e status_acesso (client_gov_credentials). Aqui: fila por estado,
-- agendamento de conversão bronze→prata/ouro (vira pendência; o atendimento em si
-- usa o fluxo de agendamento existente do chat), e mudança de estado por 1 frase.

CREATE OR REPLACE FUNCTION public.fila_credenciais_gov(p_estado text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE v_e text; v_out jsonb;
BEGIN
  IF NOT (public.is_recepcao_or_socio() OR public.has_role(auth.uid(),'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'sem permissão' USING errcode='42501';
  END IF;
  v_e := lower(btrim(coalesce(p_estado,'')));
  IF v_e NOT IN ('bronze','prata','ouro','2fa','invalido','bloqueado','sem_senha','sem_credencial') THEN
    RETURN jsonb_build_object('ok',false,'motivo','estado_invalido',
      'mensagem','Estados: bronze, prata, ouro, 2fa, invalido, bloqueado, sem_senha, sem_credencial.');
  END IF;

  SELECT jsonb_agg(jsonb_build_object('cliente',x.full_name,'nivel',x.nivel,
           'tem_2fa',x.tem_2fa,'status_acesso',x.status,'tem_senha',x.tem_senha)
         ORDER BY x.full_name)
    INTO v_out
  FROM (
    SELECT cd.full_name, c.gov_br_profile AS nivel, g.tem_2fa,
           g.status_acesso AS status, (g.gov_senha_enc IS NOT NULL) AS tem_senha
    FROM public.clients c
    JOIN public.clients_decrypted cd ON cd.id=c.id
    LEFT JOIN public.client_gov_credentials g ON g.client_id=c.id
    WHERE CASE v_e
      WHEN 'bronze'         THEN c.gov_br_profile='bronze'
      WHEN 'prata'          THEN c.gov_br_profile='prata'
      WHEN 'ouro'           THEN c.gov_br_profile='ouro'
      WHEN '2fa'            THEN g.tem_2fa IS TRUE
      WHEN 'invalido'       THEN g.status_acesso='invalido'
      WHEN 'bloqueado'      THEN g.status_acesso='bloqueado'
      WHEN 'sem_senha'      THEN g.id IS NOT NULL AND g.gov_senha_enc IS NULL
      WHEN 'sem_credencial' THEN g.id IS NULL
    END
  ) x;

  RETURN jsonb_build_object('ok',true,'estado',v_e,
    'total',coalesce(jsonb_array_length(v_out),0),'clientes',coalesce(v_out,'[]'::jsonb));
END; $$;

CREATE OR REPLACE FUNCTION public.atualizar_status_credencial_gov(
  p_status text, p_client_id uuid DEFAULT NULL, p_cliente_nome text DEFAULT NULL, p_observacao text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE v_cli uuid; v_nome text; v_n int; v_cands jsonb; v_status text; v_task uuid;
BEGIN
  IF NOT (public.is_recepcao_or_socio() OR public.has_role(auth.uid(),'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'sem permissão' USING errcode='42501';
  END IF;
  v_status := lower(btrim(coalesce(p_status,'')));
  v_status := CASE WHEN v_status IN ('senha_incorreta','incorreta','errada','invalida','invalido') THEN 'invalido'
                   WHEN v_status IN ('bloqueado','bloqueada') THEN 'bloqueado'
                   WHEN v_status IN ('valido','ok','funcionando') THEN 'valido'
                   WHEN v_status IN ('pendente') THEN 'pendente'
                   ELSE NULL END;
  IF v_status IS NULL THEN
    RETURN jsonb_build_object('ok',false,'motivo','status_invalido',
      'mensagem','Status: valido, invalido (senha incorreta), bloqueado ou pendente.');
  END IF;

  v_cli := p_client_id;
  IF v_cli IS NULL AND nullif(btrim(coalesce(p_cliente_nome,'')),'') IS NOT NULL THEN
    SELECT count(*) INTO v_n FROM public.clients_decrypted cd WHERE cd.full_name ILIKE '%'||btrim(p_cliente_nome)||'%';
    IF v_n = 0 THEN RETURN jsonb_build_object('ok',false,'motivo','cliente_nao_encontrado'); END IF;
    IF v_n > 1 THEN
      SELECT jsonb_agg(x) INTO v_cands FROM (SELECT jsonb_build_object('nome',cd.full_name) x
        FROM public.clients_decrypted cd WHERE cd.full_name ILIKE '%'||btrim(p_cliente_nome)||'%' LIMIT 5) z;
      RETURN jsonb_build_object('ok',false,'motivo','ambiguo','candidatos',v_cands);
    END IF;
    SELECT cd.id INTO v_cli FROM public.clients_decrypted cd WHERE cd.full_name ILIKE '%'||btrim(p_cliente_nome)||'%' LIMIT 1;
  END IF;
  IF v_cli IS NULL THEN RETURN jsonb_build_object('ok',false,'motivo','cliente_nao_informado'); END IF;
  SELECT cd.full_name INTO v_nome FROM public.clients_decrypted cd WHERE cd.id=v_cli;

  UPDATE public.client_gov_credentials g
     SET status_acesso = v_status, updated_by = auth.uid(), updated_at = now()
   WHERE g.client_id = v_cli;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok',false,'motivo','sem_credencial',
      'mensagem','Este cliente não tem credencial no cofre. Registre-a primeiro (registrar_credencial_gov ou ficha → aba Gov.br).');
  END IF;

  IF v_status IN ('invalido','bloqueado') THEN
    IF NOT EXISTS (SELECT 1 FROM public.user_tasks t
                    WHERE t.is_pendencia AND t.pendencia_tipo='recuperacao_senha_gov'
                      AND t.client_id=v_cli AND t.completed_at IS NULL AND t.cancelled_at IS NULL) THEN
      v_task := public.criar_pendencia('recuperacao_senha_gov',
        'Recuperar acesso gov.br: '||v_nome, v_cli,
        coalesce(nullif(btrim(coalesce(p_observacao,'')),''),
          CASE v_status WHEN 'invalido' THEN 'Senha incorreta — fazer recuperação de senha com o cliente.'
                        ELSE 'Conta bloqueada — orientar desbloqueio.' END),
        auth.uid(), NULL, NULL, 'kanban_pendencias');
    END IF;
  END IF;

  RETURN jsonb_build_object('ok',true,'cliente',v_nome,'status_acesso',v_status,
    'pendencia_recuperacao_criada',(v_task IS NOT NULL));
END; $$;

CREATE OR REPLACE FUNCTION public.agendar_conversao_gov(
  p_client_id uuid DEFAULT NULL, p_cliente_nome text DEFAULT NULL,
  p_ate date DEFAULT NULL, p_observacao text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE v_cli uuid; v_nome text; v_n int; v_cands jsonb; v_nivel text; v_task uuid;
BEGIN
  IF NOT (public.is_recepcao_or_socio() OR public.has_role(auth.uid(),'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'sem permissão' USING errcode='42501';
  END IF;
  v_cli := p_client_id;
  IF v_cli IS NULL AND nullif(btrim(coalesce(p_cliente_nome,'')),'') IS NOT NULL THEN
    SELECT count(*) INTO v_n FROM public.clients_decrypted cd WHERE cd.full_name ILIKE '%'||btrim(p_cliente_nome)||'%';
    IF v_n = 0 THEN RETURN jsonb_build_object('ok',false,'motivo','cliente_nao_encontrado'); END IF;
    IF v_n > 1 THEN
      SELECT jsonb_agg(x) INTO v_cands FROM (SELECT jsonb_build_object('nome',cd.full_name) x
        FROM public.clients_decrypted cd WHERE cd.full_name ILIKE '%'||btrim(p_cliente_nome)||'%' LIMIT 5) z;
      RETURN jsonb_build_object('ok',false,'motivo','ambiguo','candidatos',v_cands);
    END IF;
    SELECT cd.id INTO v_cli FROM public.clients_decrypted cd WHERE cd.full_name ILIKE '%'||btrim(p_cliente_nome)||'%' LIMIT 1;
  END IF;
  IF v_cli IS NULL THEN RETURN jsonb_build_object('ok',false,'motivo','cliente_nao_informado'); END IF;

  SELECT cd.full_name, c.gov_br_profile INTO v_nome, v_nivel
    FROM public.clients c JOIN public.clients_decrypted cd ON cd.id=c.id WHERE c.id=v_cli;

  IF EXISTS (SELECT 1 FROM public.user_tasks t
              WHERE t.is_pendencia AND t.pendencia_tipo='conversao_conta_gov'
                AND t.client_id=v_cli AND t.completed_at IS NULL AND t.cancelled_at IS NULL) THEN
    RETURN jsonb_build_object('ok',false,'motivo','ja_agendada',
      'mensagem','Já existe pendência de conversão aberta para este cliente.');
  END IF;

  v_task := public.criar_pendencia('conversao_conta_gov',
    'Conversão de conta gov.br: '||v_nome||coalesce(' (nível atual: '||v_nivel||')',''),
    v_cli,
    coalesce(nullif(btrim(coalesce(p_observacao,'')),''),
      'Conta bronze exige vinda presencial para reconhecimento facial. Agendar atendimento com o cliente (use o agendamento normal) e concluir esta pendência quando o nível subir.'),
    auth.uid(), p_ate::timestamptz, p_ate, 'kanban_pendencias');

  RETURN jsonb_build_object('ok',true,'cliente',v_nome,'nivel_atual',v_nivel,'pendencia_id',v_task,
    'ate',p_ate,'proximo_passo','Agendar o atendimento presencial pelo fluxo normal de agendamento.');
END; $$;

REVOKE EXECUTE ON FUNCTION public.fila_credenciais_gov(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.atualizar_status_credencial_gov(text,uuid,text,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.agendar_conversao_gov(uuid,text,date,text) FROM PUBLIC, anon;

INSERT INTO public.tool_catalog (code, display_name, description, category, icon, tool_schema, sort_order, is_active) VALUES
('fila_credenciais_gov','Fila de credenciais gov.br por estado',
 'Lista clientes por estado da credencial: bronze, prata, ouro, 2FA, inválida, bloqueada, sem senha, sem credencial.',
 'consulta','🔎',
 '{"name":"fila_credenciais_gov","description":"Fila de trabalho da SUSEP: lista clientes por estado da credencial gov.br. Ex.: \"quais clientes são bronze?\", \"quem está com senha inválida?\", \"quem tem 2FA?\". NUNCA revela senhas.","parameters":{"type":"object","required":["estado"],"properties":{"estado":{"type":"string","description":"bronze, prata, ouro, 2fa, invalido, bloqueado, sem_senha ou sem_credencial."}}}}'::jsonb, 130, true),
('atualizar_status_credencial_gov','Atualizar status da credencial gov.br',
 'Marca a credencial como válida, inválida (senha incorreta), bloqueada ou pendente; inválida/bloqueada gera pendência de recuperação.',
 'acao','🔧',
 '{"name":"atualizar_status_credencial_gov","description":"Atualiza o estado de acesso da credencial gov.br de um cliente. Ex.: \"a senha da Dona Elza está errada\" → status invalido + pendência de recuperação de senha. NUNCA pedir ou repetir a senha em texto.","parameters":{"type":"object","required":["status"],"properties":{"status":{"type":"string","description":"valido, invalido, bloqueado ou pendente."},"client_id":{"type":"string"},"cliente_nome":{"type":"string"},"observacao":{"type":"string"}}}}'::jsonb, 131, true),
('agendar_conversao_gov','Agendar conversão de conta gov.br',
 'Abre pendência de conversão de conta (bronze→prata/ouro exige presencial com reconhecimento facial).',
 'acao','🔧',
 '{"name":"agendar_conversao_gov","description":"Abre a pendência de conversão de conta gov.br para um cliente (bronze exige vinda presencial para reconhecimento facial). O atendimento em si é marcado pelo fluxo normal de agendamento; esta pendência acompanha até o nível subir.","parameters":{"type":"object","properties":{"client_id":{"type":"string"},"cliente_nome":{"type":"string"},"ate":{"type":"string","description":"Data-limite (YYYY-MM-DD), opcional — vira data fatal da pendência."},"observacao":{"type":"string"}}}}'::jsonb, 132, true);

UPDATE public.agents
   SET allowed_tools = allowed_tools || ARRAY['fila_credenciais_gov','atualizar_status_credencial_gov','agendar_conversao_gov']
 WHERE allowed_tools @> ARRAY['registrar_relacao_bancaria']
   AND NOT allowed_tools @> ARRAY['fila_credenciais_gov'];
