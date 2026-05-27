import { useState, lazy, Suspense } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Crown, Briefcase, ClipboardList, Scale, Building2, BookOpen,
  CreditCard, Megaphone, FileText, Hash, ShieldCheck, ArrowLeft
} from "lucide-react";
import { HexagonLoader } from "@/components/HexagonLoader";

const AgentScene3D = lazy(() => import("@/components/AgentScene3D"));

const ROLES = [
  { value: "admin", label: "Administrador", icon: Crown },
  { value: "director", label: "Diretor", icon: Briefcase },
  { value: "manager", label: "Gerente", icon: ClipboardList },
  { value: "lawyer", label: "Advogado", icon: Scale },
  { value: "receptionist", label: "Recepcionista", icon: Building2 },
  { value: "intern", label: "Estagiário", icon: BookOpen },
  { value: "financial", label: "Financeiro", icon: CreditCard },
  { value: "marketing", label: "Marketing", icon: Megaphone },
  { value: "protocol", label: "Protocolo", icon: FileText },
  { value: "calculator", label: "Calculista", icon: Hash },
  { value: "compliance", label: "Compliance", icon: ShieldCheck },
];

export default function Auth() {
  const { user, loading, signUp, signIn } = useAuth();
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [selectedRole, setSelectedRole] = useState("lawyer");
  const [submitting, setSubmitting] = useState(false);

  if (loading) return <HexagonLoader variant="fullscreen" />;
  if (user) return <Navigate to="/sistema" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (mode === "login") {
        const { error } = await signIn(email, password);
        if (error) { toast.error(error.message); return; }
        toast.success("Login realizado com sucesso!");
      } else if (mode === "signup") {
        const { error } = await signUp(email, password, displayName);
        if (error) { toast.error(error.message); return; }
        toast.success("Conta criada! Verifique seu email para confirmar.");
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) { toast.error(error.message); return; }
        toast.success("Email de recuperação enviado! Verifique sua caixa de entrada.");
        setMode("login");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const inputCss: React.CSSProperties = {
    width: "100%", padding: "10px 14px", borderRadius: 8,
    background: "rgba(22,22,31,0.8)", border: "1px solid rgba(37,37,52,0.8)", color: "#eeeef5",
    fontSize: 14, fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box",
    backdropFilter: "blur(8px)",
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "#09090f", fontFamily: "'DM Sans', sans-serif",
      position: "relative", overflow: "hidden",
    }}>
      <Suspense fallback={null}>
        <AgentScene3D />
      </Suspense>

      <div style={{
        position: "absolute", inset: 0, zIndex: 1,
        background: "radial-gradient(ellipse at center, transparent 30%, #09090f 75%)",
        pointerEvents: "none",
      }} />

      <div style={{
        position: "relative", zIndex: 10,
        width: "100%", maxWidth: 420, padding: 32, borderRadius: 20,
        background: "rgba(17,17,24,0.85)", border: "1px solid rgba(201,168,76,0.15)",
        boxShadow: "0 30px 80px rgba(0,0,0,0.6), 0 0 60px rgba(201,168,76,0.08)",
        backdropFilter: "blur(20px)",
      }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14, margin: "0 auto 12px",
            background: "linear-gradient(135deg, #c9a84c, #e8c96a)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 26, fontWeight: 700, color: "#0a0a12",
            fontFamily: "'Cormorant Garamond', serif",
            boxShadow: "0 0 32px rgba(201,168,76,0.4), 0 0 8px rgba(201,168,76,0.6)",
          }}>L</div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 600, color: "#eeeef5" }}>
            JurisAI
          </div>
          <div style={{ fontSize: 10, color: "#5a5a72", letterSpacing: "0.14em", textTransform: "uppercase", marginTop: 4 }}>
            Orquestração Inteligente Jurídica
          </div>
        </div>

        {mode !== "forgot" && (
          <div style={{ display: "flex", marginBottom: 24, borderRadius: 10, overflow: "hidden", border: "1px solid rgba(37,37,52,0.6)" }}>
            {(["login", "signup"] as const).map(m => (
              <button key={m} onClick={() => setMode(m)} style={{
                flex: 1, padding: "10px 0", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 500,
                background: mode === m ? "rgba(201,168,76,0.1)" : "rgba(22,22,31,0.6)",
                color: mode === m ? "#c9a84c" : "#5a5a72",
                borderBottom: mode === m ? "2px solid #c9a84c" : "2px solid transparent",
                fontFamily: "'DM Sans', sans-serif", transition: "all 0.2s",
              }}>{m === "login" ? "Entrar" : "Criar Conta"}</button>
            ))}
          </div>
        )}

        {mode === "forgot" && (
          <div style={{ marginBottom: 20 }}>
            <button onClick={() => setMode("login")} style={{
              background: "none", border: "none", color: "#5a5a72", cursor: "pointer",
              fontSize: 12, fontFamily: "'DM Sans', sans-serif", padding: 0,
              display: "flex", alignItems: "center", gap: 4,
            }}>
              <ArrowLeft size={12} /> Voltar ao login
            </button>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#eeeef5", marginTop: 12 }}>
              Recuperar senha
            </div>
            <div style={{ fontSize: 12, color: "#5a5a72", marginTop: 4 }}>
              Enviaremos um link de recuperação para seu email.
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {mode === "signup" && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 11, color: "#9898b0", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Nome completo</label>
              <input type="text" required value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Dr. João Silva" style={inputCss} />
            </div>
          )}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 11, color: "#9898b0", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Email</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="usuario@escritorio.com" style={inputCss} />
          </div>

          {mode !== "forgot" && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 11, color: "#9898b0", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Senha</label>
              <input type="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" minLength={6} style={inputCss} />
            </div>
          )}

          {mode === "signup" && (
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: 11, color: "#9898b0", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>Função no escritório</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {ROLES.map(role => {
                  const IconComp = role.icon;
                  return (
                    <button key={role.value} type="button" onClick={() => setSelectedRole(role.value)} style={{
                      padding: "8px 10px", borderRadius: 8, cursor: "pointer",
                      border: selectedRole === role.value ? "1px solid #c9a84c" : "1px solid rgba(37,37,52,0.6)",
                      background: selectedRole === role.value ? "rgba(201,168,76,0.1)" : "rgba(22,22,31,0.6)",
                      color: selectedRole === role.value ? "#c9a84c" : "#9898b0",
                      fontSize: 11, fontFamily: "'DM Sans', sans-serif",
                      display: "flex", alignItems: "center", gap: 6, transition: "all 0.2s",
                      backdropFilter: "blur(4px)",
                    }}>
                      <IconComp size={14} />
                      <span>{role.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <button type="submit" disabled={submitting} style={{
            width: "100%", padding: "12px 0", borderRadius: 10, border: "none", cursor: "pointer",
            background: "linear-gradient(135deg, #c9a84c, #e8c96a)",
            color: "#0a0a12", fontSize: 14, fontWeight: 600,
            fontFamily: "'DM Sans', sans-serif",
            opacity: submitting ? 0.7 : 1,
            boxShadow: "0 4px 24px rgba(201,168,76,0.35)",
            transition: "all 0.3s",
          }}>
            {submitting ? "Aguarde..." : mode === "login" ? "Entrar no Sistema" : mode === "signup" ? "Criar Conta" : "Enviar Link de Recuperação"}
          </button>
        </form>

        {mode === "login" && (
          <div style={{ textAlign: "center", marginTop: 16 }}>
            <button onClick={() => setMode("forgot")} style={{
              background: "none", border: "none", color: "#5a5a72", cursor: "pointer",
              fontSize: 12, fontFamily: "'DM Sans', sans-serif",
              transition: "color 0.2s",
            }}
              onMouseEnter={e => (e.currentTarget.style.color = "#c9a84c")}
              onMouseLeave={e => (e.currentTarget.style.color = "#5a5a72")}
            >
              Esqueceu sua senha?
            </button>
          </div>
        )}

        <div style={{
          marginTop: 20, height: 2, borderRadius: 1, overflow: "hidden",
          background: "rgba(37,37,52,0.4)",
        }}>
          <div style={{
            height: "100%", width: "30%", borderRadius: 1,
            background: "linear-gradient(90deg, transparent, #c9a84c, transparent)",
            animation: "shimmer 2s ease-in-out infinite",
          }} />
        </div>
        <style>{`@keyframes shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(400%); } }`}</style>
      </div>
    </div>
  );
}
