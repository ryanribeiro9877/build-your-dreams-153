import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTechTest, sectorLabel } from "@/hooks/useTechTest";
import { HexagonLoader } from "@/components/HexagonLoader";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { FlaskConical } from "lucide-react";

/**
 * "Testes por setor" — histórico das sessões de teste do tech.
 *
 * Lista as conversas is_tech_test do PRÓPRIO tech (a RLS de chat_sessions já
 * garante user_id = auth.uid(), então o usuário-alvo nunca vê estas sessões).
 * O nome do setor é resolvido de acting_as_user_id via list_testable_sectors
 * (useTechTest) — profiles não é legível diretamente pelo tech. Abrir uma sessão
 * reabre a conversa no chat (/sistema?session=<id>), mantendo o dry-run.
 */
interface TestSessionRow {
  id: string;
  title: string | null;
  acting_as_user_id: string | null;
  created_at: string;
  last_message_at: string | null;
  message_count: number | null;
}

const cardStyle: React.CSSProperties = {
  background: "var(--bg3, #13131f)", border: "1px solid var(--border, #1e1e2e)", borderRadius: 12,
};
const thStyle: React.CSSProperties = {
  textAlign: "left", padding: "10px 14px", fontSize: 10, fontWeight: 600,
  color: "var(--text3, #888)", textTransform: "uppercase", letterSpacing: "0.08em",
  borderBottom: "1px solid var(--border, #1e1e2e)", whiteSpace: "nowrap",
};
const tdStyle: React.CSSProperties = {
  padding: "12px 14px", fontSize: 13, color: "var(--text2, #cbd5e1)",
  borderBottom: "1px solid var(--border, #1e1e2e)", verticalAlign: "middle",
};

const fmtDate = (iso: string | null) => (iso ? format(parseISO(iso), "dd/MM/yy HH:mm", { locale: ptBR }) : "—");

export default function TechTestes() {
  const { hasRole } = useAuth();
  const navigate = useNavigate();
  const { sectors } = useTechTest();
  const [rows, setRows] = useState<TestSessionRow[]>([]);
  const [loading, setLoading] = useState(true);

  const isTech = hasRole("tech");

  const sectorNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of sectors) m.set(s.user_id, sectorLabel(s));
    return m;
  }, [sectors]);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    // Colunas is_tech_test/acting_as_user_id fora dos tipos gerados → cast.
    const q = (supabase.from("chat_sessions") as unknown as {
      select: (c: string) => {
        eq: (col: string, v: boolean) => {
          order: (col: string, opts: { ascending: boolean }) => Promise<{ data: TestSessionRow[] | null; error: { message: string } | null }>;
        };
      };
    })
      .select("id, title, acting_as_user_id, created_at, last_message_at, message_count")
      .eq("is_tech_test", true)
      .order("last_message_at", { ascending: false });
    const { data } = await q;
    setRows(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isTech) { setLoading(false); return; }
    void fetchSessions();
  }, [isTech, fetchSessions]);

  if (!isTech) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg1, #09090f)", padding: 40 }}>
        <button onClick={() => navigate("/sistema")} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid var(--border, #1e1e2e)", background: "transparent", color: "var(--gold, #c9a84c)", cursor: "pointer", fontSize: 13 }}>← Voltar</button>
        <h1 style={{ fontSize: 22, color: "var(--gold, #c9a84c)", marginTop: 24 }}>Acesso restrito</h1>
        <p style={{ color: "var(--text3, #888)", fontSize: 13 }}>Os testes de setor são exclusivos do acesso técnico (papel <code>tech</code>).</p>
      </div>
    );
  }

  if (loading) return <HexagonLoader variant="fullscreen" label="Carregando testes..." />;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg1, #09090f)", padding: "24px 32px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--gold, #c9a84c)", margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
            <FlaskConical size={20} aria-hidden style={{ color: "#EAB308" }} />
            Testes por setor
          </h1>
          <p style={{ fontSize: 12, color: "var(--text3, #888)", marginTop: 4 }}>
            Suas conversas de teste (dry-run) atuando como cada setor. Nada aqui grava efeito de negócio e o setor-alvo não vê estas conversas.
          </p>
        </div>
        <button onClick={() => navigate("/sistema")} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid var(--border, #1e1e2e)", background: "transparent", color: "var(--gold, #c9a84c)", cursor: "pointer", fontSize: 12 }}>← Voltar ao chat</button>
      </div>

      {rows.length === 0 ? (
        <div style={{ ...cardStyle, padding: 32, textAlign: "center", color: "var(--text3, #888)", fontSize: 13 }}>
          Você ainda não fez nenhum teste. No chat, use o seletor <strong style={{ color: "#EAB308" }}>“Atuar como”</strong> no topo para escolher um setor e conversar com os agentes dele.
        </div>
      ) : (
        <div style={{ ...cardStyle, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
            <thead>
              <tr>
                <th style={thStyle}>Setor</th>
                <th style={thStyle}>Conversa</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Mensagens</th>
                <th style={thStyle}>Criada em</th>
                <th style={thStyle}>Última atividade</th>
                <th style={{ ...thStyle, textAlign: "right" }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const setor = r.acting_as_user_id ? (sectorNameById.get(r.acting_as_user_id) ?? "Setor em teste") : "—";
                return (
                  <tr key={r.id}>
                    <td style={{ ...tdStyle, color: "#EAB308", fontWeight: 600 }}>{setor}</td>
                    <td style={tdStyle}>{r.title || "Sem título"}</td>
                    <td style={{ ...tdStyle, textAlign: "right", fontFamily: "var(--font-mono, monospace)" }}>{r.message_count ?? 0}</td>
                    <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{fmtDate(r.created_at)}</td>
                    <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{fmtDate(r.last_message_at)}</td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>
                      <button
                        onClick={() => navigate(`/sistema?session=${r.id}`)}
                        style={{
                          padding: "5px 12px", borderRadius: 8, cursor: "pointer", fontSize: 11.5, fontWeight: 600,
                          border: "1px solid rgba(234,179,8,0.4)", background: "rgba(234,179,8,0.12)", color: "#EAB308", whiteSpace: "nowrap",
                        }}
                      >
                        Abrir →
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
