/* ============================================================
   resultadoDaAcao.ts — o que a resposta de SUCESSO tem de dizer
   ============================================================
   POR QUE este arquivo existe (validação de 03-04/08, itens A.2 e A.3):

   A.2 — O AVISO ENGOLIDO (teste J-01). `registrar_diligencia` num processo
   inexistente devolveu, no jsonb da RPC, o aviso "Processo ainda não cadastrado
   no sistema — diligência guardada pelo número." O banco gravou process_id=null
   corretamente, mas a mensagem ao usuário foi "Pronto — ação executada com
   sucesso": o aviso morreu entre a RPC e o chat. Aqui a regra é GERAL, não caso
   a caso: as chaves de aviso do RESULTADO nunca são descartadas.

   A.3 — "Pronto — ação executada com sucesso" é OPACO. Em A-01 essa frase cobriu
   "atualizei o banco do benefício E não dupliquei o consignado que já existia"
   sem contar nenhuma das duas coisas. `humanSummary(tool, args)` já diz a
   INTENÇÃO; o que faltava era ler o RETORNO e dizer o EFEITO.

   Por que fora do index.ts: index.ts importa o supabase-js do esm.sh e não roda
   em `deno test` sem rede. Toda a lógica que pode errar (quais chaves são aviso,
   em que ordem, como virar frase) fica aqui e é testada sem banco — mesmo motivo
   de tools/p2.ts e campanhaFiltro.ts.

   CONTRATO LIDO DO BANCO (pg_get_functiondef, 04/08/2026): as chaves de aviso e
   os contadores/flags de cada RPC abaixo saíram do `RETURN jsonb_build_object`
   real de cada função, nunca de suposição.

   REGRA DE OURO DESTE ARQUIVO: NUNCA imprimir identificador interno (UUID) na
   frase — cláusula H das diretrizes invioláveis. Usamos identificador HUMANO
   (nome do cliente, número do processo, data, contagem); ids só servem de FLAG
   ("existe rediligência?"), jamais de texto.
============================================================ */

/**
 * Chaves ESCALARES de aviso que uma RPC pode devolver junto do sucesso. A ordem
 * é a ordem de exibição e é ESTÁVEL (o teste fixa isso): quem lê a resposta duas
 * vezes vê as mesmas frases na mesma sequência.
 *
 * - `aviso`      → o alerta principal (registrar_diligencia, cumprir_diligencia,
 *                  registrar_procuracao, registrar_evento_processual,
 *                  gerar_campanha_renovacao_procuracao, registrar_credencial_gov)
 * - `nota`       → observação de estado (atualizar_fase_execucao, registrar_apolice,
 *                  registrar_lembrete_audiencia, registrar_resposta_reclamacao)
 * - `nota_tipo`  → valor coagido para "outro" (registrar_procuracao)
 * - `limitacao`  → texto FIXO da RPC (preparar_audiencia) — repassar sempre
 * - `mensagem`   → explicação que a RPC anexa ao motivo
 */
export const CHAVES_DE_NOTA = ["aviso", "nota", "nota_tipo", "limitacao", "mensagem"] as const;

/** Teto de notas por resposta: evita despejar um resultado gigante no chat. */
const MAX_NOTAS = 8;

function textoLimpo(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s : null;
}

/**
 * Extrai, de um jsonb QUALQUER, todas as notas/avisos que o usuário precisa ver.
 * Ordem estável (CHAVES_DE_NOTA e depois o array `notas`) e sem repetição — os
 * handlers do P2 já montam `notas` a partir de `r.aviso`, então a mesma frase
 * chegaria duas vezes sem a deduplicação.
 *
 * Neutro quanto a ok:true/false: quem chama decide quando usar. Não lança.
 */
/**
 * Serializa o resultado de uma tool de LEITURA para o LLM com as notas NA FRENTE.
 *
 * O payload é cortado em `limite` caracteres, e as chaves de aviso costumam ficar no
 * FIM do jsonb — então `limitacao` de preparar_audiencia, ou o aviso de uma consulta
 * que devolveu a base inteira, desapareciam no corte sem ninguém notar. Prefixar
 * garante que o aviso sobrevive mesmo quando os dados são truncados; a linha de corte
 * é declarada no texto para o modelo não tratar lista truncada como lista completa.
 */
