-- Espelho da migração aplicada via MCP (apply_migration) em prod — NÃO reexecutar.
-- FIX: no fluxo de distribuição o agente não localiza o caso (processo), nem
-- pelo número do protocolo. A tool consultar_processo não tinha resolvedor de
-- banco (era inerte, como delegate) — o handler antigo consultava a coluna
-- inexistente `numero` com ilike cru, cego ao prefixo `[TESTE] ` e à pontuação
-- do CNJ. Cria o resolvedor agent_consultar_processo (espelha
-- agent_consultar_cliente / agent_consultar_usuario). Aditivo: não altera
-- funções existentes.
--
-- Casa por: número do processo (só dígitos, tolerante a prefixo/pontuação),
-- nome do cliente e descrição (ex.: "agibank"). Retorna processo + cliente +
-- tipo de ação (tipo_acao_id p/ o agente chamar distribuir_caso; code/nome para
-- leitura humana) + responsável + status. UUIDs são de uso interno do agente
-- (guardrail H anti-UUID já cobre a exposição ao usuário).
CREATE OR REPLACE FUNCTION public.agent_consultar_processo(p_busca text)
 RETURNS TABLE(id uuid, process_number text, client_name text, client_id uuid,
               tipo_acao_id uuid, tipo_acao_code text, tipo_acao_nome text,
               responsible_lawyer_user_id uuid, status text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
declare
  v_raw    text := btrim(coalesce(p_busca,''));
  v_digits text := regexp_replace(coalesce(p_busca,''), '[^0-9]', '', 'g');
  v_norm   text := public.txt_fold(btrim(coalesce(p_busca,'')));
begin
  if not (public.is_recepcao_or_socio() or public.is_socio_or_advogado()) then
    return;
  end if;
  if v_raw = '' then
    return;
  end if;

  if length(v_digits) >= 5 then
    return query
      select p.id, p.process_number::text, p.client_name::text, p.client_id,
             p.tipo_acao_id, ta.code::text, ta.nome::text,
             p.responsible_lawyer_user_id, p.status::text
        from public.processes p
        left join public.tipos_acao ta on ta.id = p.tipo_acao_id
       where regexp_replace(coalesce(p.process_number,''), '[^0-9]', '', 'g') like '%'||v_digits||'%'
       order by p.updated_at desc
       limit 10;
  else
    return query
      select p.id, p.process_number::text, p.client_name::text, p.client_id,
             p.tipo_acao_id, ta.code::text, ta.nome::text,
             p.responsible_lawyer_user_id, p.status::text
        from public.processes p
        left join public.tipos_acao ta on ta.id = p.tipo_acao_id
       where public.txt_fold(coalesce(p.client_name,''))    like '%'||v_norm||'%'
          or public.txt_fold(coalesce(p.description,''))     like '%'||v_norm||'%'
          or public.txt_fold(coalesce(p.process_number,''))  like '%'||v_norm||'%'
       order by p.updated_at desc
       limit 10;
  end if;
end;
$fn$;

-- Grants espelhando os irmãos (authenticated + service_role; SEM anon/public).
-- Lembrar: REVOKE FROM PUBLIC não tira o grant explícito de anon das default
-- privileges do Supabase — por isso o REVOKE FROM anon explícito.
REVOKE ALL ON FUNCTION public.agent_consultar_processo(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agent_consultar_processo(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.agent_consultar_processo(text) TO authenticated, service_role;
