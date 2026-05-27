import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { HexagonLoader } from "@/components/HexagonLoader";

const ADJUSTMENT_AMOUNT = 1_500_000;

interface BalanceRow {
  user_id: string;
  display_name: string | null;
  balance: number;
  total_purchased: number;
  total_consumed: number;
  updated_at: string;
}

interface TxRow {
  id: string;
  amount: number;
  transaction_type: string;
  description: string | null;
  created_at: string;
}

export default function AdminMaster() {
  const { user, hasRole, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [target, setTarget] = useState<BalanceRow | null>(null);
  const [balanceBefore, setBalanceBefore] = useState<number | null>(null);
  const [balanceAfter, setBalanceAfter] = useState<number | null>(null);
  const [lastAdjustmentAt, setLastAdjustmentAt] = useState<string | null>(null);
  const [recentTx, setRecentTx] = useState<TxRow[]>([]);

  const fetchBalance = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data: roleRow, error: roleErr } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (roleErr) throw roleErr;
      if (!roleRow) {
        toast.error("Nenhum admin master encontrado.");
        setTarget(null);
        return null;
      }

      const adminId = roleRow.user_id;

      const [{ data: bal }, { data: prof }, { data: tx }] = await Promise.all([
        supabase.from("token_balances").select("*").eq("user_id", adminId).maybeSingle(),
        supabase.from("profiles").select("display_name").eq("user_id", adminId).maybeSingle(),
        supabase.from("token_transactions").select("id, amount, transaction_type, description, created_at")
          .eq("user_id", adminId).order("created_at", { ascending: false }).limit(5),
      ]);

      const row: BalanceRow = {
        user_id: adminId,
        display_name: prof?.display_name ?? null,
        balance: bal?.balance ?? 0,
        total_purchased: bal?.total_purchased ?? 0,
        total_consumed: bal?.total_consumed ?? 0,
        updated_at: bal?.updated_at ?? new Date().toISOString(),
      };
      setTarget(row);
      setRecentTx((tx ?? []) as TxRow[]);
      return row;
    } catch (e: unknown) {
      toast.error("Erro ao carregar saldo: " + (e instanceof Error ? e.message : "desconhecido"));
      return null;
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate("/auth"); return; }
    if (!hasRole("admin")) { toast.error("Acesso restrito a administradores."); navigate("/sistema"); return; }
    fetchBalance();
  }, [authLoading, user, hasRole, navigate, fetchBalance]);

  async function handleApplyAdjustment() {
    if (!target) return;
    const expectedBalance = target.balance;

    setApplying(true);
    try {
      // Re-check current balance to detect concurrent changes
      const { data: fresh, error: freshErr } = await supabase
        .from("token_balances")
        .select("balance")
        .eq("user_id", target.user_id)
        .maybeSingle();

      if (freshErr) throw freshErr;
      const currentBalance = fresh?.balance ?? 0;

      if (currentBalance !== expectedBalance) {
        toast.error(
          `Saldo mudou desde o último refresh (era ${expectedBalance.toLocaleString("pt-BR")}, agora é ${currentBalance.toLocaleString("pt-BR")}). Atualize e tente novamente.`
        );
        await fetchBalance(true);
        return;
      }

      if (!confirm(`Confirmar crédito de ${ADJUSTMENT_AMOUNT.toLocaleString("pt-BR")} tokens para ${target.display_name ?? "admin master"}?\n\nSaldo atual: ${currentBalance.toLocaleString("pt-BR")}`)) {
        return;
      }

      setBalanceBefore(currentBalance);
      setBalanceAfter(null);

      const { error } = await supabase.rpc("add_tokens", {
        p_user_id: target.user_id,
        p_amount: ADJUSTMENT_AMOUNT,
        p_type: "bonus",
        p_description: "Crédito manual admin master (página /admin/master)",
        p_reference_id: null,
      });
      if (error) throw error;
      const updated = await fetchBalance(true);
      if (updated) {
        setBalanceAfter(updated.balance);
        setLastAdjustmentAt(new Date().toISOString());
        toast.success(`+${ADJUSTMENT_AMOUNT.toLocaleString("pt-BR")} tokens creditados.`);
      }
    } catch (e: unknown) {
      toast.error("Falha no ajuste: " + (e instanceof Error ? e.message : "desconhecido"));
    } finally {
      setApplying(false);
    }
  }

  const fmt = (n: number) => n.toLocaleString("pt-BR");
  const delta = balanceBefore !== null && balanceAfter !== null ? balanceAfter - balanceBefore : null;

  return (
    <div style={{
      minHeight: "100vh", background: "var(--bg)", color: "var(--text1)",
      fontFamily: "'DM Sans', sans-serif", padding: 20,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <button onClick={() => navigate("/admin")} style={{
          padding: "8px 16px", borderRadius: 8, border: "1px solid var(--border)",
          background: "var(--bg2)", color: "var(--text2)", cursor: "pointer", fontSize: 13,
        }}>← Voltar</button>
        <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 600, color: "#c9a84c", margin: 0 }}>
           Admin Master · Ajuste de Saldo
        </h1>
        <div style={{ flex: 1 }} />
        <button onClick={() => fetchBalance()} disabled={loading} style={{
          padding: "8px 16px", borderRadius: 8, border: "1px solid var(--border)",
          background: "var(--bg2)", color: "var(--text1)", cursor: loading ? "wait" : "pointer", fontSize: 13,
        }}>{loading ? "Atualizando..." : "↻ Atualizar saldo"}</button>
      </div>

      <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 16 }}>
        Confirme o saldo atual antes de aplicar o crédito de {fmt(ADJUSTMENT_AMOUNT)} tokens. O saldo após o ajuste será exibido em destaque.
      </div>

      {loading ? (
        <HexagonLoader variant="inline" label="Carregando saldo do admin master..." />
      ) : !target ? (
        <div style={{ color: "var(--text3)" }}>Nenhum admin master encontrado.</div>
      ) : (
        <div style={{ display: "grid", gap: 16, maxWidth: 720 }}>
          <div style={{
            background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 12, padding: 20,
          }}>
            <div style={{ fontSize: 11, color: "var(--text3)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
              Admin master
            </div>
            <div style={{ fontSize: 18, fontWeight: 600, color: "var(--text1)" }}>
              {target.display_name ?? "Sem nome"}
            </div>
            <div style={{ fontSize: 11, color: "var(--text3)", fontFamily: "monospace", marginTop: 4 }}>
              {target.user_id}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
            <Card title="Saldo atual" value={fmt(target.balance)} accent="#c9a84c" />
            <Card title="Total comprado" value={fmt(target.total_purchased)} />
            <Card title="Total consumido" value={fmt(target.total_consumed)} />
          </div>

          <div style={{
            background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 12, padding: 20,
          }}>
            <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 12 }}>
              Aplicar crédito de <strong style={{ color: "#c9a84c" }}>+{fmt(ADJUSTMENT_AMOUNT)}</strong> tokens (bonus)
            </div>
            <button onClick={handleApplyAdjustment} disabled={applying} style={{
              padding: "10px 20px", borderRadius: 8, border: "1px solid #c9a84c",
              background: applying ? "rgba(201,168,76,0.08)" : "rgba(201,168,76,0.18)",
              color: "#c9a84c", cursor: applying ? "wait" : "pointer", fontSize: 13, fontWeight: 600,
            }}>{applying ? "Aplicando..." : `Creditar +${fmt(ADJUSTMENT_AMOUNT)}`}</button>

            {(balanceBefore !== null || balanceAfter !== null) && (
              <div style={{ marginTop: 16, padding: 14, background: "var(--bg3)", borderRadius: 8, border: "1px solid var(--border)" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, fontSize: 12 }}>
                  <div>
                    <div style={{ color: "var(--text3)", marginBottom: 4 }}>Antes</div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text1)" }}>
                      {balanceBefore !== null ? fmt(balanceBefore) : "—"}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: "var(--text3)", marginBottom: 4 }}>Delta</div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: delta && delta > 0 ? "#4ade80" : "var(--text1)" }}>
                      {delta !== null ? `${delta > 0 ? "+" : ""}${fmt(delta)}` : "—"}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: "var(--text3)", marginBottom: 4 }}>Depois</div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: "#c9a84c" }}>
                      {balanceAfter !== null ? fmt(balanceAfter) : "—"}
                    </div>
                  </div>
                </div>
                {lastAdjustmentAt && (
                  <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 10 }}>
                    Aplicado em {new Date(lastAdjustmentAt).toLocaleString("pt-BR")}
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{
            background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 12, padding: 20,
          }}>
            <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 10, fontWeight: 600 }}>
              Últimas 5 transações
            </div>
            {recentTx.length === 0 ? (
              <div style={{ color: "var(--text3)", fontSize: 12 }}>Nenhuma transação.</div>
            ) : (
              <div style={{ display: "grid", gap: 6 }}>
                {recentTx.map(t => (
                  <div key={t.id} style={{
                    display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center",
                    padding: "8px 10px", background: "var(--bg3)", borderRadius: 6, fontSize: 12,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: "var(--text1)", fontWeight: 500 }}>
                        {t.description ?? t.transaction_type}
                      </div>
                      <div style={{ color: "var(--text3)", fontSize: 10 }}>
                        {new Date(t.created_at).toLocaleString("pt-BR")} · {t.transaction_type}
                      </div>
                    </div>
                    <div style={{
                      fontWeight: 600,
                      color: t.amount >= 0 ? "#4ade80" : "#f87171",
                      whiteSpace: "nowrap",
                    }}>
                      {t.amount >= 0 ? "+" : ""}{fmt(t.amount)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Card({ title, value, accent }: { title: string; value: string; accent?: string }) {
  return (
    <div style={{
      background: "var(--bg2)", border: `1px solid ${accent ?? "var(--border)"}`, borderRadius: 12, padding: 16,
    }}>
      <div style={{ fontSize: 11, color: "var(--text3)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
        {title}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: accent ?? "var(--text1)" }}>
        {value}
      </div>
    </div>
  );
}
