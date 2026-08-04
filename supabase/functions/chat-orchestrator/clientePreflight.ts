/* ============================================================
   clientePreflight.ts — desambiguar o CLIENTE antes do cartão
   ============================================================
   POR QUE este arquivo existe (validação de 03-04/08, item A.4, teste A-03):

   (1) A validação do nome do cliente acontecia DEPOIS do cartão de confirmação:
       o usuário lia "Confirme a ação: …", clicava Confirmar, e só então a RPC
       devolvia `motivo:'ambiguo'` com os candidatos. Ou seja: o sistema pedia
       confirmação de algo que ele já sabia que não podia executar. O pré-voo de
       criar_processo (preflightCriarProcesso) já resolvia esse tipo de problema
       ANTES do cartão — aqui o mesmo padrão passa a valer para as tools que
       resolvem cliente por NOME.

   (2) Ao responder o nome escolhido ("é a Ficticia Segunda"), o turno virava
       small talk e NADA era registrado — a ação pendente se perdia e o usuário
       ficava acreditando que havia registrado. Este módulo guarda a decisão em
       metadata e reconhece a escolha na mensagem seguinte, do mesmo jeito que
       isAceiteAtualizarProcesso/offered_process_id fazem para o processo.

   Fora do index.ts para rodar em `deno test` sem rede (index.ts importa
   supabase-js do esm.sh). A parte que fala com o banco fica no orquestrador; o
   que decide texto e casamento de nome fica aqui, testado.
============================================================ */

/**
 * Tools de ESCRITA cuja RPC resolve o cliente por NOME (p_cliente_nome) e devolve
 * `motivo:'ambiguo'`/`cliente_nao_encontrado` — lido do corpo das RPCs em
 * pg_get_functiondef (04/08/2026). O valor é o "o que NÃO foi feito", porque a
 * regra da casa é que toda falha diga isso.
 *
 * Só entram tools de ESCRITA: numa consulta a lista de candidatos já é a resposta
 * útil, não há nada a confirmar.
 */
export const TOOLS_QUE_RESOLVEM_CLIENTE: Record<string, string> = {
  registrar_relacao_bancaria: "nada foi registrado",
  registrar_ligacao: "a ligação não foi registrada",
  registrar_apolice: "a apólice não foi registrada",
  registrar_procuracao: "a procuração não foi registrada",
  registrar_reclamacao: "a reclamação não foi registrada",
  registrar_credencial_gov: "a credencial não foi guardada",
  atualizar_status_credencial_gov: "a situação não foi alterada",
  agendar_conversao_gov: "a conversão não foi agendada",
  anexar_audio_autorizacao: "o áudio não foi anexado",
};

/** Candidato devolvido por agent_consultar_cliente. O `id` é interno (nunca no texto). */
export interface CandidatoCliente {
  id: string;
  nome: string;
}

/**
 * Chaves de args que NÃO podem ser persistidas em metadata de mensagem para
 * retomar a ação depois. `senha` (registrar_credencial_gov) só existe cifrada no
 * cofre; guardá-la em claro no histórico da conversa para "continuar de onde
 * parou" trocaria um defeito de UX por um vazamento. Nesses casos perguntamos o
 * cliente e pedimos que o pedido seja repetido — a pergunta ANTES do cartão
 * continua valendo (é o ganho principal do A.4).
 */
export const CHAVES_SENSIVEIS = ["senha", "password", "senha_gov", "token"] as const;

/** true quando os args podem ser guardados para retomar a ação sem vazar segredo. */
export function podeGuardarArgs(args: Record<string, unknown>): boolean {
  return !CHAVES_SENSIVEIS.some((k) => {
    const v = args[k];
    return typeof v === "string" ? v.trim() !== "" : v !== undefined && v !== null;
  });
}

/** Chaves de args em que o LLM pode ter posto o nome do cliente. */
export const CHAVES_NOME_CLIENTE = ["cliente_nome", "client_nome", "nome"] as const;

