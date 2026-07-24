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
      // Resolvedor determinístico de DESTINATÁRIO. A RPC agent_consultar_usuario
      // casa papel/cargo ("o sócio"), nome, e-mail e app_role com fold de acento
      // — mesmos candidatos que list_assignable_users. Substitui o ilike cru em
      // profiles.display_name, que era cego a papel/cargo/"admin" (por isso "o
      // sócio" caía em 0 e o agente pedia o nome). Re-checa is_recepcao_or_socio()
      // via auth.uid(), então usa o `client` com JWT (igual a consultar_cliente).
      const q = String(args.busca ?? "").trim();
      const { data } = await client.rpc("agent_consultar_usuario", { p_busca: q });
      return data ?? [];
    }
    case "minha_agenda": {
      // Consulta escopo auth.uid() (a RPC filtra). Omitir args = hoje (defaults da RPC).
      const rpcArgs: Record<string, unknown> = {};
      if (args.de) rpcArgs.p_de = args.de;
      if (args.ate) rpcArgs.p_ate = args.ate;
      const { data } = await client.rpc("minha_agenda", rpcArgs);
      return data ?? {};
    }
    case "consultar_audiencias": {
      const { data } = await client.rpc("consultar_audiencias", {
        p_de: args.de, p_ate: args.ate, p_processo: args.process_id ?? null,
      });
      return data ?? [];
    }
    case "resumo_do_dia": {
      const { data } = await client.rpc("resumo_do_dia");
      return data ?? {};
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
      // Resolvedor determinístico de PROCESSO/CASO (espelha consultar_cliente/
      // consultar_usuario). A RPC agent_consultar_processo detecta número (>=5
      // dígitos) e compara SÓ os dígitos do process_number — tolerante ao
      // prefixo `[TESTE] ` de teste e à pontuação variável do CNJ; caso texto,
      // casa nome do cliente/descrição/número com fold de acento. Substitui o
      // .from("processes").or("numero.ilike...") antigo, que consultava uma
      // coluna inexistente (a real é process_number) e não casava número limpo.
      // Re-checa papel via auth.uid(), então usa o `client` com JWT.
      const q = String(args.busca ?? "").trim();
      const { data } = await client.rpc("agent_consultar_processo", { p_busca: q });
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
    case "get_revisao_peca_context": {
      // Contexto da revisão (peça + metadados). RPC SECURITY DEFINER; roda sob a
      // identidade do usuário (o `client` carrega o JWT).
      const { data } = await client.rpc("get_revisao_peca_context", { p_task_id: String(args.task_id) });
      return data ?? {};
    }
    default:
      throw new Error(`ferramenta de leitura desconhecida: ${name}`);
  }
}

// WRITE — recebe um client com a IDENTIDADE DO USUÁRIO (JWT), para RLS/RBAC valerem.
// Sanitiza o nome do objeto p/ o Storage (ASCII restrito) — chave com acento/ç
// devolve HTTP 400. Espelha o sanitizeName do frontend (clientDocuments.ts).
function sanitizeStorageName(name: string): string {
  const s = (name || "arquivo")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^\w.-]+/g, "_").slice(0, 120);
  return s || "arquivo";
}

