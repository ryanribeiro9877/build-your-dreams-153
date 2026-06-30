import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// READ — recebe o client admin (service-role) e o user_id para escopar.
export async function runReadTool(admin: SupabaseClient, _userId: string, name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "consultar_cliente": {
      const q = String(args.busca ?? "").trim();
      const { data } = await admin.from("clients")
        .select("id, full_name, cpf, status")
        .or(`full_name.ilike.%${q}%,cpf.ilike.%${q}%`).limit(10);
      return data ?? [];
    }
    case "consultar_usuario": {
      const q = String(args.busca ?? "").trim();
      const { data } = await admin.from("profiles")
        .select("user_id, display_name, role_template_id").ilike("display_name", `%${q}%`).limit(10);
      return data ?? [];
    }
    case "consultar_tarefas": {
      let qb = admin.from("user_tasks").select("id, title, status, priority, deadline_at, assignee_user_id, client_id");
      if (args.client_id) qb = qb.eq("client_id", String(args.client_id));
      if (args.assignee_user_id) qb = qb.eq("assignee_user_id", String(args.assignee_user_id));
      if (args.status) qb = qb.eq("status", String(args.status));
      const { data } = await qb.limit(20);
      return data ?? [];
    }
    case "consultar_processo": {
      const q = String(args.busca ?? "").trim();
      const { data } = await admin.from("processes").select("*").or(`numero.ilike.%${q}%`).limit(10);
      return data ?? [];
    }
    case "consultar_documentos": {
      const { data } = await admin.from("client_documents")
        .select("id, document_type, document_name, created_at").eq("client_id", String(args.client_id)).limit(50);
      return data ?? [];
    }
    default:
      throw new Error(`ferramenta de leitura desconhecida: ${name}`);
  }
}

// WRITE — recebe um client com a IDENTIDADE DO USUÁRIO (JWT), para RLS/RBAC valerem.
export async function runWriteTool(userClient: SupabaseClient, userId: string, name: string, args: Record<string, unknown>): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  try {
    switch (name) {
      case "cadastrar_cliente": {
        const payload: Record<string, unknown> = { created_by: userId, full_name: args.full_name, status: "ativo" };
        for (const k of ["cpf","cnpj","tipo_pessoa","email","phone"]) if (args[k]) payload[k] = args[k];
        const { data, error } = await userClient.from("clients").insert(payload).select("id, full_name").single();
        if (error) return { ok: false, error: error.message };
        return { ok: true, result: data };
      }
      case "criar_card_tarefa": {
        const { data, error } = await userClient.rpc("create_user_task", {
          p_task_type_id: args.task_type_id, p_assignee_user_id: args.assignee_user_id,
          p_title: args.title, p_description: args.descricao ?? null, p_client_id: args.client_id ?? null,
          p_priority: args.prioridade ?? "medium", p_deadline_at: args.deadline_at ?? null,
          p_area: args.area ?? null, p_payload: {}, p_external_kanban_ref: null,
        });
        if (error) return { ok: false, error: error.message };
        return { ok: true, result: { task_id: data } };
      }
      case "solicitar_documentos": {
        const { data, error } = await userClient.rpc("create_inter_assistant_request", {
          p_to_user_id: args.to_user_id, p_request_type: "solicitar_documentacao",
          p_payload: { client_id: args.client_id ?? null, documentos: args.documentos ?? [] },
          p_related_task_id: null, p_expires_in_hours: 72,
        });
        if (error) return { ok: false, error: error.message };
        return { ok: true, result: { request_id: data } };
      }
      case "pedir_acesso_arquivos": {
        const { data, error } = await userClient.rpc("create_inter_assistant_request", {
          p_to_user_id: args.to_user_id, p_request_type: "pedir_acesso_a_arquivos",
          p_payload: { descricao: args.descricao, motivo: args.motivo ?? null },
          p_related_task_id: null, p_expires_in_hours: 72,
        });
        if (error) return { ok: false, error: error.message };
        return { ok: true, result: { request_id: data } };
      }
      case "criar_pendencia": {
        const { data, error } = await userClient.rpc("criar_pendencia", {
          p_tipo: args.tipo, p_titulo: args.titulo, p_cliente_id: args.cliente_id ?? null,
          p_descricao: args.descricao ?? null, p_responsavel_user_id: args.responsavel_user_id ?? null,
          p_prazo: args.prazo ?? null, p_data_fatal: args.data_fatal ?? null,
        });
        if (error) return { ok: false, error: error.message };
        return { ok: true, result: { task_id: data } };
      }
      case "transferir_pendencia": {
        const { data, error } = await userClient.rpc("transferir_pendencia", {
          p_id: args.pendencia_id, p_departamento_destino: args.departamento_destino ?? null,
          p_responsavel_destino: args.responsavel_destino ?? null,
        });
        if (error) return { ok: false, error: error.message };
        return { ok: true, result: { task_id: data } };
      }
      case "resolver_pendencia": {
        const { data, error } = await userClient.rpc("resolver_pendencia", {
          p_id: args.pendencia_id, p_resolucao: args.resolucao ?? null,
        });
        if (error) return { ok: false, error: error.message };
        return { ok: true, result: { task_id: data } };
      }
      case "agendar_reuniao": {
        const { data, error } = await userClient.rpc("criar_pendencia", {
          p_tipo: "reuniao", p_titulo: args.titulo, p_cliente_id: args.cliente_id ?? null,
          p_descricao: `Reunião ${args.modalidade ?? ""} em ${args.data_hora_iso}`,
          p_responsavel_user_id: null, p_prazo: args.data_hora_iso ?? null, p_data_fatal: null,
        });
        if (error) return { ok: false, error: error.message };
        return { ok: true, result: { task_id: data } };
      }
      default:
        return { ok: false, error: `ferramenta de escrita desconhecida: ${name}` };
    }
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? "erro" };
  }
}

// Encaminha como pendência quando o usuário não tem permissão para a ação.
export async function routeAsPendencia(userClient: SupabaseClient, adminUserId: string, tool: string, args: Record<string, unknown>): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  const { data, error } = await userClient.rpc("create_inter_assistant_request", {
    p_to_user_id: adminUserId, p_request_type: "aprovar_acao_chat",
    p_payload: { tool, args }, p_related_task_id: null, p_expires_in_hours: 72,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, result: { request_id: data, routed: true } };
}
