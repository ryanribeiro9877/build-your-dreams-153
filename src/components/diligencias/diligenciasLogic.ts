import { formatDateBR } from "@/components/clients/shared";
import { DILIGENCIA_STATUS_META } from "@/lib/p2";

/* ============================================================
   Card 11 — Diligências: lógica pura da tela
   ============================================================
   Mora fora do .tsx porque é o que precisa de teste: semáforo de vencida,
   agrupamento por vara, linhagem da rediligência e tradução dos motivos do
   banco. Nada aqui toca supabase nem React.

   POR QUE A GRADE LÊ A TABELA E NÃO `consultar_diligencias`:
   a RPC devolve um recorte enxuto (id, processo, processo_vinculado, cliente,
   vara, tipo, descricao, prazo, status, protocolo, responsavel, vencida) e NÃO
   devolve `diligencia_origem_id`, `cumprida_em`, `resultado`, `notes` nem
   `is_test`. Sem `diligencia_origem_id` a LINHAGEM (“rediligência de …”) é
   impossível, e sem `notes` a marca “[cumprida sem protocolo]” que o próprio
   banco grava ficaria invisível. Então a tela lê `diligencias` direto — a
   policy de SELECT (`is_socio_or_advogado() OR admin`) é o mesmo gate da RPC,
   ou seja, quem vê pela RPC vê pela tabela e vice-versa.
   Consequência: a tabela não tem a coluna `vencida`, e ela é DERIVADA aqui com
   a expressão copiada do corpo da RPC (ver `estaVencida`) para tela e chat
   nunca discordarem sobre o que está vencido.

   MEDIDO em 30/07/2026 e registrado aqui para quem for “simplificar” esta tela
   trocando a leitura pela RPC: `consultar_diligencias` REBAIXA status inválido
   para `pendente` em SILÊNCIO (`IF v_st NOT IN (...) THEN v_st := 'pendente'`)
   e só o campo `status_filtro` do retorno revela o que ela realmente aplicou.
   Quem usar a RPC TEM de exibir esse `status_filtro`. Aqui o filtro é local e
   fechado (só os 4 valores do seletor), então o que a tela mostra é o que a
   tela filtrou.
============================================================ */

export interface ProcessoEmbed {
  process_number: string | null;
  /** Nome desnormalizado em `processes` — é o que a tela usa para “cliente”.
   *  `clients` NÃO serve aqui: a policy dela é `can_view_clients()`
   *  (recepção/sócio/admin/grant), logo um `adv_*` — que tem acesso a esta
   *  tela — leria 0 linhas e a coluna viria vazia sem erro nenhum. */
  client_name: string | null;
}

export interface DiligenciaRow {
  id: string;
  process_id: string | null;
  process_numero_texto: string | null;
  client_id: string | null;
  vara: string | null;
  tipo: string;
  descricao: string;
  prazo: string | null;
  status: string;
  protocolo: string | null;
  resultado: string | null;
  cumprida_em: string | null;
  diligencia_origem_id: string | null;
  responsavel_nome: string | null;
  responsavel_user_id: string | null;
  notes: string | null;
  is_test: boolean | null;
  created_at: string;
  pendencia_task_id: string | null;
  processes: ProcessoEmbed | null;
}

/** Projeção explícita (nunca `select("*")`). O embed de `processes` vem pela FK
 *  `diligencias_process_id_fkey` — única FK desta tabela para `processes`. */
export const DILIGENCIA_COLUNAS = [
  "id", "process_id", "process_numero_texto", "client_id", "vara", "tipo",
  "descricao", "prazo", "status", "protocolo", "resultado", "cumprida_em",
  "diligencia_origem_id", "responsavel_nome", "responsavel_user_id", "notes",
  "is_test", "created_at", "pendencia_task_id",
  "processes(process_number, client_name)",
].join(", ");

/** Teto de linhas por carga. Os filtros e o agrupamento são LOCAIS (a linhagem
 *  precisa da diligência original mesmo quando ela está fora do filtro), então
 *  o teto é um limite real da tela e é anunciado na UI quando encostado. */
export const DILIGENCIAS_LIMITE = 1000;

/* ---------- datas ---------- */

/** Hoje em YYYY-MM-DD no fuso do NAVEGADOR. É o relógio disponível no cliente;
 *  o banco compara com `current_date` do servidor. Perto da meia-noite, ou com
 *  o relógio da máquina errado, os dois podem divergir em 1 dia — por isso a
 *  tela nunca decide nada irreversível pelo semáforo, só pinta. */
