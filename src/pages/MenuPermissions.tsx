import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";
import { HexagonLoader } from "@/components/HexagonLoader";
import { RestrictedAccess, formatDateBR } from "@/components/clients/shared";
import { usePermissions } from "@/hooks/usePermissions";
import { MENU_KEYS, MENU_KEY_LABELS, DATA_GATE_READY, type MenuKey } from "@/hooks/useMenuAccess";

interface AssignableUser { user_id: string; name: string; role_label: string; }
interface MenuPermRow {
  user_id: string; email: string; menu_key: string; granted: boolean;
  updated_at: string; granted_by: string | null; granted_by_name: string | null;
}

// Estado tri: undefined = padrão do papel; true = concedido; false = revogado.
type TriState = boolean | undefined;

const supaRpc = supabase.rpc as unknown as (
  fn: string, args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string } | null }>;

function cellStyle(s: TriState): React.CSSProperties {
  const base: React.CSSProperties = {
    minWidth: 92, padding: "6px 8px", borderRadius: 8, fontSize: 12, fontWeight: 600,
    cursor: "pointer", border: "1px solid transparent", textAlign: "center", whiteSpace: "nowrap",
  };
  if (s === true) return { ...base, background: "rgba(34,197,94,.15)", color: "#16a34a", borderColor: "rgba(34,197,94,.4)" };
  if (s === false) return { ...base, background: "rgba(239,68,68,.15)", color: "#dc2626", borderColor: "rgba(239,68,68,.4)" };
  return { ...base, background: "rgba(148,163,184,.12)", color: "#64748b", borderColor: "rgba(148,163,184,.3)" };
}

export default function MenuPermissions() {
  const { isAdmin } = usePermissions();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);

  const usersQ = useSupabaseQuery<AssignableUser[]>({
    queryKey: "menu-perms-users",
    fetcher: async () => {
      const { data, error } = await supabase.rpc("list_assignable_users");
      if (error) throw error;
      return (data as unknown as AssignableUser[]) ?? [];
    },
  });
  const permsQ = useSupabaseQuery<MenuPermRow[]>({
    queryKey: "menu-perms-list",
    fetcher: async () => {
      const { data, error } = await supaRpc("admin_list_menu_permissions");
      if (error) throw error;
      return (data as MenuPermRow[]) ?? [];
    },
    realtime: [{ table: "user_menu_permissions" }],
  });

  if (!isAdmin) return <RestrictedAccess />;
  if (usersQ.loading || permsQ.loading) return <HexagonLoader variant="fullscreen" />;

  const users = usersQ.data ?? [];
  const perms = permsQ.data ?? [];
  const byCell = new Map<string, MenuPermRow>();
  for (const p of perms) byCell.set(`${p.user_id}|${p.menu_key}`, p);

  const stateOf = (userId: string, key: MenuKey): TriState => {
    const r = byCell.get(`${userId}|${key}`);
    return r ? r.granted : undefined;
  };
  const meta = (userId: string, key: MenuKey): string => {
    const r = byCell.get(`${userId}|${key}`);
    if (!r) return "Segue o padrão do papel. Clique para conceder.";
    const quem = r.granted_by_name ? ` por ${r.granted_by_name}` : "";
    const quando = r.updated_at ? ` em ${formatDateBR(r.updated_at)}` : "";
    return `${r.granted ? "Concedido" : "Revogado"}${quem}${quando}. Clique para alternar.`;
  };

  async function cycle(userId: string, key: MenuKey, cur: TriState) {
    const cellId = `${userId}|${key}`;
    setBusy(cellId);
    try {
      // padrão → concedido → revogado → padrão
      let res;
      if (cur === undefined) res = await supaRpc("admin_set_user_menu", { p_user_id: userId, p_menu_key: key, p_granted: true });
      else if (cur === true) res = await supaRpc("admin_set_user_menu", { p_user_id: userId, p_menu_key: key, p_granted: false });
      else res = await supaRpc("admin_clear_user_menu", { p_user_id: userId, p_menu_key: key });
      if (res.error) { toast.error(res.error.message ?? "Não foi possível alterar a permissão"); return; }
      permsQ.refetch();
    } finally {
      setBusy(null);
    }
  }

  const labelOf = (s: TriState) => (s === undefined ? "padrão" : s ? "concedido" : "revogado");

  return (
    <div style={{ padding: 24, maxWidth: "100%", overflowX: "auto" }}>
      <button className="cli-back" onClick={() => navigate("/sistema")} style={{ marginBottom: 16 }}>← Voltar</button>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Permissões de menu</h1>
      <p style={{ color: "#64748b", fontSize: 13, marginBottom: 16 }}>
        Cada célula alterna entre <b>padrão do papel</b> → <b>concedido</b> → <b>revogado</b>. O admin vê todos os menus e não aparece na matriz.
        Menus com <span title="acesso a dados pode exigir liberação adicional" style={{ color: "#b45309" }}>⚠</span> mostram a tela, mas o acesso aos <b>dados</b> pode exigir liberação adicional no banco.
      </p>

      <table style={{ borderCollapse: "separate", borderSpacing: 4, fontSize: 13 }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: "6px 10px", position: "sticky", left: 0, background: "var(--background, #fff)" }}>Usuário</th>
            {MENU_KEYS.map((k) => (
              <th key={k} style={{ padding: "6px 8px", fontWeight: 600, fontSize: 12 }}>
                {MENU_KEY_LABELS[k]}
                {!DATA_GATE_READY.has(k) && (
                  <span title="acesso a dados pode exigir liberação adicional" style={{ color: "#b45309", marginLeft: 4 }}>⚠</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.user_id}>
              <td style={{ padding: "6px 10px", position: "sticky", left: 0, background: "var(--background, #fff)", whiteSpace: "nowrap" }}>
                <div style={{ fontWeight: 600 }}>{u.name}</div>
                <div style={{ color: "#94a3b8", fontSize: 11 }}>{u.role_label}</div>
              </td>
              {MENU_KEYS.map((k) => {
                const s = stateOf(u.user_id, k);
                const cellId = `${u.user_id}|${k}`;
                return (
                  <td key={k} style={{ textAlign: "center" }}>
                    <button
                      type="button"
                      disabled={busy === cellId}
                      title={meta(u.user_id, k)}
                      onClick={() => cycle(u.user_id, k, s)}
                      style={{ ...cellStyle(s), opacity: busy === cellId ? 0.5 : 1 }}
                    >
                      {busy === cellId ? "…" : labelOf(s)}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
          {users.length === 0 && (
            <tr><td colSpan={MENU_KEYS.length + 1} style={{ padding: 16, color: "#94a3b8" }}>Nenhum usuário para gerenciar.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
