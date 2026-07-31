import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveCep } from "../cep.ts";
import { mapDocumentoToTipo, buildPendenciaTitulo } from "./docChecklist.ts";
import { montarFiltroCampanha, normalizarObjetivoCampanha } from "./campanhaFiltro.ts";
export { montarFiltroCampanha, normalizarObjetivoCampanha, CAMPANHA_FILTRO_KEYS } from "./campanhaFiltro.ts";
import {
  dataOuNull, intOuNull, mensagemMotivoP2,
  normalizarStatusDiligencia, normalizarStatusLembrete,
  notasApolices, notasApoliceRegistrada, notasCampanhaRenovacao,
  notasDiligenciaCumprida, notasDiligenciaRegistrada, notasLembreteAudiencia,
  notasPreparoAudiencia, notasProcuracaoRegistrada, notasProcuracoes,
  resumoDiligencias,
} from "./p2.ts";

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
    case "kpi_ligacoes": {
      // Escopo/gate na RPC; sem intervalo = hoje (defaults da RPC → omitir args).
      const rpcArgs: Record<string, unknown> = {};
      if (args.de) rpcArgs.p_de = args.de;
      if (args.ate) rpcArgs.p_ate = args.ate;
      const { data } = await client.rpc("kpi_ligacoes", rpcArgs);
      return data ?? {};
    }
    case "listar_permissoes_menu": {
      // Gate has_role(admin) DENTRO da RPC (42501 para não-admin). Client com JWT.
      const { data } = await client.rpc("admin_list_menu_permissions");
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
    // ─── Motores 2 e 3: consultas ─────────────────────────────────────────────
    // As três RPCs re-checam o papel via auth.uid(), então DEPENDEM do `client`
    // com JWT. `consultar_execucoes`/`fila_credenciais_gov` levantam 42501 para
    // quem não tem acesso: o erro é devolvido como texto para o especialista
    // dizer "você não tem acesso a isso", nunca como lista vazia (vazio mentiria
    // que não há execuções).
    case "consultar_reclamacoes": {
      const rpcArgs: Record<string, unknown> = {};
      if (args.client_id) rpcArgs.p_client_id = args.client_id;
      const nome = nomeCliente(args);
      if (nome) rpcArgs.p_cliente_nome = nome;
      if (args.vencendo_ate) rpcArgs.p_vencendo_ate = args.vencendo_ate;
      const { data, error } = await client.rpc("consultar_reclamacoes", rpcArgs);
      if (error) return { erro: error.message };
      const r = (data ?? {}) as Record<string, unknown>;
      // Esta RPC devolve `ambiguo` SEM lista de candidatos (diferente das do
      // Motor 1) — a mensagem tem de funcionar sem candidatos.
      if (r.ok === false) return { erro: erroClienteRpc(r, "não listei nada") };
      return r;
    }
    case "consultar_execucoes": {
      const rpcArgs: Record<string, unknown> = {};
      if (args.fase) rpcArgs.p_fase = args.fase;
      if (args.responsavel) rpcArgs.p_responsavel = args.responsavel;
      if (args.processo_numero) rpcArgs.p_processo_numero = args.processo_numero;
      const { data, error } = await client.rpc("consultar_execucoes", rpcArgs);
      if (error) {
        return error.code === "42501"
          ? { erro: "acompanhamento de execução é restrito a advogado/sócio — você não tem acesso a esse dado." }
          : { erro: error.message };
      }
      return data ?? {};
    }
    case "fila_credenciais_gov": {
      // A RPC devolve `tem_senha` booleano e NUNCA a senha. Repassamos como veio:
      // qualquer transformação aqui é oportunidade de vazar credencial no texto.
      const { data, error } = await client.rpc("fila_credenciais_gov", {
        p_estado: String(args.estado ?? "").trim(),
      });
      if (error) {
        return error.code === "42501"
          ? { erro: "a fila de credenciais gov.br é restrita a recepção/sócio — você não tem acesso." }
          : { erro: error.message };
      }
      return data ?? {};
    }
    /* ══ P2 · Cards 11/13/14/15: consultas ═══════════════════════════════════
       As quatro RPCs re-checam o papel via auth.uid() e levantam 42501 — o erro
       vira TEXTO de "você não tem acesso", nunca lista vazia (vazio mentiria que
       não existe diligência/apólice/procuração nenhuma).

       ORDEM DAS CHAVES IMPORTA: o resultado da tool é truncado antes de voltar
       ao modelo (8000 chars na leitura, 2000 na escrita). Um dump global de
       apólices estoura esse teto, então `notas` vai NA FRENTE do payload — no
       fim da string ela seria cortada exatamente nos casos em que mais importa. */
    case "consultar_diligencias": {
      // A RPC coage status desconhecido para 'pendente' em SILÊNCIO: perguntar
      // pelas "cumpridas" devolveria as pendentes e o usuário acreditaria.
      const st = normalizarStatusDiligencia(args.status);
      if (st.erro) return { erro: st.erro };
      const venc = dataOuNull(args.vencendo_ate);
      if (venc.invalida) return { erro: `não entendi a data "${venc.invalida}" — use AAAA-MM-DD.` };
      const rpcArgs: Record<string, unknown> = {};
      if (st.valor) rpcArgs.p_status = st.valor;            // omitir = default 'pendente'
      if (args.vara) rpcArgs.p_vara = args.vara;
      if (venc.valor) rpcArgs.p_vencendo_ate = venc.valor;
      if (args.processo_numero) rpcArgs.p_processo_numero = args.processo_numero;
      const { data, error } = await client.rpc("consultar_diligencias", rpcArgs);
      if (error) {
        return error.code === "42501"
          ? { erro: "diligências são do jurídico (advogado/sócio) — você não tem acesso a esse dado." }
          : { erro: error.message };
      }
      const r = (data ?? {}) as Record<string, unknown>;
      // Semáforo (vencidas / sem prazo / guardadas só pelo número) é nosso: a RPC
      // devolve o campo por item, mas ninguém soma — e é a soma que gera ação.
      return { ...resumoDiligencias(r), ...r };
    }
    case "consultar_apolices": {
      // p_apenas_nao_reconhecidas: NULL se comporta como TRUE (o predicado é
      // `NOT p_apenas... OR reconhecida IS FALSE`, e NOT NULL = NULL descarta a
      // linha). Mandamos FALSE EXPLÍCITO quando o usuário não pediu o filtro,
      // senão a lista "de todas as apólices" viria só com as não reconhecidas.
      const nome = nomeCliente(args);
      const soNaoReconhecidas = args.apenas_nao_reconhecidas === true;
      const comFiltro = !!(args.client_id || nome || args.seguradora || soNaoReconhecidas);
      const { data, error } = await client.rpc("consultar_apolices", {
        p_client_id: args.client_id ?? null,
        p_cliente_nome: nome ?? null,
        p_apenas_nao_reconhecidas: soNaoReconhecidas,
        p_seguradora: args.seguradora ?? null,
      });
      if (error) {
        return error.code === "42501"
          ? { erro: "as apólices de seguro são restritas a recepção/advogado/sócio — você não tem acesso." }
          : { erro: error.message };
      }
      const r = (data ?? {}) as Record<string, unknown>;
      // Esta RPC devolve `ambiguo` SEM candidatos (só o motivo).
      if (r.ok === false) return { erro: erroClienteRpc(r, "não listei nada") };
      return { notas: notasApolices(r, comFiltro), ...r };
    }
    case "consultar_procuracoes": {
      const nome = nomeCliente(args);
      const dias = intOuNull(args.vencendo_em_dias, 1, 3650);
      if (dias.invalido) return { erro: `janela inválida ("${dias.invalido}") — informe os dias em número (ex.: 30).` };
      const comFiltro = !!(args.client_id || nome || dias.valor);
      const { data, error } = await client.rpc("consultar_procuracoes", {
        p_client_id: args.client_id ?? null,
        p_cliente_nome: nome ?? null,
        p_vencendo_em_dias: dias.valor,
        p_incluir_historico: args.incluir_historico === true,
      });
      if (error) {
        return error.code === "42501"
          ? { erro: "as procurações são restritas a recepção/advogado/sócio — você não tem acesso." }
          : { erro: error.message };
      }
      const r = (data ?? {}) as Record<string, unknown>;
      if (r.ok === false) return { erro: erroClienteRpc(r, "não listei nada") };
      return { notas: notasProcuracoes(r, comFiltro), ...r };
    }
    case "preparar_audiencia": {
      const audId = String(args.audiencia_id ?? "").trim();
      if (!audId) return { erro: "de qual audiência? Liste as audiências primeiro para eu pegar o id." };
      const { data, error } = await client.rpc("preparar_audiencia", { p_audiencia_id: audId });
      if (error) {
        return error.code === "42501"
          ? { erro: "o preparo de audiência é restrito a recepção/advogado/sócio — você não tem acesso." }
          : { erro: error.message };
      }
      const r = (data ?? {}) as Record<string, unknown>;
      if (r.ok === false) {
        return { erro: mensagemMotivoP2(r, "não montei o preparo") ?? erroClienteRpc(r, "não montei o preparo") };
      }
      // `limitacao` é texto FIXO da RPC (sempre presente): repassamos SEMPRE, mas
      // ele não é sinal de problema. O sinal real é tese_resolvida=false, que faz
      // a lista de documentos vir só com [procuracao].
      return { notas: notasPreparoAudiencia(r), ...r };
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
// ─── Padrão comum das tools dos Cards 3/4/5 (item 0 do briefing) ─────────────
// As RPCs resolvem o cliente por NOME e devolvem ok:false com motivo. Traduzimos o
// motivo em PERGUNTA ao usuário — nunca em "sucesso". Uma tool ruim aqui é pior que
// nenhuma: foi a resposta de sucesso sem execução que gerou o incidente de 28/07.
function nomeCliente(args: Record<string, unknown>): string | undefined {
  return [args.cliente_nome, args.client_nome, args.nome]
    .find((v) => typeof v === "string" && v.trim()) as string | undefined;
}

/** Converte o ok:false da RPC em mensagem acionável (com candidatos, quando houver). */
function erroClienteRpc(r: Record<string, unknown>, oQueNaoFoiFeito: string): string {
  const motivo = String(r.motivo ?? "");
  const base = String(r.mensagem ?? "");
  if (motivo === "ambiguo") {
    const nomes = (Array.isArray(r.candidatos) ? r.candidatos : [])
      .map((c) => String((c as { nome?: string })?.nome ?? "")).filter(Boolean);
    return `${base || "Há mais de um cliente com esse nome."}${nomes.length ? ` Candidatos: ${nomes.join("; ")}.` : ""} Me diga qual é — ${oQueNaoFoiFeito}`;
  }
  if (motivo === "cliente_nao_encontrado") {
    return `${base || "Não encontrei esse cliente."} Confirme o nome ou cadastre o cliente primeiro — ${oQueNaoFoiFeito}`;
  }
  if (motivo === "cliente_nao_informado") {
    return `${base || "Preciso saber de qual cliente é."} — ${oQueNaoFoiFeito}`;
  }
  if (motivo === "resultado_invalido") {
    return base || "Resultado inválido: use atendeu, não atendeu, número errado, pediu retorno, recusou ou caixa postal.";
  }
  return `${base || "não consegui concluir"} — ${oQueNaoFoiFeito}`;
}

/**
 * Traduz o ok:false das RPCs dos Motores 2/3 que resolvem PROCESSO por número.
 * `_resolver_processo` devolve NULL tanto para "não achei" quanto para "achei
 * vários" — a mensagem tem de pedir o número exato nos dois casos, sem afirmar
 * qual dos dois foi (o banco não distingue).
 */
function erroProcessoRpc(r: Record<string, unknown>, oQueNaoFoiFeito: string): string {
  const motivo = String(r.motivo ?? "");
  const base = String(r.mensagem ?? "");
  // P2 (Cards 11/13/14/15): 12 motivos próprios, e só 6 das RPCs devolvem
  // `mensagem` — o texto pt-BR dos outros vive em tools/p2.ts (testável).
  const p2 = mensagemMotivoP2(r, oQueNaoFoiFeito);
  if (p2) return p2;
  if (motivo === "processo_nao_encontrado_ou_ambiguo") {
    return `não localizei um único processo com esse número (pode não existir ou haver mais de um parecido). Me passe o número exato — ${oQueNaoFoiFeito}`;
  }
  if (motivo === "evento_invalido" || motivo === "fase_invalida" || motivo === "estado_invalido"
      || motivo === "status_invalido" || motivo === "desfecho_invalido" || motivo === "dias_invalido") {
    // A `mensagem` da RPC lista os valores aceitos, mas NÃO diz o que deixou de
    // acontecer — e a regra da casa é que toda falha diga isso. Concatenamos sempre.
    return base ? `${base} — ${oQueNaoFoiFeito}` : `valor inválido — ${oQueNaoFoiFeito}`;
  }
  // `execucao_nao_iniciada` é o que remarcar_revisao_execucao devolve quando o
  // processo existe mas não tem execução (visto no espelho da migração do Card 9).
  if (motivo === "sem_execucao" || motivo === "execucao_nao_encontrada"
      || motivo === "execucao_nao_iniciada") {
    return `${base || "esse processo ainda não tem execução em acompanhamento."} Inicie a execução primeiro — ${oQueNaoFoiFeito}`;
  }
  if (motivo === "execucao_ja_existe") {
    return base || "esse processo já tem uma execução em acompanhamento (é uma por processo). Use a mudança de fase.";
  }
  if (motivo === "reclamacao_nao_encontrada") {
    return `não encontrei essa reclamação. Liste as reclamações do cliente primeiro — ${oQueNaoFoiFeito}`;
  }
  // Cai aqui também o `ambiguo`/`cliente_nao_encontrado` das RPCs que resolvem CLIENTE.
  return erroClienteRpc(r, oQueNaoFoiFeito);
}

/**
 * Erro CRU do PostgREST numa escrita. 42501 é o gate da RPC (SECURITY DEFINER):
 * vira "você não tem acesso" com quem pode fazer, nunca a mensagem técnica.
 */
function erroEscritaRpc(
  error: { code?: string; message?: string }, quemPode: string, oQueNaoFoiFeito: string,
): string {
  if (error.code === "42501") {
    return `você não tem acesso a esta ação (${quemPode}) — ${oQueNaoFoiFeito}.`;
  }
  return `${error.message ?? "erro"} — ${oQueNaoFoiFeito}.`;
}

/**
 * Resolve o cliente por NOME para as RPCs que só aceitam UUID
 * (registrar_relacao_bancaria). Usa agent_consultar_cliente com o JWT do usuário
 * (ela re-checa papel via auth.uid()), replicando os mesmos motivos 0/1/N.
 */
async function resolverClientePorNome(
  userClient: SupabaseClient, nome: string,
): Promise<{ id?: string; nome?: string; erro?: string }> {
  const { data, error } = await userClient.rpc("agent_consultar_cliente", { p_busca: nome });
  if (error) return { erro: `não consegui buscar o cliente (${error.message})` };
  const rows = (Array.isArray(data) ? data : []) as Array<{ id?: string; full_name?: string; nome?: string }>;
  if (rows.length === 0) return { erro: `não encontrei cliente com "${nome}". Confirme o nome ou cadastre o cliente primeiro.` };
  if (rows.length > 1) {
    const nomes = rows.slice(0, 5).map((r) => String(r.full_name ?? r.nome ?? "")).filter(Boolean);
    return { erro: `há mais de um cliente com "${nome}". Candidatos: ${nomes.join("; ")}. Me diga qual é.` };
  }
  const r = rows[0];
  return { id: String(r.id ?? ""), nome: String(r.full_name ?? r.nome ?? nome) };
}


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
        // __aviso é só display do cartão (pré-voo do item 7); nunca vai à RPC.
        const { data, error } = await userClient.rpc("criar_processo", {
          p_client_id: args.client_id, p_tipo_acao: args.tipo_acao ?? null,
          p_numero: args.numero ?? null, p_reu: args.reu ?? null, p_notes: args.notes ?? null,
        });
        if (error) return { ok: false, error: error.message };
        // Duplicata / tipo não resolvido: a RPC devolve ok:false + message.
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
      case "definir_permissao_menu": {
        // Wrappers das RPCs admin-gated (has_role(admin) interno → 42501 se não-admin).
        // O chat não pode mais que a tela /configuracoes/permissoes.
        const acao = String(args.acao ?? "").toLowerCase();
        const menuKey = String(args.menu_key ?? "").toLowerCase().trim();
        if (!args.user_id) return { ok: false, error: "colaborador não informado (resolva com consultar_usuario)." };
        if (!menuKey) return { ok: false, error: "menu não informado." };
        let error;
        if (acao === "conceder") ({ error } = await userClient.rpc("admin_set_user_menu", { p_user_id: args.user_id, p_menu_key: menuKey, p_granted: true }));
        else if (acao === "revogar") ({ error } = await userClient.rpc("admin_set_user_menu", { p_user_id: args.user_id, p_menu_key: menuKey, p_granted: false }));
        else if (acao === "padrao") ({ error } = await userClient.rpc("admin_clear_user_menu", { p_user_id: args.user_id, p_menu_key: menuKey }));
        else return { ok: false, error: `ação inválida: ${acao} (use conceder, revogar ou padrao).` };
        if (error) return { ok: false, error: error.message };
        return { ok: true, result: { user_id: args.user_id, menu_key: menuKey, acao } };
      }
      // ─── Card 3: relação bancária ─────────────────────────────────────────
      case "registrar_relacao_bancaria": {
        // A RPC ganhou p_cliente_nome em 29/07 e resolve o cliente ela mesma (mesmos
        // motivos 0/1/N das outras). Deixamos a resolução com ela: manter uma segunda
        // resolução aqui (via agent_consultar_cliente) duplicava a regra e podia
        // divergir do que a RPC decide.
        const clienteId = typeof args.client_id === "string" ? args.client_id : "";
        const clienteNome = nomeCliente(args) ?? "";
        if (!clienteId && !clienteNome) {
          return { ok: false, error: "de qual cliente é esse dado bancário? Me diga o nome." };
        }
        const temProduto = !!(args.banco && args.tipo_relacao);
        if (!temProduto && !args.banco_beneficio) {
          return { ok: false, error: "me diga onde o cliente recebe o benefício e/ou com qual banco ele tem consignado/seguro." };
        }
        const { data, error } = await userClient.rpc("registrar_relacao_bancaria", {
          p_client_id: clienteId || null,
          p_cliente_nome: clienteNome || null,
          p_banco: temProduto ? args.banco : null,
          p_tipo_relacao: temProduto ? args.tipo_relacao : null,
          p_reconhece: typeof args.reconhece === "boolean" ? args.reconhece : null,
          p_extrato_em_posse: typeof args.extrato_em_posse === "boolean" ? args.extrato_em_posse : null,
          p_extrato_ano: typeof args.extrato_ano === "number" ? args.extrato_ano : null,
          p_contrato_em_posse: typeof args.contrato_em_posse === "boolean" ? args.contrato_em_posse : null,
          p_notes: args.notes ?? null,
          p_banco_beneficio: args.banco_beneficio ?? null,
        });
        if (error) return { ok: false, error: error.message };
        const r = (data ?? {}) as Record<string, unknown>;
        if (r.ok === false) return { ok: false, error: erroClienteRpc(r, "nada foi registrado") };
        return { ok: true, result: { ...r, cliente: clienteNome || r.cliente } };
      }
      // ─── Card 4: campanha e ligação ───────────────────────────────────────
      case "criar_campanha": {
        const filtro = montarFiltroCampanha(args);
        if (Object.keys(filtro).length === 0) {
          // Sem "nível GOV" na lista: esse filtro NÃO existe em search_clients
          // (`gov` é booleano) e sugeri-lo levava o usuário a pedir algo impossível.
          return { ok: false, error: "preciso de pelo menos um critério para montar a fila (ex.: banco onde recebe, banco do consignado, banco cujo extrato já temos, cidade, UF ou status)." };
        }
        const { data, error } = await userClient.rpc("criar_campanha", {
          // O objetivo passa pelo normalizador: o CHECK do banco só aceita 7 valores e
          // nomes curtos ("agendar") derrubariam a criação com 23514.
          p_nome: args.nome, p_objetivo: normalizarObjetivoCampanha(args.objetivo), p_filtro: filtro,
        });
        if (error) return { ok: false, error: error.message };
        const r = (data ?? {}) as Record<string, unknown>;
        if (r.ok === false) return { ok: false, error: erroClienteRpc(r, "a campanha não foi criada") };
        // Fila vazia é resultado honesto, não erro: a campanha existe mas não há quem ligar.
        return { ok: true, result: r };
      }
      case "registrar_ligacao": {
        const { data, error } = await userClient.rpc("registrar_ligacao", {
          p_resultado: args.resultado,
          p_client_id: args.client_id ?? null,
          p_cliente_nome: nomeCliente(args) ?? null,
          p_observacao: args.observacao ?? null,
          p_campanha_id: args.campanha_id ?? null,
          p_retornar_em: args.retornar_em ?? null,
        });
        if (error) return { ok: false, error: error.message };
        const r = (data ?? {}) as Record<string, unknown>;
        if (r.ok === false) return { ok: false, error: erroClienteRpc(r, "a ligação não foi registrada") };
        return { ok: true, result: r };
      }
      // ─── Card 5: áudio de autorização ─────────────────────────────────────
      case "anexar_audio_autorizacao": {
        // Glue no mesmo padrão de anexar_documento_cliente: o áudio já está em
        // chat_attachments (o mic do chat sobe e a edge transcribe-audio grava a
        // transcrição em extracted_text). Aqui copiamos para o bucket do dossiê e
        // passamos file_path + transcrição para a RPC.
        const attId = String((args as Record<string, unknown>).__attachment_id ?? "");
        if (!attId) return { ok: false, error: "não identifiquei o áudio — anexe a gravação nesta conversa antes (nada foi anexado ao dossiê)." };
        let clienteId = typeof args.client_id === "string" ? args.client_id : "";
        let clienteNome = nomeCliente(args) ?? "";
        if (!clienteId) {
          if (!clienteNome) return { ok: false, error: "de qual cliente é essa autorização? Me diga o nome." };
          const res = await resolverClientePorNome(userClient, clienteNome);
          if (res.erro) return { ok: false, error: `${res.erro} (o áudio não foi anexado)` };
          clienteId = res.id!; clienteNome = res.nome ?? clienteNome;
        }
        const { data: att } = await admin.from("chat_attachments")
          .select("storage_path, file_name, mime_type, extracted_text").eq("id", attId).maybeSingle();
        if (!att) return { ok: false, error: "não encontrei o áudio anexado (o áudio não foi anexado ao dossiê)." };
        const a = att as { storage_path: string; file_name: string; mime_type: string | null; extracted_text: string | null };
        const { data: blob, error: dlErr } = await admin.storage.from("chat-attachments").download(a.storage_path);
        if (dlErr || !blob) return { ok: false, error: "falha ao ler o áudio do chat (nada foi anexado)." };
        const novoPath = `${clienteId}/${Date.now()}_autorizacao_${sanitizeStorageName(a.file_name)}`;
        const { error: upErr } = await admin.storage.from("client-documents")
          .upload(novoPath, blob, { contentType: a.mime_type ?? "audio/webm", upsert: false });
        if (upErr) return { ok: false, error: "falha ao salvar o áudio no dossiê." };
        const { data, error } = await userClient.rpc("anexar_audio_autorizacao", {
          p_file_path: novoPath,
          p_client_id: clienteId,
          p_cliente_nome: null,
          p_transcricao: a.extracted_text ?? null,
          p_process_id: args.process_id ?? null,
          p_nome_arquivo: a.file_name,
        });
        if (error) {
          await admin.storage.from("client-documents").remove([novoPath]).then(() => {}, () => {}); // sem órfão
          return { ok: false, error: error.message };
        }
        const r = (data ?? {}) as Record<string, unknown>;
        if (r.ok === false) {
          await admin.storage.from("client-documents").remove([novoPath]).then(() => {}, () => {}); // sem órfão
          return { ok: false, error: erroClienteRpc(r, "o áudio não foi anexado") };
        }
        // Diz explicitamente quando NÃO houve transcrição — meia-execução é relatada.
        return { ok: true, result: { ...r, cliente: clienteNome || r.cliente, transcricao_ausente: !a.extracted_text } };
      }
      case "registrar_credencial_gov": {
        // Gate (recepção/sócio/admin) dentro da RPC; a senha é cifrada no cofre por
        // save_gov_credential com consentimento v1.0.
        // A RPC resolve o cliente por client_id OU por NOME (ILIKE) e devolve
        // ok:false com motivo quando não dá: cliente_nao_encontrado, ambiguo (com
        // candidatos) ou cliente_nao_informado. Traduzimos isso em PERGUNTA ao
        // usuário — nunca em "sucesso".
        // PRIVACIDADE: a senha NUNCA é logada e NÃO volta no result (o result é
        // realimentado no histórico do LLM); só cliente, nível, status, se substituiu
        // credencial anterior e o aviso da RPC.
        const senhaGov = typeof args.senha === "string" ? args.senha : "";
        if (!senhaGov.trim()) return { ok: false, error: "não recebi a senha para guardar no cofre." };
        const nomeCli = [args.cliente_nome, args.client_nome, args.nome]
          .find((v) => typeof v === "string" && v.trim()) as string | undefined;
        if (!args.client_id && !nomeCli) {
          return { ok: false, error: "de qual cliente é essa credencial? Me diga o nome." };
        }
        const { data, error } = await userClient.rpc("registrar_credencial_gov", {
          p_senha: senhaGov,
          p_client_id: args.client_id ?? null,
          p_cliente_nome: nomeCli ?? null,
          p_usuario: args.usuario ?? null,
          p_nivel: args.nivel ?? null,
          p_tem_2fa: args.tem_2fa === true,
          p_status_acesso: args.status_acesso ?? "pendente",
        });
        if (error) return { ok: false, error: error.message };
        const r = (data ?? {}) as Record<string, unknown>;
        if (r.ok === false) {
          const motivo = String(r.motivo ?? "");
          const msg = String(r.mensagem ?? "não consegui guardar a credencial.");
          if (motivo === "ambiguo") {
            const nomes = (Array.isArray(r.candidatos) ? r.candidatos : [])
              .map((c) => String((c as { nome?: string })?.nome ?? "")).filter(Boolean);
            // Devolve a PERGUNTA com os candidatos — a senha continua fora do texto.
            return { ok: false, error: `${msg}${nomes.length ? ` Candidatos: ${nomes.join("; ")}.` : ""} Me diga qual é o cliente que eu guardo a credencial (a senha que você já passou não foi salva).` };
          }
          return { ok: false, error: `${msg} (a senha não foi salva)` };
        }
        return {
          ok: true,
          result: {
            cliente: r.cliente, nivel: r.nivel, status_acesso: r.status_acesso,
            substituiu_anterior: r.substituiu_anterior, aviso: r.aviso,
          },
        };
      }
      /* ══ MOTOR 2 · Card 6 — reclamações administrativas ═════════════════════ */
      case "registrar_reclamacao": {
        const clienteId = typeof args.client_id === "string" ? args.client_id : "";
        const clienteNome = nomeCliente(args) ?? "";
        if (!clienteId && !clienteNome) {
          return { ok: false, error: "de qual cliente é essa reclamação? Me diga o nome (nada foi registrado)." };
        }
        const { data, error } = await userClient.rpc("registrar_reclamacao", {
          p_orgao: args.orgao,
          p_client_id: clienteId || null,
          p_cliente_nome: clienteNome || null,
          p_tese: args.tese ?? null,
          p_data_reclamacao: args.data_reclamacao ?? null,   // null = default hoje na RPC
          p_protocolo: args.protocolo ?? null,
          p_prazo_resposta: args.prazo_resposta ?? null,
          p_prazo_fatal: args.prazo_fatal ?? null,
          p_process_id: args.process_id ?? null,
          p_observacao: args.observacao ?? null,
        });
        if (error) return { ok: false, error: error.message };
        const r = (data ?? {}) as Record<string, unknown>;
        if (r.ok === false) return { ok: false, error: erroProcessoRpc(r, "a reclamação NÃO foi registrada") };
        return { ok: true, result: { ...r, cliente: clienteNome || r.cliente } };
      }
      case "registrar_resposta_reclamacao": {
        if (!args.reclamacao_id) {
          return { ok: false, error: "preciso saber de qual reclamação (liste as do cliente primeiro) — nada foi registrado." };
        }
        const { data, error } = await userClient.rpc("registrar_resposta_reclamacao", {
          p_reclamacao_id: args.reclamacao_id,
          p_desfecho: args.desfecho,
          p_resposta_texto: args.resposta_texto ?? null,
          p_resposta_em: args.resposta_em ?? null,
        });
        if (error) return { ok: false, error: error.message };
        const r = (data ?? {}) as Record<string, unknown>;
        if (r.ok === false) return { ok: false, error: erroProcessoRpc(r, "a resposta NÃO foi registrada") };
        return { ok: true, result: r };
      }

      /* ══ MOTOR 3 · Card 8 — pipeline de execução ═════════════════════════════ */
      case "iniciar_execucao": {
        if (!args.process_id && !args.processo_numero) {
          return { ok: false, error: "de qual processo é a execução? Me passe o número (nada foi iniciado)." };
        }
        const { data, error } = await userClient.rpc("iniciar_execucao", {
          p_process_id: args.process_id ?? null,
          p_processo_numero: args.processo_numero ?? null,
          p_reu_nome: args.reu_nome ?? null,
          p_reu_tipo: args.reu_tipo ?? null,
          p_responsavel_nome: args.responsavel_nome ?? null,
          p_valor: typeof args.valor === "number" ? args.valor : null,
          p_fase: args.fase ?? null,                          // null = default ajuizada
          p_observacao: args.observacao ?? null,
        });
        if (error) return { ok: false, error: error.message };
        const r = (data ?? {}) as Record<string, unknown>;
        if (r.ok === false) return { ok: false, error: erroProcessoRpc(r, "a execução NÃO foi iniciada") };
        return { ok: true, result: r };
      }
      case "atualizar_fase_execucao": {
        if (!args.process_id && !args.processo_numero) {
          return { ok: false, error: "de qual processo é a execução? Me passe o número (a fase NÃO foi alterada)." };
        }
        const { data, error } = await userClient.rpc("atualizar_fase_execucao", {
          p_fase: args.fase,
          p_process_id: args.process_id ?? null,
          p_processo_numero: args.processo_numero ?? null,
          p_observacao: args.observacao ?? null,
        });
        if (error) return { ok: false, error: error.message };
        const r = (data ?? {}) as Record<string, unknown>;
        if (r.ok === false) return { ok: false, error: erroProcessoRpc(r, "a fase NÃO foi alterada") };
        return { ok: true, result: r };
      }

      /* ══ MOTOR 3 · Card 9 — tickler de revisão ═══════════════════════════════ */
      case "remarcar_revisao_execucao": {
        if (!args.process_id && !args.processo_numero) {
          return { ok: false, error: "de qual processo é a execução? Me passe o número (a revisão NÃO foi remarcada)." };
        }
        const dias = typeof args.dias === "number" ? args.dias : Number(args.dias);
        if (!Number.isFinite(dias) || dias < 1 || dias > 90) {
          return { ok: false, error: "em quantos dias devo remarcar a revisão? Aceito de 1 a 90 (nada foi remarcado)." };
        }
        const rec = args.intervalo_recorrente === undefined || args.intervalo_recorrente === null
          ? null : Number(args.intervalo_recorrente);
        const { data, error } = await userClient.rpc("remarcar_revisao_execucao", {
          p_dias: Math.trunc(dias),
          p_process_id: args.process_id ?? null,
          p_processo_numero: args.processo_numero ?? null,
          p_intervalo_recorrente: rec !== null && Number.isFinite(rec) ? Math.trunc(rec) : null,
        });
        if (error) return { ok: false, error: error.message };
        const r = (data ?? {}) as Record<string, unknown>;
        if (r.ok === false) return { ok: false, error: erroProcessoRpc(r, "a revisão NÃO foi remarcada") };
        return { ok: true, result: r };
      }

      /* ══ MOTOR 3 · Card 10 — prazos automáticos pós-evento ═══════════════════ */
      case "registrar_evento_processual": {
        if (!args.process_id && !args.processo_numero) {
          return { ok: false, error: "de qual processo é o evento? Me passe o número (nenhum prazo foi criado)." };
        }
        const { data, error } = await userClient.rpc("registrar_evento_processual", {
          p_evento: args.evento,
          p_process_id: args.process_id ?? null,
          p_processo_numero: args.processo_numero ?? null,
          p_data_evento: args.data_evento ?? null,            // null = default hoje
          p_observacao: args.observacao ?? null,
        });
        if (error) return { ok: false, error: error.message };
        const r = (data ?? {}) as Record<string, unknown>;
        if (r.ok === false) return { ok: false, error: erroProcessoRpc(r, "nenhum prazo foi criado") };
        // O `aviso` (dias úteis sem feriados) sobe no result: o humanSummary o
        // exibe no cartão e a instrução da tool obriga o especialista a repeti-lo.
        // Um prazo processual errado por feriado é dano real — não é rodapé.
        return { ok: true, result: r };
      }

      /* ══ MOTOR 2 · Card 7 — credenciais gov.br ═══════════════════════════════
         NUNCA ecoar senha: estas duas tools não recebem nem devolvem senha. */
      case "atualizar_status_credencial_gov": {
        const clienteId = typeof args.client_id === "string" ? args.client_id : "";
        const clienteNome = nomeCliente(args) ?? "";
        if (!clienteId && !clienteNome) {
          return { ok: false, error: "de qual cliente é a conta gov.br? Me diga o nome (nada foi alterado)." };
        }
        const { data, error } = await userClient.rpc("atualizar_status_credencial_gov", {
          p_status: args.status,
          p_client_id: clienteId || null,
          p_cliente_nome: clienteNome || null,
          p_observacao: args.observacao ?? null,
        });
        if (error) return { ok: false, error: error.message };
        const r = (data ?? {}) as Record<string, unknown>;
        if (r.ok === false) return { ok: false, error: erroProcessoRpc(r, "a situação NÃO foi alterada") };
        return { ok: true, result: { ...r, cliente: clienteNome || r.cliente } };
      }
      case "agendar_conversao_gov": {
        const clienteId = typeof args.client_id === "string" ? args.client_id : "";
        const clienteNome = nomeCliente(args) ?? "";
        if (!clienteId && !clienteNome) {
          return { ok: false, error: "de qual cliente é a conversão da conta? Me diga o nome (nada foi agendado)." };
        }
        const { data, error } = await userClient.rpc("agendar_conversao_gov", {
          p_client_id: clienteId || null,
          p_cliente_nome: clienteNome || null,
          p_ate: args.ate ?? null,
          p_observacao: args.observacao ?? null,
        });
        if (error) return { ok: false, error: error.message };
        const r = (data ?? {}) as Record<string, unknown>;
        if (r.ok === false) return { ok: false, error: erroProcessoRpc(r, "a conversão NÃO foi agendada") };
        return { ok: true, result: { ...r, cliente: clienteNome || r.cliente } };
      }
      /* ══ P2 · Card 11 — diligências ════════════════════════════════════════ */
      case "registrar_diligencia": {
        const desc = String(args.descricao ?? "").trim();
        if (!desc) {
          return { ok: false, error: "o que precisa ser feito na diligência? Me diga em uma frase (nada foi registrado)." };
        }
        if (!args.process_id && !String(args.processo_numero ?? "").trim()) {
          // A diligência SEMPRE pertence a um processo (CHECK diligencia_precisa_processo).
          return { ok: false, error: "de qual processo é a diligência? Me passe o número (nada foi registrado)." };
        }
        const prazo = dataOuNull(args.prazo);
        if (prazo.invalida) {
          return { ok: false, error: `não entendi o prazo "${prazo.invalida}" — me passe a data em AAAA-MM-DD (nada foi registrado).` };
        }
        const { data, error } = await userClient.rpc("registrar_diligencia", {
          p_descricao: desc,
          p_tipo: args.tipo ?? null,                        // null = default balcao_virtual
          p_process_id: args.process_id ?? null,
          p_processo_numero: args.processo_numero ?? null,
          p_vara: args.vara ?? null,
          p_prazo: prazo.valor,                             // "" viraria 22007 na coluna date
          p_responsavel_nome: args.responsavel_nome ?? null,
          p_observacao: args.observacao ?? null,
        });
        if (error) return { ok: false, error: erroEscritaRpc(error, "diligência é do advogado/sócio", "a diligência NÃO foi registrada") };
        const r = (data ?? {}) as Record<string, unknown>;
        if (r.ok === false) return { ok: false, error: erroProcessoRpc(r, "a diligência NÃO foi registrada") };
        // `processo_vinculado:false` é o caminho PONTE (guardou pelo número): o aviso
        // da RPC TEM de chegar ao usuário, senão ele acha que ficou no processo.
        // Prazo no passado a RPC aceita sem dizer nada — o alerta é nosso.
        return { ok: true, result: { notas: notasDiligenciaRegistrada(r, prazo.valor), ...r } };
      }
      case "cumprir_diligencia": {
        if (!args.diligencia_id) {
          return { ok: false, error: "preciso saber qual diligência (liste as diligências primeiro) — nada foi registrado." };
        }
        const redil = dataOuNull(args.rediligenciar_em);
        if (redil.invalida) {
          return { ok: false, error: `não entendi a data da rediligência "${redil.invalida}" — use AAAA-MM-DD (nada foi registrado).` };
        }
        const { data, error } = await userClient.rpc("cumprir_diligencia", {
          p_diligencia_id: args.diligencia_id,
          // Protocolo NÃO é obrigatório (decisão de 30/07): a ausência é declarada
          // no retorno, nunca cobrada como pré-requisito.
          p_protocolo: args.protocolo ?? null,
          p_resultado: args.resultado ?? null,
          p_rediligenciar_em: redil.valor,
        });
        if (error) return { ok: false, error: erroEscritaRpc(error, "diligência é do advogado/sócio", "a diligência NÃO foi marcada como cumprida") };
        const r = (data ?? {}) as Record<string, unknown>;
        if (r.ok === false) return { ok: false, error: erroProcessoRpc(r, "a diligência NÃO foi marcada como cumprida") };
        return { ok: true, result: { notas: notasDiligenciaCumprida(r), ...r } };
      }

      /* ══ P2 · Card 13 — lembrete de audiência ══════════════════════════════ */
      case "registrar_lembrete_audiencia": {
        if (!args.lembrete_id) {
          return { ok: false, error: "preciso saber qual lembrete (ele vem do preparo da audiência ou do card da pendência) — nada foi registrado." };
        }
        // Default da RPC é 'feito': assumir isso sem o usuário dizer registraria um
        // aviso ao cliente que nunca aconteceu. Valor não reconhecido = pergunta.
        const st = normalizarStatusLembrete(args.status);
        if (st.erro) return { ok: false, error: `${st.erro} (nada foi registrado)` };
        if (!st.valor) {
          return { ok: false, error: "o lembrete foi feito, o cliente não atendeu, ou o lembrete foi cancelado? (nada foi registrado)" };
        }
        const { data, error } = await userClient.rpc("registrar_lembrete_audiencia", {
          p_lembrete_id: args.lembrete_id,
          p_status: st.valor,
          p_observacao: args.observacao ?? null,
        });
        if (error) return { ok: false, error: erroEscritaRpc(error, "é da recepção/advogado/sócio", "o lembrete NÃO foi registrado") };
        const r = (data ?? {}) as Record<string, unknown>;
        if (r.ok === false) return { ok: false, error: erroProcessoRpc(r, "o lembrete NÃO foi registrado") };
        // nao_atendeu MANTÉM a pendência aberta: sem dizer isso, o usuário sai
        // achando que o aviso está resolvido e ninguém liga de novo.
        return { ok: true, result: { notas: notasLembreteAudiencia(r), ...r } };
      }

      /* ══ P2 · Card 14 — apólices de seguro (SUSEP) ═════════════════════════ */
      case "registrar_apolice": {
        const seguradora = String(args.seguradora ?? "").trim();
        if (!seguradora) {
          return { ok: false, error: "de qual seguradora é a apólice? (nada foi registrado)" };
        }
        const clienteId = typeof args.client_id === "string" ? args.client_id : "";
        const clienteNome = nomeCliente(args) ?? "";
        if (!clienteId && !clienteNome) {
          return { ok: false, error: "de qual cliente é essa apólice? Me diga o nome (nada foi registrado)." };
        }
        const vig = dataOuNull(args.vigencia_inicio);
        if (vig.invalida) {
          return { ok: false, error: `não entendi o início da vigência "${vig.invalida}" — use AAAA-MM-DD (nada foi registrado).` };
        }
        const { data, error } = await userClient.rpc("registrar_apolice", {
          p_seguradora: seguradora,
          p_client_id: clienteId || null,
          p_cliente_nome: clienteNome || null,
          p_produto: args.produto ?? null,
          p_numero_apolice: args.numero_apolice ?? null,
          p_premio_valor: typeof args.premio_valor === "number" ? args.premio_valor : null,
          p_premio_periodicidade: args.premio_periodicidade ?? null,
          p_origem_desconto: args.origem_desconto ?? null,
          // TRÊS estados: true reconhece, false nega (insumo da tese), null não
          // perguntaram. Coagir null para false inventaria uma negativa do cliente.
          p_reconhecida: typeof args.reconhecida === "boolean" ? args.reconhecida : null,
          p_vigencia_inicio: vig.valor,
          p_numero_processo_susep: args.numero_processo_susep ?? null,
          p_observacao: args.observacao ?? null,
        });
        if (error) return { ok: false, error: erroEscritaRpc(error, "é da recepção/advogado/sócio", "a apólice NÃO foi registrada") };
        const r = (data ?? {}) as Record<string, unknown>;
        if (r.ok === false) return { ok: false, error: erroProcessoRpc(r, "a apólice NÃO foi registrada") };
        return {
          ok: true,
          result: { notas: notasApoliceRegistrada(r), ...r, cliente: clienteNome || r.cliente },
        };
      }
      case "atualizar_apolice": {
        if (!args.apolice_id) {
          return { ok: false, error: "preciso saber qual apólice (liste as apólices do cliente primeiro) — nada foi alterado." };
        }
        const cancel = dataOuNull(args.cancelada_em);
        if (cancel.invalida) {
          return { ok: false, error: `não entendi a data de cancelamento "${cancel.invalida}" — use AAAA-MM-DD (nada foi alterado).` };
        }
        const temReconhecida = typeof args.reconhecida === "boolean";
        const temRestituicao = typeof args.restituicao_valor === "number";
        const temObs = !!String(args.observacao ?? "").trim();
        // A RPC faz COALESCE campo por campo: chamada só com o id devolve ok:true
        // sem ter mudado nada. Um "pronto, atualizei" para um no-op é justamente a
        // resposta de sucesso sem execução que queremos impedir.
        if (!temReconhecida && !cancel.valor && !temRestituicao && !temObs) {
          return { ok: false, error: "o que devo atualizar nessa apólice? (se o cliente reconhece, data de cancelamento, valor restituído ou uma observação) — nada foi alterado." };
        }
        const { data, error } = await userClient.rpc("atualizar_apolice", {
          p_apolice_id: args.apolice_id,
          p_reconhecida: temReconhecida ? args.reconhecida : null,
          p_cancelada_em: cancel.valor,
          p_restituicao_valor: temRestituicao ? args.restituicao_valor : null,
          p_observacao: temObs ? args.observacao : null,
        });
        if (error) return { ok: false, error: erroEscritaRpc(error, "é da recepção/advogado/sócio", "a apólice NÃO foi alterada") };
        const r = (data ?? {}) as Record<string, unknown>;
        if (r.ok === false) return { ok: false, error: erroProcessoRpc(r, "a apólice NÃO foi alterada") };
        return { ok: true, result: r };
      }

      /* ══ P2 · Card 15 — procuração e campanha de renovação ═════════════════ */
      case "registrar_procuracao": {
        const assin = dataOuNull(args.data_assinatura);
        if (assin.invalida) {
          return { ok: false, error: `não entendi a data de assinatura "${assin.invalida}" — use AAAA-MM-DD, com a data em que a procuração foi ASSINADA (não a do upload). Nada foi registrado.` };
        }
        if (!assin.valor) {
          // Mesmo texto do motivo data_assinatura_obrigatoria: é a assinatura que
          // define a vigência, então a data do upload gera vencimento errado.
          return { ok: false, error: "em que data a procuração foi ASSINADA? A vigência conta dessa data — não use a data do upload (nada foi registrado)." };
        }
        const clienteId = typeof args.client_id === "string" ? args.client_id : "";
        const clienteNome = nomeCliente(args) ?? "";
        if (!clienteId && !clienteNome) {
          return { ok: false, error: "de qual cliente é a procuração? Me diga o nome (nada foi registrado)." };
        }
        const meses = intOuNull(args.validade_meses, 1, 120);
        if (meses.invalido) {
          return { ok: false, error: `validade inválida ("${meses.invalido}") — informe de 1 a 120 meses (nada foi registrado).` };
        }
        const { data, error } = await userClient.rpc("registrar_procuracao", {
          p_data_assinatura: assin.valor,
          p_client_id: clienteId || null,
          p_cliente_nome: clienteNome || null,
          p_tipo: args.tipo ?? null,                        // null = default ad_judicia
          p_validade_meses: meses.valor,                    // null = default 12
          p_client_document_id: args.client_document_id ?? null,
          p_observacao: args.observacao ?? null,
        });
        if (error) return { ok: false, error: erroEscritaRpc(error, "é da recepção/advogado/sócio", "a procuração NÃO foi registrada") };
        const r = (data ?? {}) as Record<string, unknown>;
        if (r.ok === false) return { ok: false, error: erroProcessoRpc(r, "a procuração NÃO foi registrada") };
        return {
          ok: true,
          result: { notas: notasProcuracaoRegistrada(r), ...r, cliente: clienteNome || r.cliente },
        };
      }
      case "gerar_campanha_renovacao_procuracao": {
        const janela = intOuNull(args.janela_dias, 1, 365);
        if (janela.invalido) {
          return { ok: false, error: `janela inválida ("${janela.invalido}") — informe de 1 a 365 dias (nenhuma campanha foi criada).` };
        }
        const { data, error } = await userClient.rpc("gerar_campanha_renovacao_procuracao", {
          p_janela_dias: janela.valor ?? 30,                // default explícito (a RPC também usa 30)
          p_nome: args.nome ?? null,
        });
        if (error) return { ok: false, error: erroEscritaRpc(error, "criar campanha é da recepção/sócio", "nenhuma campanha foi criada") };
        const r = (data ?? {}) as Record<string, unknown>;
        if (r.ok === false) return { ok: false, error: erroProcessoRpc(r, "nenhuma campanha foi criada") };
        // clientes_na_fila = 0 COM ok:true = campanha criada VAZIA (todos já estavam
        // em campanha aberta do mesmo objetivo). Sem dizer isso, o usuário acha que
        // tem fila para ligar. `sem_telefone` também sobe: fila inacionável.
        return { ok: true, result: { notas: notasCampanhaRenovacao(r), ...r } };
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
