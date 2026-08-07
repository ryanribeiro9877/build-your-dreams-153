import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import JSZip from "https://esm.sh/jszip@3.10.1?no-dts";
import {
  materializarPecaDocx,
  nomeDaPeca,
  PECA_DOCX_MIME,
} from "./pecaDocument.ts";

Deno.test("nomeDaPeca usa o primeiro título e acrescenta o cliente", () => {
  assertEquals(
    nomeDaPeca("# PETIÇÃO INICIAL\n\nExcelentíssimo Senhor...", "Carmem Silva"),
    "PETIÇÃO INICIAL — Carmem Silva",
  );
});

Deno.test("nomeDaPeca não duplica o cliente que já está no título", () => {
  assertEquals(
    nomeDaPeca("## Contestação — Carmem Silva\n\nDos fatos", "Carmem Silva"),
    "Contestação — Carmem Silva",
  );
});

Deno.test("nomeDaPeca não transforma o endereçamento inicial em nome de arquivo", () => {
  assertEquals(
    nomeDaPeca(
      "EXCELENTÍSSIMO SENHOR DOUTOR JUIZ DE DIREITO\n\nCarmem...",
      "Carmem Silva",
    ),
    "Peça jurídica — Carmem Silva",
  );
});

Deno.test("materializarPecaDocx produz um DOCX editável e não um texto renomeado", async () => {
  const blob = await materializarPecaDocx(
    "# PETIÇÃO INICIAL\n\nTexto **em destaque** e *itálico*.\n\n- Documento 1\n- Documento 2",
  );
  assertEquals(blob.type, PECA_DOCX_MIME);
  assert(blob.size > 1_000);
  const signature = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
  assertEquals(Array.from(signature), [0x50, 0x4b, 0x03, 0x04]); // ZIP/OOXML
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const xml = await zip.file("word/document.xml")!.async("text");
  assert(xml.includes("PETIÇÃO INICIAL"));
  assert(xml.includes("Texto "));
  assert(xml.includes("em destaque"));
  assert(xml.includes("Documento 2"));
});