export function hojeISO(d: Date = new Date()): string {
  return d.toLocaleDateString("en-CA");
}

/** Dias de `deISO` até `ateISO` (ambos YYYY-MM-DD). Negativo = `ateISO` é antes. */
export function diasEntre(deISO: string, ateISO: string): number {
  const a = Date.parse(`${deISO}T00:00:00Z`);
  const b = Date.parse(`${ateISO}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86400000);
}

/**
 * Semáforo do card: VERMELHO = vencida.
 * Expressão copiada de `consultar_diligencias`:
 *   (d.status='pendente' AND d.prazo IS NOT NULL AND d.prazo < current_date)
 * Cumprida/prejudicada com prazo passado NÃO é vencida — o prazo já morreu com
 * o encerramento; pintar de vermelho viraria alarme falso permanente.
 * Comparação de string funciona porque ISO YYYY-MM-DD é lexicograficamente
 * ordenado.
 */
export function estaVencida(d: { status: string; prazo: string | null }, hoje: string): boolean {
  return d.status === "pendente" && !!d.prazo && d.prazo < hoje;
}

/** Rótulo do prazo com o atraso/antecedência em dias (só para pendentes). */
export function prazoMeta(d: { status: string; prazo: string | null }, hoje: string):
  { texto: string; detalhe: string | null; vencida: boolean } {
  if (!d.prazo) return { texto: "sem prazo", detalhe: null, vencida: false };
  const vencida = estaVencida(d, hoje);
  if (vencida) {
    const dias = diasEntre(d.prazo, hoje);
    return { texto: formatDateBR(d.prazo), detalhe: `vencida há ${dias} dia(s)`, vencida: true };
  }
  if (d.status !== "pendente") return { texto: formatDateBR(d.prazo), detalhe: null, vencida: false };
  const faltam = diasEntre(hoje, d.prazo);
  return {
    texto: formatDateBR(d.prazo),
    detalhe: faltam === 0 ? "vence hoje" : `em ${faltam} dia(s)`,
    vencida: false,
  };
}

/* ---------- rótulos das colunas ---------- */

/** Processo. `vinculado=false` é o caso “ponte”: `registrar_diligencia` guardou
 *  só o NÚMERO porque não achou um processo único com ele. */
export function processoLabel(d: DiligenciaRow): { texto: string; vinculado: boolean } {
  if (d.process_id) {
    return {
      vinculado: true,
      // Sem o embed a linha continua existindo (a RLS de `processes` é permissiva
      // para advogado/sócio); se vier nulo, é honesto dizer que não carregou —
      // não inventar o número a partir de outro campo.
      texto: d.processes?.process_number?.trim() || "(processo vinculado — número não carregado)",
    };
  }
  return { vinculado: false, texto: d.process_numero_texto?.trim() || "(sem número)" };
}

/** Cliente. `null` = a tela mostra “—”. Diligência-ponte não tem cliente no
 *  banco (a RPC só resolve o cliente pelo processo), então vazio é o dado real. */
export function clienteLabel(d: DiligenciaRow): string | null {
  const nome = d.processes?.client_name?.trim();
  if (nome) return nome;
  if (d.client_id) return "(cliente vinculado — nome não carregado)";
  return null;
}

/** Responsável é TEXTO LIVRE na tabela (mesma razão do Card 8: parte da equipe
 *  ainda não tem usuário). Se só houver o user_id, a tela diz isso. */
export function responsavelLabel(d: DiligenciaRow): string | null {
  const nome = d.responsavel_nome?.trim();
  if (nome) return nome;
  if (d.responsavel_user_id) return "(usuário vinculado)";
  return null;
}

/* ---------- filtros ---------- */

export interface FiltrosDiligencia {
  status: string;
  vara: string;
  processo: string;
  vencendoAte: string;
}

export const FILTROS_VAZIOS: FiltrosDiligencia = {
  status: "pendente", vara: "", processo: "", vencendoAte: "",
};

/** Os 4 valores que o banco aceita em `p_status` (o 4º, `todas`, não é status de
 *  linha — é “sem filtro”). Fora desta lista a RPC rebaixa para `pendente`. */
export const STATUS_FILTRO_OPTIONS: { value: string; label: string }[] = [
  ...Object.entries(DILIGENCIA_STATUS_META).map(([value, m]) => ({ value, label: m.label })),
  { value: "todas", label: "Todas" },
];

/** Dobra caixa, acento e os indicadores ordinais (ª/º → a/o). O banco filtra
 *  vara/processo com ILIKE, que é sensível a acento; aqui o filtro é MAIS
 *  permissivo de propósito — “1a vara civel” acha “1ª Vara Cível”, que é
 *  exatamente a variação de grafia que a planilha do escritório tem. Divergência
 *  deliberada e inofensiva: só busca/agrupamento em memória, nada gravado muda.
 *  ª e º NÃO são diacríticos: o NFD não os decompõe, daí o replace explícito. */
export function fold(s: string): string {
  return s.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ª/gi, "a")
    .replace(/º/gi, "o")
    .toLowerCase()
    .trim();
}

export function aplicarFiltros(rows: DiligenciaRow[], f: FiltrosDiligencia): DiligenciaRow[] {
  const vara = fold(f.vara);
  const proc = fold(f.processo);
  return rows.filter(d => {
    if (f.status !== "todas" && d.status !== f.status) return false;
    if (vara && !fold(d.vara ?? "").includes(vara)) return false;
    if (proc && !fold(processoLabel(d).texto).includes(proc)) return false;
    // Mesma regra da RPC: com “vencendo até” preenchido, diligência SEM prazo
    // sai da lista (o banco exige `prazo IS NOT NULL AND prazo <= p_vencendo_ate`).
    // A tela avisa isso ao lado do campo, senão a linha “desaparece” sem motivo.
    if (f.vencendoAte && !(d.prazo && d.prazo <= f.vencendoAte)) return false;
    return true;
  });
}

export function filtrosAtivos(f: FiltrosDiligencia): string[] {
  const out: string[] = [];
  if (f.status !== "todas") out.push(`status ${DILIGENCIA_STATUS_META[f.status]?.label ?? f.status}`);
  if (f.vara.trim()) out.push(`vara contendo “${f.vara.trim()}”`);
  if (f.processo.trim()) out.push(`processo contendo “${f.processo.trim()}”`);
  if (f.vencendoAte) out.push(`vencendo até ${formatDateBR(f.vencendoAte)}`);
  return out;
}

/* ---------- agrupador por vara ---------- */

export const SEM_VARA = "__sem_vara__";

export interface GrupoVara {
  /** Chave dobrada (acento/caixa) — é o que junta “1ª Vara Cível” e “1a vara civel”. */
  chave: string;
  /** Primeira grafia encontrada, exibida no cabeçalho. `null` = sem vara. */
  vara: string | null;
  /** Grafias distintas que caíram no mesmo grupo (planilha tem variação). */
  grafias: string[];
  rows: DiligenciaRow[];
  pendentes: number;
  vencidas: number;
}

/**
 * Agrupa por VARA porque é o formato da planilha do escritório (uma aba por
 * vara). Chave dobrada para não estilhaçar o mesmo juízo em vários grupos por
 * causa de acento/caixa; quando isso acontece, o grupo declara quantas grafias
 * juntou em vez de esconder a divergência do cadastro.
 * Ordem: varas em ordem alfabética (pt-BR), “sem vara” por último; dentro do
 * grupo, prazo crescente com “sem prazo” no fim (igual ao `ORDER BY d.prazo
 * NULLS LAST` da RPC), empate pelo mais antigo.
 */
export function agruparPorVara(rows: DiligenciaRow[], hoje: string): GrupoVara[] {
  const mapa = new Map<string, GrupoVara>();
  for (const d of rows) {
    const bruta = d.vara?.trim() ?? "";
    const chave = bruta ? fold(bruta) : SEM_VARA;
    let g = mapa.get(chave);
    if (!g) {
      g = { chave, vara: bruta || null, grafias: [], rows: [], pendentes: 0, vencidas: 0 };
      mapa.set(chave, g);
    }
    if (bruta && !g.grafias.includes(bruta)) g.grafias.push(bruta);
    g.rows.push(d);
    if (d.status === "pendente") g.pendentes += 1;
    if (estaVencida(d, hoje)) g.vencidas += 1;
  }
  const grupos = [...mapa.values()];
  for (const g of grupos) {
    g.rows.sort((a, b) => {
      if (a.prazo && b.prazo && a.prazo !== b.prazo) return a.prazo < b.prazo ? -1 : 1;
      if (a.prazo && !b.prazo) return -1;
      if (!a.prazo && b.prazo) return 1;
      return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;
    });
  }
  grupos.sort((a, b) => {
    if (a.chave === SEM_VARA) return 1;
    if (b.chave === SEM_VARA) return -1;
    return (a.vara ?? "").localeCompare(b.vara ?? "", "pt-BR");
  });
  return grupos;
}

/* ---------- linhagem (rediligência) ---------- */

export interface Linhagem {
  texto: string;
  titulo: string;
  /** id da diligência original quando ela está carregada (para o link/scroll). */
  alvoId: string | null;
}

/**
 * `diligencia_origem_id` só é preenchido por `cumprir_diligencia` quando se pede
 * rediligência — ou seja, esta linha é a repetição de uma diligência anterior.
 * A data exibida é a da ORIGINAL, na ordem prazo → cumprida em → criação, e o
 * title diz QUAL das três está na tela (sem isso “rediligência de 15/03” seria
 * ambíguo). A FK é ON DELETE SET NULL, então não existe origem pendurada; o que
 * existe é origem FORA da lista carregada (teto de linhas), e aí a tela diz isso.
 */
export function linhagem(d: DiligenciaRow, porId: Map<string, DiligenciaRow>): Linhagem | null {
  if (!d.diligencia_origem_id) return null;
  const orig = porId.get(d.diligencia_origem_id);
  if (!orig) {
    return {
      texto: "rediligência (original fora desta lista)",
      titulo: "A diligência de origem não está entre as carregadas nesta tela.",
      alvoId: null,
    };
  }
  const [data, qual] = orig.prazo
    ? [orig.prazo, "prazo da diligência original"]
    : orig.cumprida_em
      ? [orig.cumprida_em, "data em que a original foi cumprida"]
      : [orig.created_at, "data de criação da original"];
  return {
    texto: `rediligência de ${formatDateBR(data)}`,
    titulo: `Origem: ${qual} · processo ${processoLabel(orig).texto}`,
    alvoId: orig.id,
  };
}

/* ---------- retorno das RPCs ---------- */

export interface RpcRetorno {
  ok?: boolean;
  motivo?: string;
  mensagem?: string;
  /** cumprir_diligencia, em `diligencia_ja_encerrada` */
  status_atual?: string;
  /** cumprir_diligencia, em ok:true */
  diligencia_id?: string;
  protocolo?: string | null;
  sem_protocolo?: boolean;
  pendencia_fechada?: boolean;
  rediligencia_id?: string | null;
  rediligenciar_em?: string | null;
  aviso?: string | null;
  /** registrar_diligencia, em ok:true */
  tipo?: string;
  processo?: string | null;
  processo_vinculado?: boolean;
  pendencia_prazo_criada?: boolean;
}

export type RpcErro = { code?: string; message?: string } | null;

const SEM_ACESSO = "esta tela é restrita a advogado/sócio (e admin).";

/**
 * Motivos de `cumprir_diligencia` — lidos do CORPO da função em 30/07/2026.
 * São só estes dois. `protocolo_obrigatorio` foi REMOVIDO do banco (a RPC hoje
 * cumpre sem protocolo e apenas AVISA), então não existe tradução para ele e a
 * tela não bloqueia por protocolo em branco.
 */
export function falhaCumprir(data: RpcRetorno | null, error: RpcErro): string | null {
  const oQue = "Diligência NÃO cumprida";
  if (error) {
    if (error.code === "42501") return `${oQue}: ${SEM_ACESSO}`;
    return `${oQue}: ${error.message ?? "erro na chamada"}`;
  }
  if (!data) return `${oQue}: a chamada não retornou resultado.`;
  if (data.ok) return null;
  if (data.motivo === "diligencia_nao_encontrada") {
    return `${oQue}: essa diligência não existe mais (recarregue a lista).`;
  }
  if (data.motivo === "diligencia_ja_encerrada") {
    const st = DILIGENCIA_STATUS_META[data.status_atual ?? ""]?.label ?? data.status_atual ?? "encerrada";
    return `${oQue}: ela já está ${st.toLowerCase()} — só diligência pendente pode ser cumprida.`;
  }
  return `${oQue}: ${data.mensagem ?? data.motivo ?? "erro"}`;
}

/**
 * Motivos de `registrar_diligencia` — lidos do CORPO em 30/07/2026:
 * descricao_obrigatoria, tipo_invalido, processo_nao_informado. Nada além disso.
 */
export function falhaRegistrar(data: RpcRetorno | null, error: RpcErro): string | null {
  const oQue = "Diligência NÃO registrada";
  if (error) {
    if (error.code === "42501") return `${oQue}: ${SEM_ACESSO}`;
    return `${oQue}: ${error.message ?? "erro na chamada"}`;
  }
  if (!data) return `${oQue}: a chamada não retornou resultado.`;
  if (data.ok) return null;
  const motivos: Record<string, string> = {
    descricao_obrigatoria: "descreva o que precisa ser feito.",
    tipo_invalido: data.mensagem ?? "tipo de diligência inválido.",
    processo_nao_informado: data.mensagem ?? "informe o número do processo.",
  };
  return `${oQue}: ${motivos[data.motivo ?? ""] ?? data.mensagem ?? data.motivo ?? "erro"}`;
}

/**
 * TODO aviso/nota que `cumprir_diligencia` devolve, virado em texto de tela.
 * `aviso` só vem preenchido quando falta protocolo E o tipo é `balcao_virtual`
 * (é o único caso em que o banco também escreve “[cumprida sem protocolo em …]”
 * nas observações) — nos outros tipos o protocolo em branco passa em SILÊNCIO,
 * e é a tela que precisa dizer isso.
 */
export function avisosCumprir(data: RpcRetorno | null, tinhaPendencia: boolean): string[] {
  if (!data?.ok) return [];
  const out: string[] = [];
  if (data.aviso) out.push(data.aviso);
  else if (data.sem_protocolo) {
    out.push("Cumprida SEM número de protocolo. Neste tipo de diligência o banco não grava marca nenhuma nas observações nem devolve aviso — sem o protocolo não há comprovação.");
  }
  if (tinhaPendencia) {
    out.push(data.pendencia_fechada
      ? "A pendência desta diligência foi fechada em Tarefas."
      : "A pendência ligada a esta diligência NÃO foi fechada (já estava concluída ou cancelada).");
  }
  if (data.rediligencia_id) {
    out.push(`Rediligência criada com prazo ${formatDateBR(data.rediligenciar_em ?? null)}, ligada a esta, com pendência nova em Tarefas.`);
  }
  return out;
}

/**
 * TODO aviso/nota de `registrar_diligencia`.
 * O `aviso` do banco fala em “processo ainda não cadastrado”, mas o resolvedor
 * (`_resolver_processo`) devolve nulo TAMBÉM quando o número casa com MAIS DE UM
 * processo (`IF v_n <> 1 THEN RETURN NULL`). A tela acrescenta essa segunda
 * leitura para ninguém sair cadastrando um processo que já existe.
 */
/**
 * `prazoInformado` (AAAA-MM-DD) entra porque `registrar_diligencia` NÃO valida data
 * no passado: grava e cria a pendência JÁ VENCIDA, sem aviso nenhum. O handler do
 * chat tem esse alerta; a tela não tinha, e a mesma RPC se comportava de dois jeitos.
 * Comparação de strings AAAA-MM-DD é ordenação lexicográfica = cronológica, então
 * não precisa de Date (e não sofre com fuso). `hoje` é injetável para teste.
 */
export function avisosRegistrar(
  data: RpcRetorno | null,
  prazoInformado?: string | null,
  hoje?: string,
): string[] {
  if (!data?.ok) return [];
  const out: string[] = [];
  if (data.aviso) {
    out.push(data.aviso);
    out.push("Isso também acontece quando o número casa com MAIS DE UM processo cadastrado — o banco só vincula quando casa com exatamente um.");
  }
  // Pendência mora em TAREFAS: nenhuma das 271 pendências do sistema está num
  // board de Kanban (medido em 07/08), porque card só entra em board por
  // kanban_add_task_to_board. Kanban é a esteira de CASO distribuído.
  out.push(data.pendencia_prazo_criada
    ? "Pendência de prazo criada em Tarefas."
    : "Sem prazo informado: NENHUMA pendência foi criada em Tarefas — a diligência só vai aparecer nesta tela.");
  const ref = hoje ?? new Date().toLocaleDateString("en-CA");
  if (prazoInformado && /^\d{4}-\d{2}-\d{2}$/.test(prazoInformado) && prazoInformado < ref) {
    out.push(`O prazo informado (${prazoInformado}) já passou: a pendência nasce VENCIDA. O banco aceita sem reclamar — confira se a data está certa.`);
  }
  return out;
}
