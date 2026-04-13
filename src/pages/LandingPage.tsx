import { lazy, Suspense, useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";

const AgentScene3D = lazy(() => import("@/components/AgentScene3D"));

const PILARES = [
  {
    icon: "📣",
    tag: "MARKETING JURÍDICO",
    title: "Atraia clientes no piloto automático",
    desc: "Marketing simplificado que leva o cliente certo para o seu escritório. Campanhas inteligentes, presença digital impactante e captação automatizada — sem complicação.",
    stats: [
      { value: "5x", label: "mais leads qualificados" },
      { value: "70%", label: "menos custo por cliente" },
    ],
    gradient: "linear-gradient(135deg, #06b6d4, #0891b2)",
    glow: "rgba(6,182,212,0.3)",
  },
  {
    icon: "⚖️",
    tag: "GESTÃO PROCESSUAL",
    title: "Gerencie milhares de processos com facilidade",
    desc: "Seu time ganha superpoderes. Cada advogado, estagiário e assistente trabalha com um exército de agentes de IA dedicados. Prazos monitorados 24/7, tarefas distribuídas automaticamente.",
    stats: [
      { value: "0", label: "prazos perdidos" },
      { value: "24/7", label: "monitoramento contínuo" },
    ],
    gradient: "linear-gradient(135deg, #8b5cf6, #7c3aed)",
    glow: "rgba(139,92,246,0.3)",
  },
  {
    icon: "🚀",
    tag: "RESULTADOS 3X",
    title: "Triplique o faturamento do seu escritório",
    desc: "91+ agentes de IA especializados formam um exército digital para seu time. O que antes levava dias, agora é feito em minutos. Mais processos, mais clientes, mais receita.",
    stats: [
      { value: "3x", label: "mais faturamento" },
      { value: "91+", label: "agentes IA dedicados" },
    ],
    gradient: "linear-gradient(135deg, #c9a84c, #e8c96a)",
    glow: "rgba(201,168,76,0.3)",
  },
];

const COMO_FUNCIONA = [
  { step: "01", icon: "🔗", title: "Conecte seu Time", desc: "Cadastre advogados, estagiários e assistentes. Cada um recebe permissões personalizadas e seus próprios agentes de IA." },
  { step: "02", icon: "🤖", title: "Exército de IA Ativado", desc: "91+ agentes especializados em 13 departamentos — petições, cálculos, prazos, audiências, marketing — tudo automatizado." },
  { step: "03", icon: "📊", title: "Monitore e Escale", desc: "Dashboard em tempo real com KPIs, alertas inteligentes e visão 360° de todos os processos e clientes." },
  { step: "04", icon: "💰", title: "Triplique Resultados", desc: "Mais capacidade = mais clientes atendidos = mais faturamento. Sem precisar contratar mais pessoas." },
];

const TESTIMONIALS = [
  { name: "Dr. Marcos Oliveira", role: "Sócio Fundador — Oliveira & Associados", text: "Reduzimos 70% do tempo de confecção de peças. Nossos advogados agora focam em estratégia, não em burocracia. O faturamento triplicou em 8 meses.", avatar: "👨‍⚖️", metric: "+300% faturamento" },
  { name: "Dra. Ana Carolina Souza", role: "Diretora Jurídica — TechLaw SP", text: "Zero prazos perdidos desde que adotamos. Os agentes de IA monitoram tudo 24/7. É como ter uma equipe extra que nunca dorme.", avatar: "👩‍⚖️", metric: "0 prazos perdidos" },
  { name: "Dr. Rafael Lima", role: "Advogado Trabalhista — Lima Advocacia", text: "A orquestração inteligente distribui tarefas perfeitamente. Triplicamos a capacidade de atendimento sem contratar ninguém.", avatar: "👨‍💼", metric: "3x mais clientes" },
];

const STATS_BANNER = [
  { value: "91+", label: "Agentes IA" },
  { value: "13", label: "Departamentos" },
  { value: "3x", label: "Produtividade" },
  { value: "24/7", label: "Monitoramento" },
  { value: "0", label: "Prazos Perdidos" },
];

function AnimatedCounter({ value, duration = 2000 }: { value: string; duration?: number }) {
  const [display, setDisplay] = useState("0");
  const ref = useRef<HTMLDivElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !hasAnimated.current) {
        hasAnimated.current = true;
        const numMatch = value.match(/\d+/);
        if (!numMatch) { setDisplay(value); return; }
        const target = parseInt(numMatch[0]);
        const suffix = value.replace(/\d+/, "");
        const start = Date.now();
        const tick = () => {
          const elapsed = Date.now() - start;
          const progress = Math.min(elapsed / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          setDisplay(Math.floor(target * eased) + suffix);
          if (progress < 1) requestAnimationFrame(tick);
        };
        tick();
      }
    }, { threshold: 0.3 });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [value, duration]);

  return <div ref={ref}>{display}</div>;
}

