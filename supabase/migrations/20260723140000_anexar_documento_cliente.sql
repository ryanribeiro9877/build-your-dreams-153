-- ============================================================================
-- B6 — Ponte chat → dossiê: RPC de vínculo + concessão da tool
-- ============================================================================
-- A cópia do binário (chat-attachments → client-documents) é feita no EDGE
-- (Storage API); esta RPC apenas cria a LINHA em client_documents com RBAC e
-- auditoria. "Dar baixa no checklist" é automático: o status de cada item é
-- derivado de client_documents (RPC client_document_checklist), então inserir a
-- linha com o document_type certo já move o item pendente para recebido.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.attach_client_document(
  p_client_id     uuid,
  p_document_type text,
  p_document_name text,
  p_file_path     text,
  p_file_size     bigint,
  p_mime_type     text
) RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
AS $function$
declare
  v_uid  uuid := auth.uid();
  v_name text;
  v_id   uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  -- Mesmo gate das RLS de client_documents: só recepção/sócio anexa ao dossiê.
  if not public.is_recepcao_or_socio() then
    raise exception 'sem permissão para anexar documentos ao cliente';
  end if;
  -- Valida o cliente e denormaliza o nome (full_name é texto de exibição, não PII cifrada).
  select full_name into v_name from public.clients where id = p_client_id;
  if not found then
    raise exception 'cliente não encontrado';
  end if;

  insert into public.client_documents(
    client_id, client_name, document_type, document_name, file_path,
    file_size, mime_type, uploaded_by, status, origem
  ) values (
    p_client_id, v_name, coalesce(nullif(btrim(p_document_type), ''), 'outro'),
    p_document_name, p_file_path, p_file_size, p_mime_type, v_uid, 'recebido', 'ocr'
  )
  returning id into v_id;

  return v_id;
end;
$function$;

REVOKE ALL     ON FUNCTION public.attach_client_document(uuid,text,text,text,bigint,text) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.attach_client_document(uuid,text,text,text,bigint,text) TO authenticated, service_role;

-- ── Catálogo da tool + concessão aos especialistas de cadastro/documentação ──
INSERT INTO public.tool_catalog (code, display_name, description, category, is_active)
VALUES (
  'anexar_documento_cliente',
  'Anexar Documento ao Cliente',
  'Vincula um documento já anexado no chat ao dossiê (aba Documentos) de um cliente cadastrado e dá baixa no checklist documental.',
  'acao', true
)
ON CONFLICT (code) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      description  = EXCLUDED.description,
      category     = EXCLUDED.category,
      is_active    = true;

-- Vincula a tool aos agentes de cadastro/documentação. O trigger
-- sync_agent_allowed_tools reconstrói agents.allowed_tools a partir de agent_tools.
INSERT INTO public.agent_tools (agent_id, tool_id, enabled)
SELECT a.id, tc.id, true
FROM public.agents a
JOIN public.tool_catalog tc ON tc.code = 'anexar_documento_cliente'
WHERE a.role = 'specialist'
  AND (a.name ILIKE '%cadastro%' OR a.name ILIKE '%documenta%')
ON CONFLICT (agent_id, tool_id) DO NOTHING;
