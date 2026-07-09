import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { mapDocumentoToTipo, buildPendenciaTitulo, PENDENCIA_TIPOS } from "./docChecklist.ts";

Deno.test("mapeia documentos conhecidos para o tipo de pendência", () => {
  assertEquals(mapDocumentoToTipo("extrato"), "extratos");
  assertEquals(mapDocumentoToTipo("Extratos"), "extratos");
  assertEquals(mapDocumentoToTipo("contrato"), "documentacao");
  assertEquals(mapDocumentoToTipo("comprovante de endereço"), "comprovante_endereco");
  assertEquals(mapDocumentoToTipo("senha INSS"), "senha_inss");
});

Deno.test("documento desconhecido cai em 'documentacao' e é um tipo válido", () => {
  assertEquals(mapDocumentoToTipo("algo aleatório"), "documentacao");
  // todo tipo retornado tem de pertencer ao enum aceito pelo criar_pendencia
  const t = mapDocumentoToTipo("xyz");
  assertEquals(PENDENCIA_TIPOS.includes(t), true);
});

Deno.test("título inclui o réu quando informado", () => {
  assertEquals(buildPendenciaTitulo("extrato", "Crefisa"), "Documento pendente: extrato — Crefisa");
  assertEquals(buildPendenciaTitulo("  contrato  ", null), "Documento pendente: contrato");
  assertEquals(buildPendenciaTitulo("contrato", "  "), "Documento pendente: contrato");
});
