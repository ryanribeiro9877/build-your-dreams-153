import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";

const ROLES = [
  { value: "admin", label: "Administrador", icon: "👑" },
  { value: "director", label: "Diretor", icon: "👔" },
  { value: "manager", label: "Gerente", icon: "📋" },
  { value: "lawyer", label: "Advogado", icon: "⚖️" },
  { value: "receptionist", label: "Recepcionista", icon: "🏢" },
  { value: "intern", label: "Estagiário", icon: "📚" },
  { value: "financial", label: "Financeiro", icon: "💳" },
  { value: "marketing", label: "Marketing", icon: "📢" },
  { value: "protocol", label: "Protocolo", icon: "📋" },
  { value: "calculator", label: "Calculista", icon: "🔢" },
  { value: "compliance", label: "Compliance", icon: "🛡️" },
];

export default function Auth() {
  const { user, loading, signUp, signIn } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [selectedRole, setSelectedRole] = useState("lawyer");
  const [submitting, setSubmitting] = useState(false);

  if (loading) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#09090f", color: "#c9a84c", fontFamily: "DM Sans, sans-serif" }}>Carregando...</div>;
  if (user) return <Navigate to="/" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (isLogin) {
        const { error } = await signIn(email, password);
        if (error) { toast.error(error.message); return; }
        toast.success("Login realizado com sucesso!");
      } else {
        const { error } = await signUp(email, password, displayName);
        if (error) { toast.error(error.message); return; }
        toast.success("Conta criada! Você já pode usar o sistema.");
        // Note: role assignment will be done by admin after signup
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "linear-gradient(135deg, #09090f 0%, #111118 50%, #09090f 100%)",
      fontFamily: "'DM Sans', sans-serif",
    }}>
      <div style={{
        width: "100%", maxWidth: 420, padding: 32, borderRadius: 16,
        background: "#111118", border: "1px solid #252534",
        boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
      }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12, margin: "0 auto 12px",
            background: "linear-gradient(135deg, #c9a84c, #e8c96a)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 24, fontWeight: 700, color: "#0a0a12",
            fontFamily: "'Cormorant Garamond', serif",
            boxShadow: "0 0 24px rgba(201,168,76,0.35)",
          }}>A</div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 600, color: "#eeeef5" }}>Agent Jus IA</div>
          <div style={{ fontSize: 10, color: "#5a5a72", letterSpacing: "0.12em", textTransform: "uppercase", marginTop: 4 }}>Sistema Operacional Jurídico</div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", marginBottom: 24, borderRadius: 8, overflow: "hidden", border: "1px solid #252534" }}>
          <button onClick={() => setIsLogin(true)} style={{
            flex: 1, padding: "10px 0", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 500,
            background: isLogin ? "rgba(201,168,76,0.1)" : "#16161f",
            color: isLogin ? "#c9a84c" : "#5a5a72",
            borderBottom: isLogin ? "2px solid #c9a84c" : "2px solid transparent",
            fontFamily: "'DM Sans', sans-serif",
          }}>Entrar</button>
          <button onClick={() => setIsLogin(false)} style={{
            flex: 1, padding: "10px 0", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 500,
            background: !isLogin ? "rgba(201,168,76,0.1)" : "#16161f",
            color: !isLogin ? "#c9a84c" : "#5a5a72",
            borderBottom: !isLogin ? "2px solid #c9a84c" : "2px solid transparent",
            fontFamily: "'DM Sans', sans-serif",
          }}>Criar Conta</button>
        </div>

        <form onSubmit={handleSubmit}>
          {!isLogin && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 11, color: "#9898b0", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Nome completo</label>
              <input
                type="text" required value={displayName} onChange={e => setDisplayName(e.target.value)}
                placeholder="Dr. João Silva"
                style={{
                  width: "100%", padding: "10px 14px", borderRadius: 8,
                  background: "#16161f", border: "1px solid #252534", color: "#eeeef5",
                  fontSize: 14, fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box",
                }}
              />
            </div>
          )}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 11, color: "#9898b0", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Email</label>
            <input
              type="email" required value={email} onChange={e => setEmail(e.target.value)}
              placeholder="usuario@escritorio.com"
              style={{
                width: "100%", padding: "10px 14px", borderRadius: 8,
                background: "#16161f", border: "1px solid #252534", color: "#eeeef5",
                fontSize: 14, fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box",
              }}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 11, color: "#9898b0", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Senha</label>
            <input
              type="password" required value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              minLength={6}
              style={{
                width: "100%", padding: "10px 14px", borderRadius: 8,
                background: "#16161f", border: "1px solid #252534", color: "#eeeef5",
                fontSize: 14, fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box",
              }}
            />
          </div>

          {!isLogin && (
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: 11, color: "#9898b0", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>Função no escritório</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {ROLES.map(role => (
                  <button
                    key={role.value} type="button"
                    onClick={() => setSelectedRole(role.value)}
                    style={{
                      padding: "8px 10px", borderRadius: 8, cursor: "pointer",
                      border: selectedRole === role.value ? "1px solid #c9a84c" : "1px solid #252534",
                      background: selectedRole === role.value ? "rgba(201,168,76,0.1)" : "#16161f",
                      color: selectedRole === role.value ? "#c9a84c" : "#9898b0",
                      fontSize: 11, fontFamily: "'DM Sans', sans-serif",
                      display: "flex", alignItems: "center", gap: 6,
                      transition: "all 0.2s",
                    }}
                  >
                    <span>{role.icon}</span>
                    <span>{role.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            type="submit" disabled={submitting}
            style={{
              width: "100%", padding: "12px 0", borderRadius: 8, border: "none", cursor: "pointer",
              background: "linear-gradient(135deg, #c9a84c, #e8c96a)",
              color: "#0a0a12", fontSize: 14, fontWeight: 600,
              fontFamily: "'DM Sans', sans-serif",
              opacity: submitting ? 0.7 : 1,
              boxShadow: "0 4px 20px rgba(201,168,76,0.3)",
              transition: "opacity 0.2s",
            }}
          >
            {submitting ? "Aguarde..." : isLogin ? "Entrar no Sistema" : "Criar Conta"}
          </button>
        </form>

        {/* Test accounts info */}
        <div style={{ marginTop: 20, padding: 12, borderRadius: 8, background: "#16161f", border: "1px solid #252534" }}>
          <div style={{ fontSize: 10, color: "#c9a84c", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }}>
            🧪 Contas para teste
          </div>
          <div style={{ fontSize: 10, color: "#5a5a72", lineHeight: 1.6 }}>
            Crie contas com diferentes funções para testar as permissões do sistema. 
            O admin pode atribuir papéis via painel de administração.
          </div>
        </div>
      </div>
    </div>
  );
}
