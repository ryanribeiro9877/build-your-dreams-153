-- [8.3] Picker de processo da audiência: leitura dos processos de um cliente por
-- client_id OU client_name, furando a RLS owner-only de `processes`
-- ("Users can view own processes" USING auth.uid()=user_id) via SECURITY DEFINER,
-- gated pelo MESMO papel que gerencia audiências (recepção+sócio+advogado).
--
-- Aditiva: NÃO altera as policies de `processes`. Espelha list_meeting_lawyers.
-- Necessária porque create_audiencia passou a exigir processo obrigatório: sem
-- esta leitura ampla, funcionários que não são donos do processo não conseguiriam
-- sequer selecioná-lo e ficariam impedidos de registrar audiências.
--
-- Aplicada em produção via MCP em 2026-07-13 (com aprovação do usuário). Este
-- arquivo é a paridade repo↔banco; idempotente (create or replace).

create or replace function public.list_client_processes(
  p_client_id uuid,
  p_client_name text
) returns table (id uuid, process_number text, description text)
language plpgsql stable security definer set search_path to 'public' as $function$
begin
  if not public.audiencias_can_manage() then
    raise exception 'list_client_processes: sem permissão' using errcode='42501';
  end if;
  return query
    select pr.id, pr.process_number, pr.description
    from public.processes pr
    where (p_client_id is not null and pr.client_id = p_client_id)
       or (nullif(btrim(coalesce(p_client_name,'')),'') is not null
           and pr.client_name = btrim(p_client_name))
    order by pr.process_number;
end $function$;

revoke all on function public.list_client_processes(uuid, text) from public, anon;
grant execute on function public.list_client_processes(uuid, text) to authenticated, service_role;
