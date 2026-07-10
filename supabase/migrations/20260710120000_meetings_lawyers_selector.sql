-- Seletor de "Advogado" da Agenda: em vez de listar todos os empregados logáveis
-- (list_assignable_users), lista APENAS sócio + advogadas, identificados por
-- role_templates.code — o mesmo modelo de papel usado no RLS das meetings
-- (meetings_can_access). Isso evita o "seletor que promete e não entrega":
-- oferecer no dropdown gente que não é advogada.
--
-- Aditiva: cria uma função nova, não altera list_assignable_users (usada pelo
-- Kanban / TarefaConfirmCard, que devem continuar vendo o roster completo) nem
-- nenhuma tabela existente.
CREATE OR REPLACE FUNCTION public.list_meeting_lawyers()
RETURNS TABLE (user_id uuid, name text, role_label text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
begin
  -- Gate 1:1 com o acesso à agenda (recepção, advogadas, sócio, admin). Papéis
  -- fora disso recebem 42501 e o front trata como lista vazia.
  if not public.meetings_can_access() then
    raise exception 'Acesso negado: sem permissão para listar advogados da agenda'
      using errcode = '42501';
  end if;

  return query
  select p.user_id,
         coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(p.display_name), ''), 'Sem nome') as name,
         rt.display_name as role_label
    from public.profiles p
    join public.role_templates rt on rt.id = p.role_template_id
   where p.user_id is not null
     and rt.has_login is not false
     and (rt.code = 'socio' or rt.code like 'adv_%')  -- espelha meetings_can_access (parte "advogado")
   order by name;
end;
$$;

REVOKE ALL ON FUNCTION public.list_meeting_lawyers() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_meeting_lawyers() TO authenticated;
