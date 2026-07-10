import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveCep } from "../cep.ts";
import { mapDocumentoToTipo, buildPendenciaTitulo } from "./docChecklist.ts";

// READ — recebe um SupabaseClient (client) e o user_id para escopar.
// IMPORTANTE (Correção A): para consultar_cliente o `client` DEVE carregar a
// IDENTIDADE do usuário (JWT), pois a RPC agent_consultar_cliente re-checa
// is_recepcao_or_socio() via auth.uid(); sob service-role auth.uid() é nulo e a
// RPC devolve SEMPRE vazio. Os call-sites (runEntryConsulta e o loop agêntico do
// N3) passam o client JWT; service-role só como fallback fail-safe.
export async function runReadTool(client: SupabaseClient, _userId: string, name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "consultar_cliente": {
      // R-2 Fase 2B: caminho cifrado. A RPC agent_consultar_cliente detecta
      // entrada numérica (CPF, com/sem máscara) -> índice cego (igualdade
      // exata); texto -> full_name. Devolve o CPF já decifrado. Não lê mais a
      // coluna de texto sensível diretamente.
      const q = String(args.busca ?? "").trim();
      const { data } = await client.rpc("agent_consultar_cliente", { p_busca: q });
      return data ?? [];
    }
    case "consultar_usuario": {
      const q = String(args.busca ?? "").trim();
      const { data } = await client.from("profiles")
        .select("user_id, display_name, role_template_id").ilike("display_name", `%${q}%`).limit(10);
      return data ?? [];
    }
    case "consultar_tarefas": {
      let qb = client.from("user_tasks").select("id, title, status, priority, deadline_at, assignee_user_id, client_id");
      if (args.client_id) qb = qb.eq("client_id", String(args.client_id));
      if (args.assignee_user_id) qb = qb.eq("assignee_user_id", String(args.assignee_user_id));
      if (args.status) qb = qb.eq("status", String(args.status));
      const { data } = await qb.limit(20);
      return data ?? [];
    }
    case "consultar_processo": {
      const q = String(args.busca ?? "").trim();
      const { data } = await client.from("processes").select("*").or(`numero.ilike.%${q}%`).limit(10);
      return data ?? [];
    }
    case "consultar_documentos": {
      const { data } = await client.from("client_documents")
        .select("id, document_type, document_name, created_at").eq("client_id", String(args.client_id))
        .neq("document_type", "audio_atendimento")
        .neq("document_type", "resumo_atendimento")
        .order("created_at", { ascending: false })
        .limit(50);
      return data ?? [];
    }
    case "consultar_cep": {
      // Reusa a cascata ViaCEP→BrasilAPI→OpenCEP (cep.ts). NÃO grava nada: o
      // especialista mostra o resultado e pede aprovação antes de usar no cadastro.
      const digits = String(args.cep ?? "").replace(/\D/g, "");
      if (digits.length !== 8) return { erro: "CEP inválido (precisa ter 8 dígitos)", cep: String(args.cep ?? "") };
      const r = await resolveCep(digits);
      return {
        cep: r.cep, logradouro: r.logradouro, bairro: r.bairro,
        cidade: r.localidade, uf: r.uf, fonte: r.fonte,
        encontrado: r.fonte !== "faixa" && !!r.localidade,
      };
    }
    default:
      throw new Error(`ferramenta de leitura desconhecida: ${name}`);
  }
}

// WRITE — recebe um client com a IDENTIDADE DO USUÁRIO (JWT), para RLS/RBAC valerem.
export async function runWriteTool(userClient: SupabaseClient, _userId: string, name: string, args: Record<string, unknown>): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  try {
    switch (name) {
      case "cadastrar_cliente": {
        // R-2 Fase 2C: escrita pela via CIFRADA. Chamamos a RPC save_client
        // (MESMO caminho do cadastro manual, ClientForm.tsx), que cifra a PII
        // server-side em *_enc/cpf_bidx e NUNCA grava as colunas de texto puro.
        // created_by é fixado server-side (auth.uid()); userClient carrega o JWT
        // do usuário, então a RLS/role-check (is_recepcao_or_socio) valem.
        const data: Record<string, unknown> = { full_name: args.full_name, status: "ativo" };
        for (const k of [
          "cpf","cnpj","tipo_pessoa","email","phone",
          // Endereço (não é PII cifrada no esquema 2C): a save_client já mapeia
          // estas chaves no INSERT (p_data->>'zip_code' etc.). Sem esta lista, a
          // tool aceitava o dado mas não o repassava (lacuna do CADASTRO-ENDERECO).
          "zip_code","address","address_number","address_complement","neighborhood","city","state",
        ]) if (args[k]) data[k] = args[k];
        const { data: newId, error } = await userClient.rpc("save_client", { p_id: null, p_data: data });
        if (error) {
          // Unicidade real de CPF = índice cego clients_cpf_bidx_uniq. Um INSERT
          // duplicado devolve 23505 → mesma mensagem da UX do cadastro, em vez de
          // um erro genérico de constraint.
          if ((error as { code?: string }).code === "23505") {
            return { ok: false, error: "CPF já cadastrado no sistema." };
          }
          return { ok: false, error: error.message };
        }
        return { ok: true, result: { id: newId, full_name: args.full_name } };
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
      case "solicitar_checklist_documental": {
        const docs = Array.isArray(args.documentos)
          ? (args.documentos as unknown[]).map((d) => String(d)).filter((d) => d.trim())
          : [];
        if (docs.length === 0) return { ok: false, error: "nenhum documento informado" };
        // Trima o réu uma vez: título e descrição ficam consistentes (réu só-espaços
        // é ignorado em ambos, igual ao buildPendenciaTitulo).
        const reu = ((args.reu as string | undefined) ?? "").trim() || null;
        const created: string[] = [];
        for (const doc of docs) {
          const { data, error } = await userClient.rpc("criar_pendencia", {
            p_tipo: mapDocumentoToTipo(doc),
            p_titulo: buildPendenciaTitulo(doc, reu),
            p_cliente_id: args.cliente_id ?? null,
            p_descricao: reu ? `Documento solicitado referente ao réu ${reu}.` : "Documento solicitado (checklist do atendimento).",
            p_responsavel_user_id: args.responsavel_user_id ?? null,
            p_prazo: args.prazo ?? null, p_data_fatal: null,
          });
          if (error) return { ok: false, error: `falha ao criar pendência para "${doc}": ${error.message}`, result: { pendencias: created } };
          created.push(String(data));
        }
        return { ok: true, result: { pendencias: created, total: created.length } };
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