export default function LandingPage() {
  const navigate = useNavigate();
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#05050a", color: "#f0ead6", fontFamily: "'Inter', sans-serif", overflowX: "hidden" }}>

      {/* ═══════ NAVBAR ═══════ */}
      <nav style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        background: scrollY > 50 ? "rgba(5,5,10,0.92)" : "transparent",
        backdropFilter: scrollY > 50 ? "blur(24px)" : "none",
        borderBottom: scrollY > 50 ? "1px solid rgba(201,168,76,0.12)" : "none",
        transition: "all 0.4s", padding: "14px 40px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10,
            background: "linear-gradient(135deg, #c9a84c, #a8872e)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, fontWeight: 900, color: "#05050a",
          }}>⚖️</div>
          <span style={{ fontSize: 22, fontWeight: 800, color: "#c9a84c", letterSpacing: "-0.02em" }}>Agent Jus IA</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <a href="#pilares" style={{ color: "#94a3b8", fontSize: 14, textDecoration: "none", fontWeight: 500, transition: "color 0.2s" }}
            onMouseOver={e => (e.currentTarget.style.color = "#c9a84c")} onMouseOut={e => (e.currentTarget.style.color = "#94a3b8")}>
            Soluções
          </a>
          <a href="#como-funciona" style={{ color: "#94a3b8", fontSize: 14, textDecoration: "none", fontWeight: 500, transition: "color 0.2s" }}
            onMouseOver={e => (e.currentTarget.style.color = "#c9a84c")} onMouseOut={e => (e.currentTarget.style.color = "#94a3b8")}>
            Como Funciona
          </a>
          <a href="#depoimentos" style={{ color: "#94a3b8", fontSize: 14, textDecoration: "none", fontWeight: 500, transition: "color 0.2s" }}
            onMouseOver={e => (e.currentTarget.style.color = "#c9a84c")} onMouseOut={e => (e.currentTarget.style.color = "#94a3b8")}>
            Depoimentos
          </a>
          <button onClick={() => navigate("/auth")} style={{
            background: "linear-gradient(135deg, #c9a84c, #a8872e)",
            border: "none", color: "#05050a", borderRadius: 10,
            padding: "11px 28px", cursor: "pointer", fontSize: 14, fontWeight: 700,
            boxShadow: "0 4px 20px rgba(201,168,76,0.25)",
            transition: "transform 0.2s, box-shadow 0.2s",
          }}
          onMouseOver={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 30px rgba(201,168,76,0.4)"; }}
          onMouseOut={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 4px 20px rgba(201,168,76,0.25)"; }}
          >🔐 Acessar Sistema</button>
        </div>
      </nav>

      {/* ═══════ HERO ═══════ */}
      <section style={{ position: "relative", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        {/* 3D Background */}
        <div style={{ position: "absolute", inset: 0, opacity: 0.6 }}>
          <Suspense fallback={null}><AgentScene3D /></Suspense>
        </div>
        {/* Gradient overlays */}
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 40%, transparent 20%, #05050a 75%)" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(5,5,10,0.3) 0%, transparent 30%, transparent 70%, #05050a 100%)" }} />
        {/* Scan line effect */}
        <div style={{
          position: "absolute", inset: 0, opacity: 0.03,
          background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(201,168,76,0.5) 2px, rgba(201,168,76,0.5) 4px)",
          pointerEvents: "none",
        }} />

        <div style={{ position: "relative", zIndex: 10, textAlign: "center", maxWidth: 900, padding: "0 24px" }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 24,
            padding: "8px 24px", borderRadius: 50, fontSize: 13, fontWeight: 600,
            background: "rgba(201,168,76,0.08)", border: "1px solid rgba(201,168,76,0.2)", color: "#c9a84c",
            animation: "pulse 3s infinite",
          }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 12px #22c55e" }} />
            SISTEMA OPERACIONAL JURÍDICO ATIVO
          </div>

          <h1 style={{ fontSize: "clamp(40px, 7vw, 72px)", fontWeight: 900, lineHeight: 1.05, margin: "0 0 24px", letterSpacing: "-0.03em" }}>
            <span style={{ color: "#f0ead6" }}>Seu escritório com um</span><br />
            <span style={{
              background: "linear-gradient(135deg, #c9a84c 0%, #e8d48b 30%, #c9a84c 60%, #ffd700 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              filter: "drop-shadow(0 0 30px rgba(201,168,76,0.3))",
            }}>exército de IA</span>
          </h1>

          <p style={{ fontSize: 20, color: "#b8bcc8", maxWidth: 650, margin: "0 auto 40px", lineHeight: 1.7, fontWeight: 400 }}>
            <strong style={{ color: "#f0ead6" }}>Marketing</strong> que atrai clientes.{" "}
            <strong style={{ color: "#f0ead6" }}>Gestão</strong> de milhares de processos.{" "}
            <strong style={{ color: "#f0ead6" }}>91+ agentes de IA</strong> trabalhando para seu time.{" "}
            <strong style={{ color: "#c9a84c" }}>Triplique seu faturamento.</strong>
          </p>

          <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
            <button onClick={() => navigate("/auth")} style={{
              background: "linear-gradient(135deg, #c9a84c, #b8942e)",
              color: "#05050a", border: "none", borderRadius: 14,
              padding: "18px 48px", fontSize: 17, fontWeight: 800,
              cursor: "pointer", boxShadow: "0 8px 40px rgba(201,168,76,0.35)",
              transition: "all 0.3s", letterSpacing: "-0.01em",
            }}
            onMouseOver={e => { e.currentTarget.style.transform = "translateY(-3px) scale(1.02)"; e.currentTarget.style.boxShadow = "0 14px 50px rgba(201,168,76,0.5)"; }}
            onMouseOut={e => { e.currentTarget.style.transform = "translateY(0) scale(1)"; e.currentTarget.style.boxShadow = "0 8px 40px rgba(201,168,76,0.35)"; }}
            >🚀 Começar Agora — Grátis</button>

            <button onClick={() => document.getElementById("pilares")?.scrollIntoView({ behavior: "smooth" })} style={{
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)",
              color: "#f0ead6", borderRadius: 14, padding: "18px 36px",
              fontSize: 17, fontWeight: 600, cursor: "pointer", transition: "all 0.3s",
            }}
            onMouseOver={e => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; e.currentTarget.style.borderColor = "rgba(201,168,76,0.3)"; }}
            onMouseOut={e => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; }}
            >Descubra o Poder ↓</button>
          </div>

          {/* Mouse scroll indicator */}
          <div style={{ marginTop: 60, opacity: 0.4 }}>
            <div style={{
              width: 24, height: 40, border: "2px solid rgba(201,168,76,0.4)", borderRadius: 12,
              margin: "0 auto", position: "relative",
            }}>
              <div style={{
                width: 4, height: 8, background: "#c9a84c", borderRadius: 2,
                position: "absolute", left: "50%", top: 8, transform: "translateX(-50%)",
                animation: "bounce 2s infinite",
              }} />
            </div>
          </div>
        </div>
      </section>

      {/* ═══════ STATS TICKER ═══════ */}
      <section style={{
        padding: "50px 24px",
        background: "linear-gradient(180deg, rgba(201,168,76,0.04) 0%, rgba(201,168,76,0.01) 100%)",
        borderTop: "1px solid rgba(201,168,76,0.1)", borderBottom: "1px solid rgba(201,168,76,0.1)",
      }}>
        <div style={{ display: "flex", justifyContent: "center", gap: 48, flexWrap: "wrap", maxWidth: 1000, margin: "0 auto" }}>
          {STATS_BANNER.map((s) => (
            <div key={s.label} style={{ textAlign: "center", minWidth: 100 }}>
              <div style={{ fontSize: 44, fontWeight: 900, color: "#c9a84c", lineHeight: 1 }}>
                <AnimatedCounter value={s.value} />
              </div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 6, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════ 3 PILARES ═══════ */}
      <section id="pilares" style={{ padding: "120px 24px", maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 80 }}>
          <div style={{
            display: "inline-block", padding: "6px 20px", borderRadius: 50, fontSize: 12,
            background: "rgba(201,168,76,0.08)", border: "1px solid rgba(201,168,76,0.15)", color: "#c9a84c",
            fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 20,
          }}>OS 3 PILARES</div>
          <h2 style={{ fontSize: "clamp(32px, 5vw, 48px)", fontWeight: 900, margin: 0, lineHeight: 1.1 }}>
            <span style={{ color: "#f0ead6" }}>Tudo que seu escritório precisa</span><br />
            <span style={{ color: "#c9a84c" }}>em uma plataforma</span>
          </h2>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
          {PILARES.map((p, i) => (
            <div key={p.tag} style={{
              display: "grid", gridTemplateColumns: i % 2 === 0 ? "1fr 1fr" : "1fr 1fr",
              gap: 48, alignItems: "center", padding: "48px 40px",
              background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 24, transition: "all 0.4s", position: "relative", overflow: "hidden",
            }}
            onMouseOver={e => { e.currentTarget.style.borderColor = "rgba(201,168,76,0.2)"; e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
            onMouseOut={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)"; e.currentTarget.style.background = "rgba(255,255,255,0.015)"; }}
            >
              {/* Glow effect */}
              <div style={{
                position: "absolute", width: 300, height: 300, borderRadius: "50%",
                background: p.glow, filter: "blur(120px)", opacity: 0.15,
                top: i === 0 ? "-50%" : i === 1 ? "50%" : "0%",
                right: i % 2 === 0 ? "-10%" : undefined,
                left: i % 2 !== 0 ? "-10%" : undefined,
                pointerEvents: "none",
              }} />

              <div style={{ order: i % 2 === 0 ? 0 : 1, position: "relative", zIndex: 1 }}>
                <div style={{
                  display: "inline-block", padding: "5px 14px", borderRadius: 6,
                  background: p.gradient, fontSize: 10, fontWeight: 800,
                  color: "#fff", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 16,
                }}>{p.tag}</div>
                <h3 style={{ fontSize: 30, fontWeight: 800, color: "#f0ead6", margin: "0 0 16px", lineHeight: 1.2 }}>{p.title}</h3>
                <p style={{ fontSize: 16, color: "#94a3b8", lineHeight: 1.8, margin: "0 0 28px" }}>{p.desc}</p>
                <div style={{ display: "flex", gap: 24 }}>
                  {p.stats.map(s => (
                    <div key={s.label} style={{ padding: "12px 20px", background: "rgba(255,255,255,0.04)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)" }}>
                      <div style={{ fontSize: 28, fontWeight: 900, color: "#c9a84c" }}>{s.value}</div>
                      <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ order: i % 2 === 0 ? 1 : 0, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", zIndex: 1 }}>
                <div style={{
                  width: 220, height: 220, borderRadius: "50%",
                  background: `radial-gradient(circle, ${p.glow} 0%, transparent 70%)`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 90, filter: "drop-shadow(0 0 40px " + p.glow + ")",
                }}>{p.icon}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════ COMO FUNCIONA ═══════ */}
      <section id="como-funciona" style={{ padding: "120px 24px", background: "rgba(201,168,76,0.015)" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 80 }}>
            <div style={{
              display: "inline-block", padding: "6px 20px", borderRadius: 50, fontSize: 12,
              background: "rgba(201,168,76,0.08)", border: "1px solid rgba(201,168,76,0.15)", color: "#c9a84c",
              fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 20,
            }}>PASSO A PASSO</div>
            <h2 style={{ fontSize: "clamp(32px, 5vw, 48px)", fontWeight: 900, margin: 0, color: "#f0ead6" }}>
              Simples de começar,<br /><span style={{ color: "#c9a84c" }}>impossível de largar</span>
            </h2>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 24 }}>
            {COMO_FUNCIONA.map((s, i) => (
              <div key={s.step} style={{
                padding: 32, borderRadius: 20,
                background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
                textAlign: "center", transition: "all 0.3s", position: "relative",
              }}
              onMouseOver={e => { e.currentTarget.style.borderColor = "rgba(201,168,76,0.25)"; e.currentTarget.style.transform = "translateY(-4px)"; }}
              onMouseOut={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)"; e.currentTarget.style.transform = "translateY(0)"; }}
              >
                <div style={{
                  width: 60, height: 60, borderRadius: 16, margin: "0 auto 20px",
                  background: "linear-gradient(135deg, #c9a84c, #a8872e)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 28, boxShadow: "0 8px 24px rgba(201,168,76,0.2)",
                }}>{s.icon}</div>
                <div style={{ fontSize: 11, color: "#c9a84c", fontWeight: 800, letterSpacing: "0.15em", marginBottom: 8 }}>PASSO {s.step}</div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: "#f0ead6", margin: "0 0 10px" }}>{s.title}</h3>
                <p style={{ fontSize: 14, color: "#94a3b8", lineHeight: 1.7, margin: 0 }}>{s.desc}</p>
                {i < COMO_FUNCIONA.length - 1 && (
                  <div style={{
                    position: "absolute", right: -16, top: "50%", transform: "translateY(-50%)",
                    color: "#c9a84c", fontSize: 20, opacity: 0.3,
                    display: "none", // Hidden on mobile, would need media query
                  }}>→</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════ DEPOIMENTOS ═══════ */}
      <section id="depoimentos" style={{ padding: "120px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 80 }}>
            <div style={{
              display: "inline-block", padding: "6px 20px", borderRadius: 50, fontSize: 12,
              background: "rgba(201,168,76,0.08)", border: "1px solid rgba(201,168,76,0.15)", color: "#c9a84c",
              fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 20,
            }}>CASOS DE SUCESSO</div>
            <h2 style={{ fontSize: "clamp(32px, 5vw, 48px)", fontWeight: 900, margin: 0, color: "#f0ead6" }}>
              Escritórios que já<br /><span style={{ color: "#c9a84c" }}>revolucionaram sua gestão</span>
            </h2>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 28 }}>
            {TESTIMONIALS.map((t) => (
              <div key={t.name} style={{
                background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 24, padding: 36, position: "relative", overflow: "hidden",
                transition: "all 0.3s",
              }}
              onMouseOver={e => { e.currentTarget.style.borderColor = "rgba(201,168,76,0.2)"; }}
              onMouseOut={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)"; }}
              >
                {/* Metric badge */}
                <div style={{
                  position: "absolute", top: 20, right: 20,
                  padding: "6px 14px", borderRadius: 8,
                  background: "rgba(201,168,76,0.1)", border: "1px solid rgba(201,168,76,0.2)",
                  color: "#c9a84c", fontSize: 12, fontWeight: 800,
                }}>{t.metric}</div>

                <div style={{ fontSize: 48, opacity: 0.08, position: "absolute", top: 8, left: 24, color: "#c9a84c", fontFamily: "serif" }}>"</div>
                <p style={{ fontSize: 15, color: "#b8bcc8", lineHeight: 1.9, margin: "0 0 28px", fontStyle: "italic" }}>"{t.text}"</p>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{
                    width: 52, height: 52, borderRadius: 14,
                    background: "linear-gradient(135deg, rgba(201,168,76,0.15), rgba(201,168,76,0.05))",
                    border: "2px solid rgba(201,168,76,0.2)",
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24,
                  }}>{t.avatar}</div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#f0ead6" }}>{t.name}</div>
                    <div style={{ fontSize: 12, color: "#64748b" }}>{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════ CTA FINAL ═══════ */}
      <section style={{ padding: "120px 24px", position: "relative", overflow: "hidden" }}>
        {/* Background glow */}
        <div style={{
          position: "absolute", width: 600, height: 600, borderRadius: "50%",
          background: "rgba(201,168,76,0.08)", filter: "blur(150px)",
          top: "50%", left: "50%", transform: "translate(-50%, -50%)",
          pointerEvents: "none",
        }} />

        <div style={{
          maxWidth: 800, margin: "0 auto", textAlign: "center", position: "relative", zIndex: 1,
          padding: "60px 48px", borderRadius: 28,
          background: "linear-gradient(135deg, rgba(201,168,76,0.06), rgba(201,168,76,0.01))",
          border: "1px solid rgba(201,168,76,0.15)",
        }}>
          <div style={{ fontSize: 60, marginBottom: 20 }}>⚡</div>
          <h2 style={{ fontSize: "clamp(28px, 4vw, 42px)", fontWeight: 900, color: "#f0ead6", margin: "0 0 16px" }}>
            Pronto para <span style={{ color: "#c9a84c" }}>triplicar</span> seus resultados?
          </h2>
          <p style={{ color: "#94a3b8", fontSize: 17, margin: "0 0 36px", lineHeight: 1.7, maxWidth: 550, marginLeft: "auto", marginRight: "auto" }}>
            Junte-se aos escritórios que já transformaram sua operação com a parceria <strong style={{ color: "#f0ead6" }}>Humano + IA</strong>.
          </p>
          <button onClick={() => navigate("/auth")} style={{
            background: "linear-gradient(135deg, #c9a84c, #b8942e)",
            color: "#05050a", border: "none", borderRadius: 16,
            padding: "20px 56px", fontSize: 18, fontWeight: 800,
            cursor: "pointer", boxShadow: "0 12px 50px rgba(201,168,76,0.4)",
            transition: "all 0.3s",
          }}
          onMouseOver={e => { e.currentTarget.style.transform = "translateY(-3px) scale(1.03)"; e.currentTarget.style.boxShadow = "0 18px 60px rgba(201,168,76,0.55)"; }}
          onMouseOut={e => { e.currentTarget.style.transform = "translateY(0) scale(1)"; e.currentTarget.style.boxShadow = "0 12px 50px rgba(201,168,76,0.4)"; }}
          >⚖️ Começar Agora — É Grátis</button>
          <p style={{ color: "#475569", fontSize: 13, marginTop: 16 }}>Sem cartão de crédito • Setup em 2 minutos • Suporte dedicado</p>
        </div>
      </section>

      {/* ═══════ FOOTER ═══════ */}
      <footer style={{ padding: "40px 24px", borderTop: "1px solid rgba(201,168,76,0.08)", textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 18, color: "#c9a84c" }}>⚖️</span>
          <span style={{ fontSize: 16, fontWeight: 700, color: "#c9a84c" }}>Agent Jus IA</span>
        </div>
        <p style={{ color: "#334155", fontSize: 13, margin: 0 }}>
          © {new Date().getFullYear()} Agent Jus IA — Humano + IA revolucionando a gestão jurídica.
        </p>
      </footer>

      {/* Global keyframes */}
      <style>{`
        @keyframes bounce {
          0%, 100% { transform: translateX(-50%) translateY(0); opacity: 1; }
          50% { transform: translateX(-50%) translateY(12px); opacity: 0.3; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
        @media (max-width: 768px) {
          nav > div:last-child > a { display: none !important; }
          section > div > div[style*="grid-template-columns: 1fr 1fr"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