// WRITE — recebe o client com JWT do usuário (userClient, p/ RLS/RBAC) e um
// client service-role (admin) usado por tools que precisam do Storage (cópia de
// binário entre buckets), que a RLS de storage não cobre de forma estável.
export async function runWriteTool(userClient: SupabaseClient, _userId: string, name: string, args: Record<string, unknown>, admin: SupabaseClient): Promise<{ ok: boolean; result?: unknown; error?: string }> {
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
      case "distribuir_caso": {
        const { data, error } = await userClient.rpc("distribuir_caso", {
          p_process_id: args.process_id,
          p_tipo_acao_id: args.tipo_acao_id ?? null,
          p_task_type_id: args.task_type_id ?? null,
          p_title: args.title ?? null,
          // Destinatário resolvido via consultar_usuario (override manual). Sem
          // ele, a RPC cai no responsável do processo e depois no da área.
          p_responsible_lawyer_user_id: args.responsible_lawyer_user_id ?? null,
        });
        if (error) return { ok: false, error: error.message };
        return { ok: true, result: { task_id: data } };
      }
      case "agendar_atendimento": {
        // Atendimento de cliente → RPC create_meeting (mesma via da Agenda). A RPC
        // IMPÕE o gate (recepção/sócio/admin via meetings_can_create), o advogado
        // obrigatório, o expediente/slot e o bloqueio de passado — os erros dela são
        // legíveis e voltam ao usuário como estão. created_by = auth.uid() (userClient
        // carrega o JWT). lawyer_name é só exibição (não vai para o banco).
        const { data: meetingId, error } = await userClient.rpc("create_meeting", {
          p_scheduled_date: args.scheduled_date,
          p_start_time: args.start_time,
          p_end_time: args.end_time ?? null,
          p_client_id: args.client_id ?? null,
          p_client_name: args.client_name ?? null,
          p_phone: args.phone ?? null,
          p_type: args.type ?? null,
          p_lawyer_user_id: args.lawyer_user_id ?? null,
          p_summary: args.summary ?? null,
        });
        if (error) return { ok: false, error: error.message };
        // create_task encadeia create_meeting_task(meeting_id). Falha na tarefa NÃO
        // desfaz o agendamento (a reunião já está criada) — sinaliza como aviso.
        let taskId: string | null = null;
        if (args.create_task === true && meetingId) {
          const { data: t, error: te } = await userClient.rpc("create_meeting_task", { p_meeting_id: meetingId });
          if (te) return { ok: true, result: { meeting_id: meetingId, task_warning: te.message } };
          taskId = (t as string) ?? null;
        }
        return { ok: true, result: { meeting_id: meetingId, task_id: taskId } };
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
      case "decidir_revisao_peca": {
        // A RPC exige assignee_user_id = auth.uid() (ou master) e, para aprovar,
        // p_aceite=true. userClient carrega o JWT do revisor humano.
        const { data, error } = await userClient.rpc("decidir_revisao_peca", {
          p_task_id: args.task_id,
          p_decisao: args.decisao,
          p_observacoes: args.observacoes ?? null,
          p_aceite: args.aceite === true,
        });
        if (error) return { ok: false, error: error.message };
        return { ok: true, result: { status: data } };
      }
      case "anexar_documento_cliente": {
        // O attachment_id é carimbado deterministicamente em proposeAction (o LLM
        // não vê UUIDs). Copia o binário chat-attachments → client-documents e cria
        // a linha; a "baixa no checklist" é automática (status derivado da linha).
        const attId = String((args as Record<string, unknown>).__attachment_id ?? "");
        const clientId = String(args.client_id ?? "");
        const docType = String(args.document_type ?? "").trim() || "outro";
        if (!clientId) return { ok: false, error: "cliente não informado (resolva com consultar_cliente)." };
        if (!attId) return { ok: false, error: "não identifiquei qual anexo vincular — nenhum documento foi anexado nesta conversa (ou o nome não bateu)." };
        // 1. lê o anexo do chat (service-role; o id já veio carimbado do turno).
        const { data: att } = await admin.from("chat_attachments")
          .select("storage_path, file_name, mime_type, file_size").eq("id", attId).maybeSingle();
        if (!att) return { ok: false, error: "anexo não encontrado." };
        const a = att as { storage_path: string; file_name: string; mime_type: string | null; file_size: number | null };
        // 2. baixa o binário.
        const { data: blob, error: dlErr } = await admin.storage.from("chat-attachments").download(a.storage_path);
        if (dlErr || !blob) return { ok: false, error: "falha ao ler o anexo do chat." };
        // 3. copia para o dossiê do cliente (bucket client-documents).
        const newPath = `${clientId}/${Date.now()}_chat_${sanitizeStorageName(a.file_name)}`;
        const { error: upErr } = await admin.storage.from("client-documents")
          .upload(newPath, blob, { contentType: a.mime_type ?? undefined, upsert: false });
        if (upErr) return { ok: false, error: "falha ao salvar o documento no dossiê." };
        // 4. cria a linha com o JWT do usuário (RBAC + auditoria via trigger).
        const { data: docId, error: insErr } = await userClient.rpc("attach_client_document", {
          p_client_id: clientId, p_document_type: docType, p_document_name: a.file_name,
          p_file_path: newPath, p_file_size: a.file_size ?? null, p_mime_type: a.mime_type ?? null,
        });
        if (insErr) {
          await admin.storage.from("client-documents").remove([newPath]).then(() => {}, () => {}); // remove órfão
          return { ok: false, error: insErr.message };
        }
        return { ok: true, result: { document_id: docId, document_type: docType, document_name: a.file_name } };
      }
      case "atualizar_tarefa": {
        // Gate = kanban_can_edit_task dentro da RPC (o chat não pode mais que a tela).
        // task_titulo é só display do card; não vai à RPC.
        const { data, error } = await userClient.rpc("atualizar_tarefa", {
          p_task_id: args.task_id,
          p_status: args.status ?? null,
          p_prazo: args.prazo ?? null,
          p_prioridade: args.prioridade ?? null,
          p_titulo: args.novo_titulo ?? null,
        });
        if (error) return { ok: false, error: error.message };
        return { ok: true, result: data };
      }
      case "comentar_card": {
        // Gate = kanban_can_edit_task dentro de add_task_comment (backend pronto).
        const { data, error } = await userClient.rpc("add_task_comment", {
          p_task_id: args.task_id, p_body: args.comentario,
        });
        if (error) return { ok: false, error: error.message };
        return { ok: true, result: data };
      }
      case "atualizar_cliente": {
        // Monta o jsonb só com os campos da whitelist presentes; a RPC reaplica a
        // whitelist e o gate (is_recepcao/admin/has_menu_grant 'clientes').
        const fields: Record<string, unknown> = {};
        for (const k of ["phone","email","address","address_number","address_complement","neighborhood","city","state","zip_code","birth_date","client_origin","tipo_pessoa","status"]) {
          const v = (args as Record<string, unknown>)[k];
          if (v !== undefined && v !== null && String(v).trim() !== "") fields[k] = v;
        }
        const { data, error } = await userClient.rpc("atualizar_cliente", { p_client_id: args.client_id, p_fields: fields });
        if (error) return { ok: false, error: error.message };
        return { ok: true, result: data };
      }
      case "reagendar_atendimento": {
        const { data, error } = await userClient.rpc("reagendar_atendimento", {
          p_id: args.meeting_id, p_nova_data: args.nova_data, p_nova_hora: args.nova_hora,
        });
        if (error) return { ok: false, error: error.message };
        return { ok: true, result: data };
      }
      case "cancelar_atendimento": {
        const { data, error } = await userClient.rpc("cancelar_atendimento", {
          p_id: args.meeting_id, p_motivo: args.motivo ?? null,
        });
        if (error) return { ok: false, error: error.message };
        return { ok: true, result: data };
      }
      case "criar_audiencia": {
        const { data, error } = await userClient.rpc("criar_audiencia", {
          p_process_id: args.process_id, p_data: args.data, p_hora: args.hora,
          p_tipo: args.tipo, p_local: args.local ?? null, p_notes: args.notes ?? null,
        });
        if (error) return { ok: false, error: error.message };
        return { ok: true, result: data };
      }
      case "criar_processo": {
        const { data, error } = await userClient.rpc("criar_processo", {
          p_client_id: args.client_id, p_tipo_acao: args.tipo_acao ?? null,
          p_numero: args.numero ?? null, p_reu: args.reu ?? null, p_notes: args.notes ?? null,
        });
        if (error) return { ok: false, error: error.message };
        // Duplicata: a RPC devolve ok:false + message (não lança exceção).
        const r = data as { ok?: boolean; message?: string } | null;
        if (r && r.ok === false) return { ok: false, error: r.message ?? "Já existe um processo com esse número." };
        return { ok: true, result: data };
      }
      case "atualizar_processo": {
        const fields: Record<string, unknown> = {};
        for (const k of ["andamento","status","next_hearing_date"]) {
          const v = (args as Record<string, unknown>)[k];
          if (v !== undefined && v !== null && String(v).trim() !== "") fields[k] = v;
        }
        const { data, error } = await userClient.rpc("atualizar_processo", { p_process_id: args.process_id, p_fields: fields });
        if (error) return { ok: false, error: error.message };
        return { ok: true, result: data };
      }
      case "registrar_protocolo": {
        // Gate = update_user_task_status (assignee/assigner/master) + trigger 8.5
        // (2 docs), tudo dentro da RPC. Ela devolve ok:false amigável quando o gate
        // de documentos não fechou (em vez do erro cru do trigger).
        const { data, error } = await userClient.rpc("registrar_protocolo", {
          p_task_id: args.task_id, p_observacao: args.observacao ?? null,
        });
        if (error) return { ok: false, error: error.message };
        const r = data as { ok?: boolean; bloqueado?: boolean; faltam?: string[]; erro?: string } | null;
        if (r && r.ok === false) {
          if (r.bloqueado) return { ok: false, error: `Protocolo bloqueado — faltam os documentos: ${(r.faltam ?? []).join(", ")}. Anexe-os ao cliente antes de protocolar.` };
          return { ok: false, error: r.erro ?? "não foi possível protocolar." };
        }
        return { ok: true, result: data };
      }
      case "gerar_kit_documental": {
        // A geração roda na edge `gerar-kit-documental` (porte da engine JSZip +
        // templates). Invocamos via userClient.functions.invoke: o supabase-js
        // repassa o Authorization (JWT do usuário) da conexão → a edge lê o cliente,
        // sobe o binário e insere client_documents SOB A RLS DO USUÁRIO (o chat não
        // pode mais que a tela). Idempotência (23505/check prévio) vive na edge.
        const clientId = String(args.client_id ?? "").trim();
        if (!clientId) return { ok: false, error: "cliente não informado (resolva com consultar_cliente)." };
        const { data, error } = await userClient.functions.invoke("gerar-kit-documental", {
          body: { client_id: clientId },
        });
        if (error) return { ok: false, error: (error as { message?: string }).message ?? "falha ao gerar o kit documental." };
        const r = data as { ok?: boolean; error?: string } | null;
        if (r && r.ok === false && r.error) return { ok: false, error: r.error };
        return { ok: true, result: data };
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
