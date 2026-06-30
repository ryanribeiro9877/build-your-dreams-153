import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { HexagonLoader } from "@/components/HexagonLoader";
import type { Database } from "@/integrations/supabase/types";
import {
  COLORS, FONT, page, btnGhost, btnPrimary, btnMini,
  select as selectStyle, overlay, modal, column, card, chip,
} from "@/components/kanban/kanbanStyles";

type OrgStage = Database["public"]["Enums"]["org_stage"];

// Estados da pendência exibidos como colunas (cancelada fica "muted" e fora do board).
const ESTADOS: { key: string; label: string }[] = [
  { key: "aberta", label: "Aberta" },
  { key: "em_tratamento", label: "Em tratamento" },
  { key: "resolvida", label: "Resolvida" },
  { key: "devolvida", label: "Devolvida" },
];

const TIPOS: { value: string; label: string }[] = [
  { value: "documentacao", label: "Documentação" },
  { value: "comprovante_endereco", label: "Comprovante de endereço" },
  { value: "senha_inss", label: "Senha INSS" },
  { value: "reset_inss", label: "Reset INSS" },
  { value: "extratos", label: "Extratos" },
  { value: "falta_documentacao", label: "Falta documentação" },
  { value: "audiencia", label: "Audiência" },
  { value: "reuniao", label: "Reunião" },
  { value: "andamento", label: "Andamento" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "outro", label: "Outro" },
];

const STAGES: OrgStage[] = [
  "atendimento", "confeccao", "revisao", "protocolo", "audiencia", "execucao",
  "execucao_sindicato", "recursos", "recursos_criticos", "alvara", "diligencia",
  "acompanhamento", "financeiro", "recepcao", "recepcao_supervisionada",
  "admin_equipe", "captacao_cooperativa", "kanban_pendencias", "gestao",
];

const STAGE_LABEL: Record<string, string> = {
  atendimento: "Atendimento", confeccao: "Confecção", revisao: "Revisão",
  protocolo: "Protocolo", audiencia: "Audiência", execucao: "Execução",
  execucao_sindicato: "Execução (Sindicato)", recursos: "Recursos",
  recursos_criticos: "Recursos Críticos", alvara: "Alvará", diligencia: "Diligência",
  acompanhamento: "Acompanhamento", financeiro: "Financeiro", recepcao: "Recepção",
  recepcao_supervisionada: "Recepção Supervisionada", admin_equipe: "Admin/Equipe",
  captacao_cooperativa: "Captação Cooperativa", kanban_pendencias: "Kanban Pendências",
  gestao: "Gestão", todas: "Todas",
};

const PRIORITY_LABEL: Record<string, string> = {
  critical: "Crítica", high: "Alta", medium: "Média", low: "Baixa",
};
const PRIORITY_COLOR: Record<string, string> = {
  critical: "#ef4444", high: "#f59e0b", medium: "#3b82f6", low: "#6b7280",
};

interface PendenciaRow {
  id: string;
  title: string;
  pendencia_tipo: string | null;
  pendencia_estado: string | null;
  data_fatal: string | null;
  departamento_atual: OrgStage | null;
  assignee_user_id: string | null;
  client_id: string | null;
  priority: string;
  created_at: string;
}

