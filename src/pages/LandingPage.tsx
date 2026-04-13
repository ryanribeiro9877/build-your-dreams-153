import { lazy, Suspense, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const AgentScene3D = lazy(() => import("@/components/AgentScene3D"));

const FEATURES = [
  { icon: "🤖", title: "Agentes IA Dedicados", desc: "Cada membro da sua equipe conta com agentes especializados que automatizam tarefas repetitivas e otimizam a rotina do escritório." },
  { icon: "📊", title: "Triplicar Resultados", desc: "Combine inteligência humana com IA para multiplicar a produtividade. Tarefas que levavam horas são concluídas em minutos." },
  { icon: "⚖️", title: "Monitoramento de Processos", desc: "Nunca perca um prazo. Nossos agentes monitoram cada processo 24/7 e alertam automaticamente sobre audiências e vencimentos." },
  { icon: "👥", title: "Acompanhamento ao Cliente", desc: "Garanta comunicação constante e transparente. O cliente acompanha cada etapa do processo em tempo real." },
  { icon: "🔒", title: "Segurança e Compliance", desc: "Dados protegidos com criptografia de ponta. Controle de acesso granular por papel, departamento e função." },
  { icon: "⚡", title: "Orquestração Inteligente", desc: "Sistema hierárquico de agentes — do CEO aos executores — garantindo que cada tarefa seja delegada e concluída com excelência." },
];

const STATS = [
  { value: "91+", label: "Agentes IA Ativos" },
  { value: "13", label: "Departamentos" },
  { value: "3x", label: "Mais Produtividade" },
  { value: "24/7", label: "Monitoramento" },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#09090f", color: "#f0ead6", fontFamily: "'Inter', sans-serif", overflowX: "hidden" }}>
      {/* Navbar */}
      <nav style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 50,
        background: scrollY > 50 ? "rgba(9,9,15,0.95)" : "transparent",
        backdropFilter: scrollY > 50 ? "blur(20px)" : "none",
        borderBottom: scrollY > 50 ? "1px solid rgba(201,168,76,0.15)" : "none",
        transition: "all 0.3s", padding: "16px 40px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 28, fontWeight: 800, color: "#c9a84c" }}>⚖️ Agent Jus IA</span>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <button
            onClick={() => navigate("/auth")}
            style={{
              background: "transparent", border: "1px solid rgba(201,168,76,0.3)",
              color: "#c9a84c", borderRadius: 8, padding: "10px 24px",
              cursor: "pointer", fontSize: 14, fontWeight: 600,
            }}
          >
            Entrar
          </button>
          <button
            onClick={() => navigate("/auth")}
            style={{
              background: "linear-gradient(135deg, #c9a84c, #a8872e)",
              border: "none", color: "#09090f", borderRadius: 8,
              padding: "10px 24px", cursor: "pointer",
              fontSize: 14, fontWeight: 700,
            }}
          >
            Começar Agora
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ position: "relative", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        {/* 3D Background */}
        <div style={{ position: "absolute", inset: 0, opacity: 0.5 }}>
          <Suspense fallback={null}>
            <AgentScene3D />
          </Suspense>
        </div>

        {/* Gradient overlays */}
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at center, transparent 30%, #09090f 80%)" }} />
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 200, background: "linear-gradient(to top, #09090f, transparent)" }} />

        <div style={{ position: "relative", zIndex: 10, textAlign: "center", maxWidth: 800, padding: "0 24px" }}>
          <div style={{
            display: "inline-block", marginBottom: 20, padding: "6px 20px",
            borderRadius: 50, fontSize: 13, fontWeight: 600,
            background: "rgba(201,168,76,0.1)", border: "1px solid rgba(201,168,76,0.25)", color: "#c9a84c",
          }}>
            🚀 Humano + IA = Resultados Extraordinários
          </div>

          <h1 style={{ fontSize: "clamp(36px, 6vw, 64px)", fontWeight: 800, lineHeight: 1.1, margin: "0 0 20px" }}>
            <span style={{ color: "#f0ead6" }}>Revolucione a</span><br />
            <span style={{ background: "linear-gradient(135deg, #c9a84c, #e8d48b, #c9a84c)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              Gestão Jurídica
            </span><br />
            <span style={{ color: "#f0ead6" }}>com Inteligência Artificial</span>
          </h1>

          <p style={{ fontSize: 18, color: "#94a3b8", maxWidth: 600, margin: "0 auto 32px", lineHeight: 1.7 }}>
            Juntos, humano e IA triplicam resultados, monitoram processos 24/7, eliminam prazos perdidos e garantem total transparência para seus clientes.
          </p>

          <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
            <button
              onClick={() => navigate("/auth")}
              style={{
                background: "linear-gradient(135deg, #c9a84c, #b8942e)",
                color: "#09090f", border: "none", borderRadius: 12,
                padding: "16px 40px", fontSize: 16, fontWeight: 700,
                cursor: "pointer", boxShadow: "0 8px 30px rgba(201,168,76,0.3)",
              }}
            >
              🚀 Experimentar Gratuitamente
            </button>
            <button
              onClick={() => {
                document.getElementById("features")?.scrollIntoView({ behavior: "smooth" });
              }}
              style={{
                background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.15)",
                color: "#f0ead6", borderRadius: 12, padding: "16px 32px",
                fontSize: 16, fontWeight: 600, cursor: "pointer",
              }}
            >
              Conhecer Mais ↓
            </button>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section style={{ padding: "60px 24px", background: "rgba(201,168,76,0.03)", borderTop: "1px solid rgba(201,168,76,0.1)", borderBottom: "1px solid rgba(201,168,76,0.1)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 24, maxWidth: 900, margin: "0 auto" }}>
          {STATS.map((s) => (
            <div key={s.label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 42, fontWeight: 800, color: "#c9a84c" }}>{s.value}</div>
              <div style={{ fontSize: 14, color: "#94a3b8", marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" style={{ padding: "100px 24px", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 60 }}>
          <h2 style={{ fontSize: 36, fontWeight: 800, color: "#c9a84c", margin: 0 }}>
            O Poder da Parceria Humano + IA
          </h2>
          <p style={{ color: "#94a3b8", fontSize: 16, marginTop: 12, maxWidth: 600, margin: "12px auto 0" }}>
            Cada profissional do seu escritório trabalha lado a lado com agentes de IA especializados.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 24 }}>
          {FEATURES.map((f) => (
            <div key={f.title} style={{
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(201,168,76,0.12)",
              borderRadius: 16, padding: 28,
              transition: "all 0.3s",
            }}
            onMouseOver={(e) => { e.currentTarget.style.borderColor = "rgba(201,168,76,0.35)"; e.currentTarget.style.background = "rgba(201,168,76,0.04)"; }}
            onMouseOut={(e) => { e.currentTarget.style.borderColor = "rgba(201,168,76,0.12)"; e.currentTarget.style.background = "rgba(255,255,255,0.02)"; }}
            >
              <div style={{ fontSize: 36, marginBottom: 14 }}>{f.icon}</div>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: "#e2d5a0", margin: "0 0 8px" }}>{f.title}</h3>
              <p style={{ fontSize: 14, color: "#94a3b8", lineHeight: 1.7, margin: 0 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section style={{ padding: "80px 24px", background: "rgba(201,168,76,0.02)" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", textAlign: "center" }}>
          <h2 style={{ fontSize: 36, fontWeight: 800, color: "#c9a84c", margin: "0 0 50px" }}>
            Como Funciona
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 32 }}>
            {[
              { step: "01", title: "Conecte seu Time", desc: "Cada colaborador recebe acesso personalizado com permissões por papel." },
              { step: "02", title: "Agentes Entram em Ação", desc: "91+ agentes IA se distribuem entre 13 departamentos para auxiliar nas tarefas." },
              { step: "03", title: "Monitore e Escale", desc: "Dashboard em tempo real com métricas, alertas e acompanhamento total." },
            ].map((s) => (
              <div key={s.step} style={{ padding: 20 }}>
                <div style={{
                  width: 56, height: 56, borderRadius: "50%", margin: "0 auto 16px",
                  background: "linear-gradient(135deg, #c9a84c, #a8872e)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 20, fontWeight: 800, color: "#09090f",
                }}>{s.step}</div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: "#e2d5a0", margin: "0 0 8px" }}>{s.title}</h3>
                <p style={{ fontSize: 14, color: "#94a3b8", lineHeight: 1.6, margin: 0 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: "100px 24px", textAlign: "center" }}>
        <div style={{
          maxWidth: 700, margin: "0 auto", padding: 50, borderRadius: 24,
          background: "linear-gradient(135deg, rgba(201,168,76,0.1), rgba(201,168,76,0.02))",
          border: "1px solid rgba(201,168,76,0.2)",
        }}>
          <h2 style={{ fontSize: 32, fontWeight: 800, color: "#c9a84c", margin: "0 0 16px" }}>
            Pronto para Revolucionar?
          </h2>
          <p style={{ color: "#94a3b8", fontSize: 16, margin: "0 0 32px", lineHeight: 1.7 }}>
            Junte-se aos escritórios que já triplicaram seus resultados com a parceria Humano + IA.
          </p>
          <button
            onClick={() => navigate("/auth")}
            style={{
              background: "linear-gradient(135deg, #c9a84c, #b8942e)",
              color: "#09090f", border: "none", borderRadius: 14,
              padding: "18px 48px", fontSize: 18, fontWeight: 700,
              cursor: "pointer", boxShadow: "0 8px 40px rgba(201,168,76,0.35)",
            }}
          >
            ⚖️ Começar Agora — É Grátis
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ padding: "40px 24px", borderTop: "1px solid rgba(201,168,76,0.1)", textAlign: "center" }}>
        <p style={{ color: "#64748b", fontSize: 13, margin: 0 }}>
          © {new Date().getFullYear()} Agent Jus IA — Humano + IA revolucionando a gestão jurídica.
        </p>
      </footer>
    </div>
  );
}