/** Primeiro nome de cliente presente nos args (mesma precedência de handlers.ts). */
export function nomeClienteDosArgs(args: Record<string, unknown>): string | null {
  for (const k of CHAVES_NOME_CLIENTE) {
    const v = args[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

const MARCAS_COMBINANTES = new RegExp("[\\u0300-\\u036f]", "g");
/** Acento fora, minúsculo, espaços colapsados — para casar nome sem depender do LLM. */
function fold(s: string): string {
  return String(s ?? "").normalize("NFD").replace(MARCAS_COMBINANTES, "")
    .toLowerCase().replace(/\s+/g, " ").trim();
}

/** Tratamentos e conectivos que NÃO identificam ninguém (não podem casar candidato). */
const RUIDO = new Set([
  "dr", "dra", "sr", "sra", "senhor", "senhora", "dona", "dom", "seu",
  "de", "da", "do", "das", "dos", "e", "a", "o", "as", "os",
  "cliente", "clientes", "eh", "e", "sim", "nao", "quero", "esse", "essa",
  "este", "esta", "aquele", "aquela", "ele", "ela", "mesmo", "mesma", "com",
]);

function tokens(s: string): string[] {
  return fold(s).split(/[^a-z0-9]+/).filter((t) => t.length >= 2 && !RUIDO.has(t));
}

/**
 * PERGUNTA de desambiguação — exibida ANTES de qualquer cartão. Diz o que NÃO foi
 * feito (regra da casa) e lista os candidatos por NOME. Nunca imprime UUID
 * (cláusula H) e nunca CPF: quem responde escolhe pelo nome ou pela ordem.
 */
export function montarPerguntaCliente(
  nomeBuscado: string, candidatos: CandidatoCliente[], oQueNaoFoiFeito: string,
  opts: { podeRetomar?: boolean } = {},
): string {
  if (candidatos.length === 0) {
    return `Não encontrei cliente com "${nomeBuscado}". Confirme o nome (ou o CPF) ou cadastre o cliente primeiro — ${oQueNaoFoiFeito}.`;
  }
  const lista = candidatos.map((c, i) => `${i + 1}. ${c.nome}`).join("\n");
  // Quando a ação não pode ser retomada (args com segredo), dizer isso é
  // obrigatório: prometer "responda o nome que eu continuo" e depois não
  // continuar é exatamente o defeito (2) do A-03.
  const comoResponder = opts.podeRetomar === false
    ? `Repita o pedido já com o nome completo — ${oQueNaoFoiFeito} ainda.`
    : `Responda com o nome (ou o número da lista) — ${oQueNaoFoiFeito} ainda.`;
  return `Há mais de um cliente que casa com "${nomeBuscado}" — me diga qual antes de eu registrar:\n${lista}\n\n${comoResponder}`;
}

/**
 * Casa a resposta CURTA do usuário com um dos candidatos oferecidos. Devolve o
 * candidato escolhido ou null (aí o turno segue o fluxo normal — nunca chutamos).
 *
 * Aceita: o nome (completo ou parte discriminante), o número da lista ("2",
 * "a 2", "o segundo") e o nome com tratamento ("a dona Ficticia Segunda").
 * Exige DESEMPATE: se o texto casa com mais de um candidato, devolve null e a
 * pergunta continua — escolher no empate seria o chute que a regra 0/1/N proíbe.
 */
export function escolherCandidato(
  message: string, candidatos: CandidatoCliente[],
): CandidatoCliente | null {
  const bruto = String(message ?? "").trim();
  if (!bruto || candidatos.length === 0) return null;
  // Resposta longa não é escolha: é um pedido novo.
  if (bruto.length > 160) return null;

  const ORDINAIS: Record<string, number> = {
    primeiro: 1, primeira: 1, segundo: 2, segunda: 2, terceiro: 3, terceira: 3,
    quarto: 4, quarta: 4, quinto: 5, quinta: 5, ultimo: candidatos.length, ultima: candidatos.length,
  };
  const f = fold(bruto);
  // Número puro ("2", "opção 2", "a 2ª"): só quando é o ÚNICO número do texto, para
  // não confundir com ano/valor de um pedido novo.
  const numeros = f.match(/\d+/g) ?? [];
  if (numeros.length === 1) {
    const n = Number(numeros[0]);
    if (n >= 1 && n <= candidatos.length) return candidatos[n - 1];
  }
  for (const [palavra, pos] of Object.entries(ORDINAIS)) {
    // Ordinal só vale se o texto for CURTO (é uma escolha, não uma frase que
    // por acaso contém "primeira").
    if (f.length <= 40 && new RegExp(`(^| )${palavra}( |$)`).test(f) && pos >= 1 && pos <= candidatos.length) {
      return candidatos[pos - 1];
    }
  }

  const toksMsg = tokens(bruto);
  if (toksMsg.length === 0) return null;
  // Pontuação por tokens do NOME presentes na mensagem. Token que aparece em TODOS
  // os candidatos (o sobrenome comum que causou a ambiguidade) não discrimina.
  const listas = candidatos.map((c) => tokens(c.nome));
  const contagem = new Map<string, number>();
  for (const toks of listas) for (const t of new Set(toks)) contagem.set(t, (contagem.get(t) ?? 0) + 1);
  const pontos = listas.map((toks) => {
    let p = 0;
    for (const t of new Set(toks)) {
      if (!toksMsg.includes(t)) continue;
      if ((contagem.get(t) ?? 0) === candidatos.length) continue; // não discrimina
      p++;
    }
    return p;
  });
  const max = Math.max(...pontos);
  if (max === 0) return null;
  if (pontos.filter((p) => p === max).length > 1) return null; // empate → pergunta de novo
  return candidatos[pontos.indexOf(max)];
}