// Compara data_fatal (YYYY-MM-DD) com hoje, sem hora.
function fatalState(dataFatal: string | null): "overdue" | "soon" | "ok" | null {
  if (!dataFatal) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const fatal = new Date(dataFatal + "T00:00:00");
  if (Number.isNaN(fatal.getTime())) return null;
  const diffDays = Math.floor((fatal.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return "overdue";
  if (diffDays <= 2) return "soon";
  return "ok";
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("pt-BR");
}

export default function Pendencias() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<PendenciaRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros (client-side).
  const [estadoFilter, setEstadoFilter] = useState("todos");
  const [tipoFilter, setTipoFilter] = useState("todos");
  const [soAtrasadas, setSoAtrasadas] = useState(false);

  // Dialogs de ação.
  const [resolveTarget, setResolveTarget] = useState<PendenciaRow | null>(null);
  const [resolveText, setResolveText] = useState("");
  const [transferTarget, setTransferTarget] = useState<PendenciaRow | null>(null);
  const [transferStage, setTransferStage] = useState<OrgStage>("atendimento");
  const [busy, setBusy] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("user_tasks")
      .select("id, title, pendencia_tipo, pendencia_estado, data_fatal, departamento_atual, assignee_user_id, client_id, priority, created_at")
      .eq("is_pendencia", true)
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Erro ao carregar pendências: " + error.message);
      setRows([]);
    } else {
      setRows((data as unknown as PendenciaRow[]) || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const filtered = useMemo(() => {
    let r = rows;
    if (estadoFilter !== "todos") r = r.filter(x => x.pendencia_estado === estadoFilter);
    if (tipoFilter !== "todos") r = r.filter(x => x.pendencia_tipo === tipoFilter);
    if (soAtrasadas) r = r.filter(x => fatalState(x.data_fatal) === "overdue");
    return r;
  }, [rows, estadoFilter, tipoFilter, soAtrasadas]);

  const byEstado = useMemo(() => {
    const map: Record<string, PendenciaRow[]> = {};
    for (const e of ESTADOS) map[e.key] = [];
    const others: PendenciaRow[] = []; // cancelada / estados desconhecidos
    for (const r of filtered) {
      const k = r.pendencia_estado ?? "aberta";
      if (map[k]) map[k].push(r);
      else others.push(r);
    }
    return { map, others };
  }, [filtered]);

  async function doResolve() {
    if (!resolveTarget) return;
    setBusy(true);
    const { error } = await supabase.rpc("resolver_pendencia", {
      p_id: resolveTarget.id,
      p_resolucao: resolveText.trim() || undefined,
    });
    setBusy(false);
    if (error) { toast.error("Erro ao resolver: " + error.message); return; }
    toast.success("Pendência resolvida.");
    setResolveTarget(null);
    setResolveText("");
    void fetchData();
  }

  async function doTransfer() {
    if (!transferTarget) return;
    setBusy(true);
    const { error } = await supabase.rpc("transferir_pendencia", {
      p_id: transferTarget.id,
      p_departamento_destino: transferStage,
    });
    setBusy(false);
    if (error) { toast.error("Erro ao transferir: " + error.message); return; }
    toast.success(`Transferida para ${STAGE_LABEL[transferStage] ?? transferStage}.`);
    setTransferTarget(null);
    void fetchData();
  }

  const renderCard = (r: PendenciaRow) => {
    const fs = fatalState(r.data_fatal);
    const fatalColor = fs === "overdue" ? COLORS.danger : fs === "soon" ? "#f59e0b" : COLORS.text3;
    const tipoLabel = TIPOS.find(t => t.value === r.pendencia_tipo)?.label ?? (r.pendencia_tipo ?? "—");
    const resolved = r.pendencia_estado === "resolvida";
    return (
      <div key={r.id} style={{ ...card, marginBottom: 8, borderLeft: `3px solid ${PRIORITY_COLOR[r.priority] ?? COLORS.text3}` }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text1, marginBottom: 6, lineHeight: 1.3 }}>
          {r.title}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginBottom: 8 }}>
          <span style={{ ...chip, background: "rgba(234,179,8,0.12)", color: COLORS.goldBright, border: "1px solid rgba(234,179,8,0.3)" }}>
            {tipoLabel}
          </span>
          <span style={{ ...chip, background: "rgba(255,255,255,0.05)", color: PRIORITY_COLOR[r.priority] ?? COLORS.text3, border: `1px solid ${PRIORITY_COLOR[r.priority] ?? COLORS.border}` }}>
            {PRIORITY_LABEL[r.priority] ?? r.priority}
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: resolved ? 0 : 8 }}>
          <span style={{ fontSize: 11, color: fatalColor, fontWeight: fs === "overdue" || fs === "soon" ? 700 : 400 }}>
            {fs === "overdue" ? "⚠ Vencida: " : "Data fatal: "}{fmtDate(r.data_fatal)}
          </span>
          {r.departamento_atual && (
            <span style={{ fontSize: 10, color: COLORS.text3 }}>{STAGE_LABEL[r.departamento_atual] ?? r.departamento_atual}</span>
          )}
        </div>
        {!resolved && (
          <div style={{ display: "flex", gap: 6 }}>
            <button
              style={{ ...btnMini, flex: 1, borderColor: "rgba(45,212,160,0.4)", color: "#2dd4a0" }}
              onClick={() => { setResolveTarget(r); setResolveText(""); }}
            >Resolver</button>
            <button
              style={{ ...btnMini, flex: 1 }}
              onClick={() => { setTransferTarget(r); setTransferStage(r.departamento_atual ?? "atendimento"); }}
            >Transferir</button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={page}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
        <button style={btnGhost} onClick={() => navigate("/sistema")}>← Voltar</button>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: COLORS.goldBright, margin: 0, fontFamily: FONT }}>
          Pendências
        </h1>
        <span style={{ fontSize: 12, color: COLORS.text3, background: COLORS.bg1, padding: "4px 10px", borderRadius: 6 }}>
          {filtered.length} {filtered.length === 1 ? "pendência" : "pendências"}
        </span>
        <div style={{ flex: 1 }} />
        <button style={btnGhost} onClick={() => void fetchData()}>↻ Atualizar</button>
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap", alignItems: "center" }}>
        <select style={selectStyle} value={estadoFilter} onChange={e => setEstadoFilter(e.target.value)}>
          <option value="todos">Todos os estados</option>
          {ESTADOS.map(e => <option key={e.key} value={e.key}>{e.label}</option>)}
          <option value="cancelada">Cancelada</option>
        </select>
        <select style={selectStyle} value={tipoFilter} onChange={e => setTipoFilter(e.target.value)}>
          <option value="todos">Todos os tipos</option>
          {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: soAtrasadas ? COLORS.goldBright : COLORS.text2, cursor: "pointer", fontFamily: FONT }}>
          <input type="checkbox" checked={soAtrasadas} onChange={e => setSoAtrasadas(e.target.checked)} style={{ accentColor: COLORS.gold }} />
          Só atrasadas
        </label>
      </div>

      {/* Board */}
      {loading ? (
        <HexagonLoader variant="inline" />
      ) : (
        <>
          <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 8 }}>
            {ESTADOS.map(e => (
              <div key={e.key} style={column}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.text1 }}>{e.label}</span>
                  <span style={{ ...chip, background: "rgba(255,255,255,0.05)", color: COLORS.text2, border: `1px solid ${COLORS.border}` }}>
                    {byEstado.map[e.key].length}
                  </span>
                </div>
                {byEstado.map[e.key].length === 0 ? (
                  <div style={{ fontSize: 11, color: COLORS.text3, textAlign: "center", padding: "16px 0" }}>Nenhuma</div>
                ) : byEstado.map[e.key].map(renderCard)}
              </div>
            ))}
          </div>

          {/* Canceladas / outros estados — muted */}
          {byEstado.others.length > 0 && (
            <div style={{ marginTop: 18, opacity: 0.55 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.text3, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Canceladas / outros ({byEstado.others.length})
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {byEstado.others.map(r => (
                  <div key={r.id} style={{ ...card, width: 260 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.text2 }}>{r.title}</div>
                    <div style={{ fontSize: 10, color: COLORS.text3, marginTop: 4 }}>{r.pendencia_estado ?? "—"}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Dialog Resolver */}
      {resolveTarget && (
        <div style={overlay} onClick={() => !busy && setResolveTarget(null)}>
          <div style={modal} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.text1, marginBottom: 6 }}>Resolver pendência</div>
            <div style={{ fontSize: 12, color: COLORS.text3, marginBottom: 14 }}>{resolveTarget.title}</div>
            <label style={{ display: "block", fontSize: 11, color: COLORS.text3, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
              Resolução (opcional)
            </label>
            <textarea
              value={resolveText}
              onChange={e => setResolveText(e.target.value)}
              placeholder="Descreva como a pendência foi resolvida..."
              style={{ width: "100%", minHeight: 80, padding: "8px 12px", borderRadius: 8, border: `1px solid ${COLORS.border}`, background: COLORS.bg2, color: COLORS.text1, fontSize: 13, fontFamily: FONT, resize: "vertical", boxSizing: "border-box" }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button style={btnGhost} disabled={busy} onClick={() => setResolveTarget(null)}>Cancelar</button>
              <button style={{ ...btnPrimary, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => void doResolve()}>
                {busy ? "Resolvendo..." : "Confirmar resolução"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dialog Transferir */}
      {transferTarget && (
        <div style={overlay} onClick={() => !busy && setTransferTarget(null)}>
          <div style={modal} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.text1, marginBottom: 6 }}>Transferir pendência</div>
            <div style={{ fontSize: 12, color: COLORS.text3, marginBottom: 14 }}>{transferTarget.title}</div>
            <label style={{ display: "block", fontSize: 11, color: COLORS.text3, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
              Departamento de destino
            </label>
            <select
              style={{ ...selectStyle, width: "100%" }}
              value={transferStage}
              onChange={e => setTransferStage(e.target.value as OrgStage)}
            >
              {STAGES.map(s => <option key={s} value={s}>{STAGE_LABEL[s] ?? s}</option>)}
            </select>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button style={btnGhost} disabled={busy} onClick={() => setTransferTarget(null)}>Cancelar</button>
              <button style={{ ...btnPrimary, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => void doTransfer()}>
                {busy ? "Transferindo..." : "Confirmar transferência"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