export function serializarResultadoLeitura(result: unknown, limite = 8000): string {
  const notas = extrairNotasDoResultado(result);
  const corpo = JSON.stringify(result ?? null);
  if (notas.length === 0) {
    return corpo.length <= limite ? corpo : corpo.slice(0, limite) + '\n[RESULTADO TRUNCADO]';
  }
  const cabeca = `AVISOS DESTE RESULTADO (repasse ao usuário): ${notas.join(" | ")}\n`;
  const sobra = Math.max(0, limite - cabeca.length);
  return cabeca + (corpo.length <= sobra ? corpo : corpo.slice(0, sobra) + '\n[RESULTADO TRUNCADO]');
}

export function extrairNotasDoResultado(result: unknown): string[] {
  if (!result || typeof result !== "object" || Array.isArray(result)) return [];
  const r = result as Record<string, unknown>;
  const vistas = new Set<string>();
  const out: string[] = [];
  const push = (s: string | null) => {
    if (!s || vistas.has(s) || out.length >= MAX_NOTAS) return;
    vistas.add(s);
    out.push(s);
  };
  for (const k of CHAVES_DE_NOTA) push(textoLimpo(r[k]));
  // `notas` é o array que os handlers do P2 produzem (tools/p2.ts). Entra por
  // último para que as chaves diretas da RPC mantenham posição previsível.
  if (Array.isArray(r.notas)) for (const n of r.notas) push(textoLimpo(n));
  return out;
}

/* ─── A.3: o EFEITO, com número quando houver ──────────────────────────────── */

