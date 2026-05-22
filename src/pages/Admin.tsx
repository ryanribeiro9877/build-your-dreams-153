import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

const ROLES = [
  { value: "admin", label: "Administrador", icon: "" },
  { value: "director", label: "Diretor", icon: "" },
  { value: "manager", label: "Gerente", icon: "" },
  { value: "lawyer", label: "Advogado", icon: "️" },
  { value: "receptionist", label: "Recepcionista", icon: "" },
  { value: "intern", label: "Estagiário", icon: "" },
  { value: "financial", label: "Financeiro", icon: "" },
  { value: "marketing", label: "Marketing", icon: "" },
  { value: "protocol", label: "Protocolo", icon: "" },
  { value: "calculator", label: "Calculista", icon: "" },
  { value: "compliance", label: "Compliance", icon: "️" },
];

interface UserWithRoles {
  user_id: string;
  display_name: string | null;
  job_title: string | null;
  roles: string[];
}

export default function Admin() {
  const { user, hasRole } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserWithRoles[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchUsers(); }, []);

  async function fetchUsers() {
    setLoading(true);
    // Get all profiles
    const { data: profiles } = await supabase.from("profiles").select("user_id, display_name, job_title");
    const { data: roles } = await supabase.from("user_roles").select("user_id, role");

    const userMap = new Map<string, UserWithRoles>();
    profiles?.forEach(p => {
      userMap.set(p.user_id, { user_id: p.user_id, display_name: p.display_name, job_title: p.job_title, roles: [] });
    });
    roles?.forEach(r => {
      const u = userMap.get(r.user_id);
      if (u) u.roles.push(r.role);
    });
    setUsers(Array.from(userMap.values()));
    setLoading(false);
  }

  async function toggleRole(userId: string, role: string, hasIt: boolean) {
    if (hasIt) {
      const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role);
      if (error) { toast.error("Erro: " + error.message); return; }
    } else {
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
      if (error) { toast.error("Erro: " + error.message); return; }
    }
    toast.success(`Papel ${hasIt ? "removido" : "atribuído"}!`);
    fetchUsers();
  }

  return (
    <div style={{
      minHeight: "100vh", background: "var(--bg)", color: "var(--text1)",
      fontFamily: "'DM Sans', sans-serif", padding: 20,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <button onClick={() => navigate("/sistema")} style={{
          padding: "8px 16px", borderRadius: 8, border: "1px solid var(--border)",
          background: "var(--bg2)", color: "var(--text2)", cursor: "pointer", fontSize: 13,
          fontFamily: "'DM Sans', sans-serif",
        }}>← Voltar</button>
        <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 600, color: "#c9a84c", margin: 0 }}>
           Painel de Administração
        </h1>
        <div style={{ flex: 1 }} />
        <button onClick={() => navigate("/admin/notificacoes")} style={{
          padding: "8px 16px", borderRadius: 8, border: "1px solid var(--border)",
          background: "var(--bg2)", color: "var(--text2)", cursor: "pointer", fontSize: 13,
          fontFamily: "'DM Sans', sans-serif",
        }}> Histórico de avisos</button>
        <button onClick={() => navigate("/admin/tokens")} style={{
          padding: "8px 16px", borderRadius: 8, border: "1px solid #c9a84c",
          background: "rgba(201,168,76,0.15)", color: "#c9a84c", cursor: "pointer", fontSize: 13,
          fontFamily: "'DM Sans', sans-serif", fontWeight: 600,
        }}> Dashboard de Tokens</button>
      </div>

      <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 16 }}>
        Gerencie os papéis dos usuários do sistema. Cada papel determina as permissões de acesso.
      </div>

      {loading ? <div style={{ color: "var(--text3)" }}>Carregando...</div> : (
        <div style={{ display: "grid", gap: 12 }}>
          {users.map(u => (
            <div key={u.user_id} style={{
              background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 12,
              padding: 16,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: "linear-gradient(135deg, #c9a84c, #e8c96a)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 18, color: "#0a0a12", fontWeight: 700,
                }}>
                  {(u.display_name || "?")[0].toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text1)" }}>{u.display_name || "Sem nome"}</div>
                  <div style={{ fontSize: 11, color: "var(--text3)" }}>
                    {u.user_id === user?.id ? " Você" : ""} {u.job_title || ""}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {ROLES.map(role => {
                  const hasIt = u.roles.includes(role.value);
                  return (
                    <button
                      key={role.value}
                      onClick={() => toggleRole(u.user_id, role.value, hasIt)}
                      style={{
                        padding: "5px 10px", borderRadius: 6, cursor: "pointer",
                        border: hasIt ? "1px solid #c9a84c" : "1px solid var(--border)",
                        background: hasIt ? "rgba(201,168,76,0.15)" : "var(--bg3)",
                        color: hasIt ? "#c9a84c" : "var(--text3)",
                        fontSize: 10, fontFamily: "'DM Sans', sans-serif",
                        display: "flex", alignItems: "center", gap: 4,
                        transition: "all 0.2s",
                      }}
                    >
                      <span>{role.icon}</span>
                      <span>{role.label}</span>
                      {hasIt && <span style={{ marginLeft: 2 }}></span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
