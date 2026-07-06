import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import Papa from "papaparse";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  COLORS, FONT, page, btnGhost, btnPrimary,
  select as selectStyle, card,
} from "@/components/kanban/kanbanStyles";

// v1: importador de Clientes. Mapeamento case-insensitive de cabeçalhos comuns.
type Target = "clientes";

interface LineResult {
  linha: number;
  nome: string;
  status: "criado" | "pulado" | "erro";
  motivo?: string;
}

// Normaliza um cabeçalho: minúsculo, sem acento, trim.
function normHeader(h: string): string {
  return (h || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

// header normalizado -> coluna de destino em clients
const HEADER_MAP: Record<string, string> = {
  nome: "full_name",
  full_name: "full_name",
  "nome completo": "full_name",
  "razao social": "full_name",
  cpf: "cpf",
  cnpj: "cnpj",
  email: "email",
  "e-mail": "email",
  telefone: "phone",
  phone: "phone",
  celular: "phone",
  cidade: "city",
  city: "city",
  uf: "state",
  estado: "state",
  state: "state",
};

function onlyDigits(s: string): string {
  return (s || "").replace(/\D/g, "");
}

export default function ImportarDados() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [target, setTarget] = useState<Target>("clientes");
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [headerKeys, setHeaderKeys] = useState<string[]>([]); // headers normalizados presentes no arquivo
  const [results, setResults] = useState<LineResult[]>([]);
  const [importing, setImporting] = useState(false);
  const [parseError, setParseError] = useState("");

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResults([]);
    setParseError("");
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const data = (res.data || []).filter(r => r && Object.keys(r).length > 0);
        const fields = (res.meta.fields || []).map(normHeader);
        setHeaderKeys(fields);
        setRows(data);
        if (data.length === 0) setParseError("Arquivo sem linhas de dados.");
      },
      error: (err) => {
        setParseError("Erro ao ler CSV: " + err.message);
        setRows([]);
        setHeaderKeys([]);
      },
    });
    e.target.value = "";
  }

  // Mapeia uma linha bruta (chaves originais) para colunas de clients.
  function mapRow(raw: Record<string, string>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) {
      const col = HEADER_MAP[normHeader(k)];
      if (!col) continue;
      const val = (v ?? "").trim();
      if (val) out[col] = val;
    }
    return out;
  }

  async function runImport() {
    if (!user) { toast.error("Sessão inválida — refaça login."); return; }
    if (rows.length === 0) { toast.error("Nenhuma linha para importar."); return; }

    setImporting(true);
    const out: LineResult[] = [];

    // Pré-carrega CPFs existentes para dedup (apenas dos que aparecem no arquivo).
    const fileCpfs = rows
      .map(r => onlyDigits(mapRow(r).cpf || ""))
      .filter(c => c.length > 0);
    const existingCpfs = new Set<string>();
    if (fileCpfs.length > 0) {
      // R-2 Fase 2B: dedup lê o CPF decifrado da view, não a coluna de texto.
      // (onlyDigits normaliza, então máscara não interfere.)
      const { data: existing } = await (supabase as any)
        .from("clients_decrypted")
        .select("cpf")
        .not("cpf", "is", null);
      for (const c of (existing as unknown as { cpf: string | null }[]) || []) {
        if (c.cpf) existingCpfs.add(onlyDigits(c.cpf));
      }
    }

    // Dedup também dentro do próprio arquivo.
    const seenInFile = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const linha = i + 2; // +1 (0-index) +1 (linha de cabeçalho)
      const mapped = mapRow(rows[i]);
      const nome = mapped.full_name || "";

      if (!nome) {
        out.push({ linha, nome: "(sem nome)", status: "erro", motivo: "full_name (nome) ausente" });
        continue;
      }

      const cpfDigits = onlyDigits(mapped.cpf || "");
      if (cpfDigits) {
        if (existingCpfs.has(cpfDigits)) {
          out.push({ linha, nome, status: "pulado", motivo: "CPF já existe" });
          continue;
        }
        if (seenInFile.has(cpfDigits)) {
          out.push({ linha, nome, status: "pulado", motivo: "CPF duplicado no arquivo" });
          continue;
        }
      }

      const payload: Record<string, unknown> = { ...mapped, created_by: user.id };
      const { error } = await supabase.from("clients").insert(payload as never);
      if (error) {
        out.push({ linha, nome, status: "erro", motivo: error.message });
        continue;
      }
      if (cpfDigits) { existingCpfs.add(cpfDigits); seenInFile.add(cpfDigits); }
      out.push({ linha, nome, status: "criado" });
    }

    setResults(out);
    setImporting(false);
    const criados = out.filter(r => r.status === "criado").length;
    const pulados = out.filter(r => r.status === "pulado").length;
    const erros = out.filter(r => r.status === "erro").length;
    toast.success(`Importação concluída: ${criados} criado(s), ${pulados} pulado(s), ${erros} erro(s).`);
  }

  const mappedCols = headerKeys.map(h => HEADER_MAP[h]).filter(Boolean);
  const hasNome = mappedCols.includes("full_name");

  const summary = {
    criado: results.filter(r => r.status === "criado").length,
    pulado: results.filter(r => r.status === "pulado").length,
    erro: results.filter(r => r.status === "erro").length,
  };

  return (
    <div style={page}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
        <button style={btnGhost} onClick={() => navigate("/sistema")}>← Voltar</button>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: COLORS.goldBright, margin: 0, fontFamily: FONT }}>
          Importar dados
        </h1>
      </div>

      {/* Configuração */}
      <div style={{ ...card, padding: 18, marginBottom: 16, maxWidth: 640 }}>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label style={{ display: "block", fontSize: 11, color: COLORS.text3, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
              Destino
            </label>
            <select style={selectStyle} value={target} onChange={e => setTarget(e.target.value as Target)}>
              <option value="clientes">Clientes</option>
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ display: "block", fontSize: 11, color: COLORS.text3, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
              Arquivo CSV
            </label>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleFile}
              style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: `1px solid ${COLORS.border}`, background: COLORS.bg1, color: COLORS.text2, fontSize: 12, fontFamily: FONT }}
            />
          </div>
        </div>
        <div style={{ fontSize: 11, color: COLORS.text3, marginTop: 12, lineHeight: 1.5 }}>
          Colunas reconhecidas (sem distinção de maiúsculas/acentos): <b>nome / nome completo / razão social</b> (obrigatório), cpf, cnpj, email, telefone / celular, cidade, uf / estado.
          Linhas com CPF já existente são puladas (idempotente).
        </div>
      </div>

      {/* Pré-visualização */}
      {parseError && (
        <div style={{ ...card, padding: 14, marginBottom: 16, maxWidth: 640, borderColor: "rgba(239,68,68,0.4)", color: COLORS.danger }}>
          {parseError}
        </div>
      )}

      {rows.length > 0 && (
        <div style={{ ...card, padding: 18, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: COLORS.text1, fontWeight: 600 }}>
              {fileName} — {rows.length} linha(s)
            </span>
            <span style={{ fontSize: 11, color: hasNome ? COLORS.text3 : COLORS.danger }}>
              Colunas mapeadas: {mappedCols.length > 0 ? mappedCols.join(", ") : "nenhuma"}
            </span>
            <div style={{ flex: 1 }} />
            <button
              style={{ ...btnPrimary, opacity: importing || !hasNome ? 0.6 : 1, cursor: importing || !hasNome ? "default" : "pointer" }}
              disabled={importing || !hasNome}
              onClick={() => void runImport()}
              title={!hasNome ? "O arquivo precisa de uma coluna de nome" : undefined}
            >
              {importing ? "Importando..." : "Importar"}
            </button>
          </div>
          {!hasNome && (
            <div style={{ fontSize: 11, color: COLORS.danger, marginTop: 8 }}>
              Nenhuma coluna de nome reconhecida — adicione uma coluna "nome", "nome completo" ou "razão social".
            </div>
          )}
        </div>
      )}

      {/* Resultados */}
      {results.length > 0 && (
        <div style={{ ...card, padding: 18 }}>
          <div style={{ display: "flex", gap: 16, marginBottom: 14, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: "#2dd4a0", fontWeight: 700 }}>{summary.criado} criado(s)</span>
            <span style={{ fontSize: 13, color: "#f59e0b", fontWeight: 700 }}>{summary.pulado} pulado(s)</span>
            <span style={{ fontSize: 13, color: COLORS.danger, fontWeight: 700 }}>{summary.erro} erro(s)</span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: FONT }}>
              <thead>
                <tr style={{ textAlign: "left", color: COLORS.text3, borderBottom: `1px solid ${COLORS.border}` }}>
                  <th style={{ padding: "6px 8px", fontWeight: 600 }}>Linha</th>
                  <th style={{ padding: "6px 8px", fontWeight: 600 }}>Nome</th>
                  <th style={{ padding: "6px 8px", fontWeight: 600 }}>Status</th>
                  <th style={{ padding: "6px 8px", fontWeight: 600 }}>Motivo</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => {
                  const color = r.status === "criado" ? "#2dd4a0" : r.status === "pulado" ? "#f59e0b" : COLORS.danger;
                  return (
                    <tr key={i} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                      <td style={{ padding: "6px 8px", color: COLORS.text3 }}>{r.linha}</td>
                      <td style={{ padding: "6px 8px", color: COLORS.text1 }}>{r.nome}</td>
                      <td style={{ padding: "6px 8px", color, fontWeight: 600 }}>{r.status}</td>
                      <td style={{ padding: "6px 8px", color: COLORS.text2 }}>{r.motivo || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