function txt(v: unknown, fallback = ""): string {
  const s = typeof v === "string" ? v.trim() : v === null || v === undefined ? "" : String(v);
  return s || fallback;
}
function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}
/** Rótulos de enum do banco viram texto legível (`penhora_negativa` → "penhora negativa"). */
function legivel(v: unknown): string {
  return txt(v).replace(/_/g, " ");
}
/** `true`/`false` só contam quando a RPC realmente devolveu o booleano. */
function bool(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

/**
 * Frase CONCRETA do que mudou, lida do RETORNO da RPC. `null` quando a tool não
 * tem contrato conhecido — aí quem chama usa a intenção (humanSummary) como
 * cabeça da mensagem, que ainda é melhor que "ação executada com sucesso".
 *
 * Puro: mesma entrada, mesma saída. Nenhuma chamada de rede, nenhum Date.now().
 */
export function resumoDoEfeito(tool: string, result: unknown): string | null {
  if (!result || typeof result !== "object" || Array.isArray(result)) return null;
  const r = result as Record<string, unknown>;

  switch (tool) {
    /* ── P2 · Card 11: diligências ─────────────────────────────────────────── */
    case "registrar_diligencia": {
      const proc = txt(r.processo, "informado");
      const vinculado = bool(r.processo_vinculado);
      // `processo_vinculado:false` é o caminho PONTE (guardou pelo NÚMERO). Dizer
      // "no processo X" nesse caso é a afirmação que o teste J-01 pegou.
      const onde = vinculado === false
        ? `guardada pelo número do processo ${proc} (processo ainda não cadastrado)`
        : `registrada no processo ${proc}`;
      const pend = bool(r.pendencia_prazo_criada) === true
        ? " Pendência de prazo criada para cobrá-la."
        : bool(r.pendencia_prazo_criada) === false
          ? " Sem prazo, então NÃO nasceu pendência cobrando."
          : "";
      return `Diligência de ${legivel(r.tipo) || "diligência"} ${onde}.${pend}`;
    }
    case "cumprir_diligencia": {
      const prot = txt(r.protocolo);
      const partes = [prot ? `protocolo ${prot}` : "sem número de protocolo"];
      if (bool(r.pendencia_fechada) === true) partes.push("pendência de prazo encerrada");
      if (bool(r.pendencia_fechada) === false) partes.push("não havia pendência de prazo para encerrar");
      // rediligencia_id é UUID: serve de FLAG, nunca entra no texto.
      if (txt(r.rediligencia_id)) partes.push(`rediligência agendada para ${txt(r.rediligenciar_em, "a data informada")}`);
      return `Diligência marcada como CUMPRIDA — ${partes.join(" · ")}.`;
    }

    /* ── P2 · Card 13: lembrete de audiência ───────────────────────────────── */
    case "registrar_lembrete_audiencia":
      return `Lembrete da audiência registrado como ${legivel(r.status) || "informado"}.`;

    /* ── P2 · Card 14: apólices ────────────────────────────────────────────── */
    case "registrar_apolice": {
      const quem = txt(r.cliente, "o cliente");
      const det = [txt(r.produto)].filter(Boolean);
      const rec = bool(r.reconhecida);
      const recTxt = rec === false
        ? " Cliente NÃO reconhece."
        : rec === true ? " Cliente reconhece." : " Reconhecimento não informado.";
      return `Apólice da ${txt(r.seguradora, "seguradora")}${det.length ? ` (${det.join(" · ")})` : ""} registrada para ${quem}.${recTxt}`;
    }
    case "atualizar_apolice": {
      const n = num(r.campos_alterados);
      const quem = txt(r.cliente, "o cliente");
      if (n === 0) {
        // A RPC devolve ok:true mesmo sem campo nenhum — "atualizada" seria mentira.
        return `Nenhum campo da apólice da ${txt(r.seguradora, "seguradora")} de ${quem} foi alterado (nada foi informado para mudar).`;
      }
      return `Apólice da ${txt(r.seguradora, "seguradora")} de ${quem} atualizada${n === null ? "" : ` — ${n} campo(s) alterado(s)`}.`;
    }

    /* ── P2 · Card 15: procurações ─────────────────────────────────────────── */
    case "registrar_procuracao": {
      const quem = txt(r.cliente, "o cliente");
      const base = `Procuração ${legivel(r.tipo) || "registrada"} de ${quem} gravada: assinada em ${txt(r.data_assinatura, "data informada")}, válida até ${txt(r.validade_ate, "a data calculada")}`;
      const renov = bool(r.renovou_anterior) === true
        ? `. Substituiu a anterior (situação dela: ${legivel(r.status_da_anterior) || "vigente"})`
        : bool(r.renovou_anterior) === false ? ". Primeira procuração deste cliente" : "";
      const pend = bool(r.pendencia_renovacao_fechada) === true ? ". Pendência de renovação encerrada" : "";
      return `${base}${renov}${pend}.`;
    }
    case "gerar_campanha_renovacao_procuracao": {
      const fila = num(r.clientes_na_fila) ?? 0;
      const semTel = num(r.sem_telefone);
      const janela = num(r.janela_dias);
      const tel = semTel && semTel > 0 ? `, ${semTel} sem telefone` : "";
      return `Campanha "${txt(r.nome, "de renovação")}" criada com ${fila} cliente(s) na fila${janela === null ? "" : ` (janela de ${janela} dia(s))`}${tel}.`;
    }

    /* ── Motor 1 · Cards 3/4/5 ─────────────────────────────────────────────── */
    case "registrar_relacao_bancaria": {
      const quem = txt(r.cliente, "o cliente");
      // relation_id existe só quando banco+tipo_relacao vieram juntos; o INSERT é
      // ON CONFLICT DO UPDATE por (client_id, banco, tipo_relacao), então repetir
      // NÃO duplica — e foi exatamente isso que A-01 escondeu do usuário.
      const temProduto = !!txt(r.relation_id);
      return temProduto
        ? `Dado bancário de ${quem} gravado: o produto do banco foi registrado (repetir o mesmo banco + produto atualiza o registro existente, não cria um segundo).`
        : `Dado bancário de ${quem} gravado: apenas o banco do benefício foi atualizado no cadastro (nenhum produto bancário informado).`;
    }
    case "criar_campanha": {
      const n = num(r.clientes) ?? 0;
      return `Campanha "${txt(r.nome, "criada")}" criada com ${n} cliente(s) na fila.`;
    }
    case "registrar_ligacao": {
      const quem = txt(r.cliente, "o cliente");
      const fu = bool(r.follow_up_criado);
      const pend = fu === true ? " Pendência de retorno criada no Kanban."
        : fu === false ? " Sem data de retorno, então NÃO nasceu pendência de retorno." : "";
      return `Ligação para ${quem} registrada: ${legivel(r.resultado) || "resultado informado"}.${pend}`;
    }
    case "anexar_audio_autorizacao": {
      const quem = txt(r.cliente, "o cliente");
      const semTrans = bool(r.transcricao_ausente) === true;
      return `Áudio de autorização guardado no dossiê de ${quem}${semTrans ? " — SEM transcrição (o áudio está lá, o texto não)" : " com a transcrição"}.`;
    }

    /* ── Motor 2 · Cards 6/7 ───────────────────────────────────────────────── */
    case "registrar_reclamacao": {
      const quem = txt(r.cliente, "o cliente");
      const pend = bool(r.pendencia_prazo_criada) === true
        ? " Pendência de prazo criada."
        : bool(r.pendencia_prazo_criada) === false ? " Sem prazo informado, então nenhuma pendência foi criada." : "";
      return `Reclamação no ${legivel(r.orgao) || "órgão"} registrada para ${quem}.${pend}`;
    }
    case "registrar_resposta_reclamacao":
      return `Reclamação no ${legivel(r.orgao) || "órgão"} de ${txt(r.cliente, "o cliente")} marcada como ${legivel(r.desfecho) || "informado"}.`;
    case "registrar_credencial_gov": {
      // A senha NUNCA entra aqui — esta tool não devolve senha e o texto vai ao chat.
      const quem = txt(r.cliente, "o cliente");
      const sub = bool(r.substituiu_anterior) === true ? " (substituiu a credencial anterior)" : "";
      return `Credencial gov.br de ${quem} guardada no cofre cifrado${sub} — nível ${txt(r.nivel, "não informado")}.`;
    }
    case "atualizar_status_credencial_gov": {
      const quem = txt(r.cliente, "o cliente");
      const st = legivel(r.status_acesso) || "informado";
      const criada = bool(r.pendencia_recuperacao_criada);
      // A RPC só cria pendência para invalido/bloqueado, e DEDUPLICA (NOT EXISTS):
      // false pode significar "não se aplica" OU "já existia uma aberta". Distinguir
      // é o item A.5/B-05 — dizer "nasce a pendência" quando não nasceu é o defeito.
      const precisa = st === "invalido" || st === "bloqueado";
      const pend = criada === true
        ? " Pendência de recuperação de senha criada."
        : precisa
          ? " Já havia uma pendência de recuperação aberta para este cliente — não criei uma segunda."
          : "";
      return `Acesso gov.br de ${quem} marcado como ${st}.${pend}`;
    }
    case "agendar_conversao_gov": {
      const quem = txt(r.cliente, "o cliente");
      const ate = txt(r.ate);
      return `Pendência de conversão da conta gov.br de ${quem} aberta${ate ? `, com prazo até ${ate}` : ""} (nível atual: ${txt(r.nivel_atual, "não informado")}).`;
    }

    /* ── Motor 3 · Cards 8/9/10: execução e prazos ─────────────────────────── */
    case "iniciar_execucao":
      return `Execução do processo ${txt(r.processo, "informado")} iniciada na fase ${legivel(r.fase) || "inicial"}.`;
    case "atualizar_fase_execucao": {
      const proc = txt(r.processo, "informado");
      const de = legivel(r.fase_anterior);
      const para = legivel(r.fase_atual) || "informada";
      const alvara = bool(r.pendencia_alvara_criada) === true ? " Pendência do alvará criada." : "";
      return `Execução do processo ${proc}: fase ${de ? `${de} → ${para}` : para}.${alvara}`;
    }
    case "remarcar_revisao_execucao": {
      const n = num(r.pendencias_fechadas);
      const fech = n === null ? "" : ` ${n} pendência(s) de revisão encerrada(s).`;
      return `Revisão da execução do processo ${txt(r.processo, "informado")} remarcada para ${txt(r.proxima_revisao, "a data calculada")}.${fech}`;
    }
    case "registrar_evento_processual": {
      const n = num(r.prazos_criados);
      return `Evento "${legivel(r.evento) || "processual"}" registrado no processo ${txt(r.processo, "informado")}${n === null ? "" : ` — ${n} prazo(s) criado(s)`}.`;
    }

    /* ── Permissões de menu (sem UUID no texto) ────────────────────────────── */
    case "definir_permissao_menu": {
      const acao = txt(r.acao);
      const menu = txt(r.menu_key, "informado");
      if (acao === "revogar") return `Acesso ao menu "${menu}" REVOGADO para o colaborador.`;
      if (acao === "padrao") return `Acesso ao menu "${menu}" voltou ao padrão do papel do colaborador.`;
      return `Acesso ao menu "${menu}" concedido ao colaborador.`;
    }

    /* ── Kit documental (edge gerar-kit-documental) ────────────────────────── */
    case "gerar_kit_documental": {
      // A edge é IDEMPOTENTE: devolve `gerados` (novos) e `ja_existiam`. O cartão
      // prometia gerar os quatro documentos; sem estes números o usuário não sabe
      // se algo foi feito agora ou se tudo já estava lá.
      const quem = txt(r.cliente, "o cliente");
      const ger = num(r.gerados);
      const ja = num(r.ja_existiam);
      if (ger === null && ja === null) return null;
      const partes: string[] = [];
      if ((ger ?? 0) > 0) partes.push(`${ger} documento(s) gerado(s) agora`);
      if ((ja ?? 0) > 0) partes.push(`${ja} já existia(m) no dossiê (não dupliquei)`);
      if (partes.length === 0) partes.push("nenhum documento gerado");
      const falhas = Array.isArray(r.falhas) ? r.falhas.length : 0;
      const falhaTxt = falhas > 0 ? ` ATENÇÃO: ${falhas} documento(s) falharam e NÃO estão no dossiê.` : "";
      return `Kit documental de ${quem}: ${partes.join(" · ")}.${falhaTxt}`;
    }

    /* ── Dossiê ────────────────────────────────────────────────────────────── */
    case "anexar_documento_cliente": {
      const nome = txt(r.document_name, "documento");
      const tipo = txt(r.document_type);
      return `"${nome}" anexado ao dossiê${tipo && tipo !== "outro" ? ` como ${legivel(tipo)}` : ""}.`;
    }

    default:
      return null;
  }
}

/* ─── Composição da mensagem de sucesso ────────────────────────────────────── */

export interface OpcoesMensagemSucesso {
  /** Intenção já redigida (humanSummary). Usada quando a tool não tem resumo de efeito. */
  intencao?: string | null;
  /** Texto extra do orquestrador (ex.: nota do glue de OCR). Vai no fim. */
  sufixo?: string | null;
}

/**
 * Mensagem de sucesso COMPLETA: o que mudou (A.3) + todas as notas do resultado
 * que a RPC devolveu (A.2). É esta função que o orquestrador usa no lugar do
 * "Pronto — ação executada com sucesso." seco.
 */
export function montarMensagemSucesso(
  tool: string, result: unknown, opts: OpcoesMensagemSucesso = {},
): string {
  const efeito = resumoDoEfeito(tool, result);
  // Só a PRIMEIRA linha da intenção: humanSummary de cadastrar_cliente é o cartão
  // inteiro (várias linhas com CPF mascarado, endereço…) e repeti-lo como "resultado"
  // faria a confirmação parecer o cartão de novo.
  const intencao = textoLimpo((opts.intencao ?? "").split("\n")[0] ?? null);
  // Sem contrato conhecido: a INTENÇÃO ainda diz o quê — melhor que a frase opaca.
  const cabeca = efeito ?? (intencao ? `Pronto — ${intencao}` : "Pronto — ação executada com sucesso.");
  const notas = extrairNotasDoResultado(result);
  const corpo = notas.length ? `${cabeca}\n\n${notas.map((n) => `• ${n}`).join("\n")}` : cabeca;
  const sufixo = textoLimpo(opts.sufixo ?? null);
  return sufixo ? `${corpo}\n\n${sufixo}` : corpo;
}
