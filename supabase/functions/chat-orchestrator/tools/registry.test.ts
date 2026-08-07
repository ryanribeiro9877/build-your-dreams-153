import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { isReadTool, isWriteTool, toolsPermitidasNoTurno } from "./registry.ts";

/* ── CARD FANTASMA: consulta não leva escrita na mesa ───────────────────────── */

// O conjunto real do "Meu Assistente" no turno de 06/08 19:28: ele portava a tool
// de leitura do KPI e a de escrita da ligação ao mesmo tempo.
const ALLOWED = [
  "kpi_ligacoes", "consultar_cliente", "registrar_ligacao", "criar_pendencia", "delegate",
];

Deno.test("turno de CONSULTA: escrita e roteamento saem da mesa", () => {
  const t = toolsPermitidasNoTurno(ALLOWED, "kpi_ligacoes");
  // As leituras ficam.
  assertEquals(t.includes("kpi_ligacoes"), true);
  assertEquals(t.includes("consultar_cliente"), true);
  // A escrita que gerava o cartão fantasma sai.
  assertEquals(t.includes("registrar_ligacao"), false);
  assertEquals(t.includes("criar_pendencia"), false);
  assertEquals(t.includes("delegate"), false);
});

Deno.test("turno de AÇÃO: a escrita continua disponível (só roteamento sai)", () => {
  const t = toolsPermitidasNoTurno(ALLOWED, "registrar_ligacao");
  assertEquals(t.includes("registrar_ligacao"), true);
  assertEquals(t.includes("criar_pendencia"), true);
  assertEquals(t.includes("kpi_ligacoes"), true);
  // `delegate` nunca fica quando o objeto já foi decidido.
  assertEquals(t.includes("delegate"), false);
});

// Sem objeto decidido (run que veio do roteamento clássico N1→N2→N3) nada muda:
// o filtro não pode alterar o caminho que não passou pelo roteador por objeto.
Deno.test("sem objeto decidido, o conjunto passa intacto", () => {
  assertEquals(toolsPermitidasNoTurno(ALLOWED, undefined), ALLOWED);
  assertEquals(toolsPermitidasNoTurno(ALLOWED, null), ALLOWED);
  assertEquals(toolsPermitidasNoTurno(ALLOWED, ""), ALLOWED);
});

// O filtro só REMOVE: nenhuma chamada pode ganhar ferramenta que o agente não tinha.
Deno.test("o filtro nunca acrescenta ferramenta", () => {
  for (const objeto of ["kpi_ligacoes", "registrar_ligacao", "consultar_execucoes"]) {
    const t = toolsPermitidasNoTurno(ALLOWED, objeto);
    assertEquals(t.every((n) => ALLOWED.includes(n)), true, `objeto=${objeto}`);
  }
});

Deno.test("classificação de leitura/escrita das tools envolvidas", () => {
  assertEquals(isReadTool("kpi_ligacoes"), true);
  assertEquals(isReadTool("consultar_documentos_obrigatorios"), true);
  assertEquals(isWriteTool("registrar_ligacao"), true);
  // `delegate` não é nenhum dos dois: é roteamento.
  assertEquals(isReadTool("delegate"), false);
  assertEquals(isWriteTool("delegate"), false);
});
