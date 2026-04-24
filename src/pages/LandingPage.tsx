import { lazy, Suspense, useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";

const AgentScene3D = lazy(() => import("@/components/AgentScene3D"));

const PILARES = [
  {
    icon: "🧠",
    tag: "VOCÊ É O ESTRATEGISTA",
    title: "Você pensa. Eles executam.",
    desc: "Chega de afogar advogados em tarefas repetitivas. Você define o caso, a estratégia e o resultado esperado — sua força de IA cuida de petições, prazos, cálculos, protocolos e comunicação. Seu tempo volta a ser seu.",
    stats: [
      { value: "8h", label: "devolvidas por dia" },
      { value: "0", label: "tarefas operacionais" },
    ],
    gradient: "linear-gradient(135deg, #06b6d4, #0891b2)",
    glow: "rgba(6,182,212,0.3)",
  },
  {
    icon: "🤖",
    tag: "SUA EQUIPE INVISÍVEL",
    title: "91 agentes. Trabalhando para você. Sempre.",
    desc: "Enquanto você dorme, jantar com a família ou descansa, sua força de IA está protocolando, calculando, redigindo e monitorando prazos. Eles não cansam, não esquecem, não pedem férias. Você comanda — eles entregam.",
    stats: [
      { value: "24/7", label: "ativos por você" },
      { value: "91+", label: "agentes ao seu serviço" },
    ],
    gradient: "linear-gradient(135deg, #8b5cf6, #7c3aed)",
    glow: "rgba(139,92,246,0.3)",
  },
  {
    icon: "👑",
    tag: "VOCÊ NO COMANDO",
    title: "Você dá a ordem. O resultado chega pronto.",
    desc: "Cada decisão importante volta para suas mãos com tudo preparado: análise feita, peça redigida, cálculo conferido. Você só aprova e assina. Pare de executar tarefas — comece a comandar resultados.",
    stats: [
      { value: "3x", label: "mais clientes atendidos" },
      { value: "100%", label: "decisão sua" },
    ],
    gradient: "linear-gradient(135deg, #c9a84c, #e8c96a)",
    glow: "rgba(201,168,76,0.3)",
  },
];

const COMO_FUNCIONA = [
  { step: "01", icon: "💬", title: "Você dá a ordem", desc: "Em linguagem natural, no chat. 'Faça a inicial trabalhista do cliente Silva' — só isso. Como falar com um assistente de elite." },
  { step: "02", icon: "⚡", title: "Sua força de IA mobiliza", desc: "O agente certo é acionado. Ele consulta, redige, calcula, protocola. Outros agentes revisam. Tudo em minutos, sem você mexer um dedo." },
  { step: "03", icon: "✅", title: "O resultado chega para você", desc: "Peça pronta para revisão, prazo registrado, cliente comunicado. Você aprova com um clique e segue para o próximo caso." },
  { step: "04", icon: "🌴", title: "Você recupera sua vida", desc: "Mais tempo com a família. Mais foco no que importa. Mais clientes atendidos sem contratar ninguém. Você vira o estrategista — não o executor." },
];

const TESTIMONIALS = [
  { name: "Dr. Marcos Oliveira", role: "Sócio Fundador — Oliveira & Associados", text: "Antes eu trabalhava 14h por dia. Hoje saio às 18h e meus agentes continuam protocolando peças. Voltei a jantar com minha família.", avatar: "👨‍⚖️", metric: "8h/dia recuperadas" },
  { name: "Dra. Ana Carolina Souza", role: "Diretora Jurídica — TechLaw SP", text: "Eu não executo mais nada operacional. Minha função virou estratégica: defino, aprovo, assino. Os agentes fazem o resto. Triplicamos a banca em 6 meses.", avatar: "👩‍⚖️", metric: "0 tarefas operacionais" },
  { name: "Dr. Rafael Lima", role: "Advogado Trabalhista — Lima Advocacia", text: "É como ter 90 estagiários de elite que nunca dormem. Eu só comando. Eles entregam tudo pronto para minha assinatura. Inacreditável.", avatar: "👨‍💼", metric: "3x mais casos por mês" },
];

const STATS_BANNER = [
  { value: "91+", label: "Agentes ao seu serviço" },
  { value: "8h", label: "Devolvidas por dia" },
  { value: "3x", label: "Mais casos atendidos" },
  { value: "24/7", label: "Trabalhando por você" },
  { value: "0", label: "Tarefas operacionais" },
];

const PLANOS = [
  {
    name: "Starter",
    price: "297",
    desc: "Para escritórios em crescimento",
    highlight: false,
    features: [
      "Até 5 usuários",
      "10 agentes de IA",
      "3 departamentos",
      "500 processos",
      "Suporte por email",
      "Dashboard básico",
    ],
    cta: "Começar Grátis",
  },
  {
    name: "Professional",
    price: "697",
    desc: "O mais escolhido — para escritórios que querem escalar",
    highlight: true,
    features: [
      "Até 25 usuários",
      "45 agentes de IA",
      "8 departamentos",
      "Processos ilimitados",
      "Suporte prioritário 24/7",
      "Dashboard avançado + KPIs",
      "Marketing jurídico integrado",
      "Orquestração inteligente",
    ],
    cta: "Escolher Professional",
  },
  {
    name: "Enterprise",
    price: "Sob consulta",
    desc: "Para bancas de grande porte",
    highlight: false,
    features: [
      "Usuários ilimitados",
      "91+ agentes de IA",
      "13 departamentos completos",
      "Processos ilimitados",
      "Gerente de conta dedicado",
      "API + integrações customizadas",
      "SLA garantido 99.9%",
      "Treinamento presencial",
    ],
    cta: "Falar com Consultor",
  },
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
  const [mobileMenu, setMobileMenu] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="lp-root">

      {/* ═══════ NAVBAR ═══════ */}
      <nav className={`lp-nav ${scrollY > 50 ? "lp-nav--scrolled" : ""}`}>
        <div className="lp-nav__brand">
          <div className="lp-nav__logo">⚖️</div>
          <span className="lp-nav__name">LexForce</span>
        </div>

        {/* Desktop links */}
        <div className="lp-nav__links">
          <a href="#pilares">Como funciona</a>
          <a href="#como-funciona">Seu novo dia</a>
          <a href="#planos">Planos</a>
          <a href="#depoimentos">Quem usa</a>
          <button className="lp-btn-gold lp-btn-sm" onClick={() => navigate("/auth")}>Comandar agora</button>
        </div>

        {/* Mobile hamburger */}
        <button className="lp-hamburger" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Menu">
          <span /><span /><span />
        </button>
      </nav>

      {/* Mobile menu overlay */}
      {mobileMenu && (
        <div className="lp-mobile-menu" onClick={() => setMobileMenu(false)}>
          <div className="lp-mobile-menu__inner" onClick={e => e.stopPropagation()}>
            <a href="#pilares" onClick={() => setMobileMenu(false)}>Como funciona</a>
            <a href="#como-funciona" onClick={() => setMobileMenu(false)}>Seu novo dia</a>
            <a href="#planos" onClick={() => setMobileMenu(false)}>Planos</a>
            <a href="#depoimentos" onClick={() => setMobileMenu(false)}>Quem usa</a>
            <button className="lp-btn-gold" onClick={() => { setMobileMenu(false); navigate("/auth"); }}>Comandar agora</button>
          </div>
        </div>
      )}

      {/* ═══════ HERO ═══════ */}
      <section className="lp-hero">
        <div className="lp-hero__3d">
          <Suspense fallback={null}><AgentScene3D /></Suspense>
        </div>
        <div className="lp-hero__overlay1" />
        <div className="lp-hero__overlay2" />
        <div className="lp-hero__scanlines" />

        <div className="lp-hero__content">
          <div className="lp-badge-pulse">
            <span className="lp-badge-dot" />
            SUA FORÇA DE IA JURÍDICA · ATIVA 24/7
          </div>

          <h1 className="lp-hero__h1">
            <span>Seus agentes trabalham.</span><br />
            <span className="lp-gold-text">Você decide.</span>
          </h1>

          <p className="lp-hero__sub">
            Pare de executar tarefas. Comece a <strong>comandar resultados</strong>.{" "}
            Uma força de <strong>91+ agentes de IA jurídica</strong> que protocola, redige, calcula e monitora{" "}
            <strong className="lp-gold-text">enquanto você vive sua vida</strong>.
          </p>

          <div className="lp-hero__btns">
            <button className="lp-btn-gold lp-btn-lg" onClick={() => navigate("/auth")}>👑 Assumir o comando — Grátis</button>
            <button className="lp-btn-ghost lp-btn-lg" onClick={() => document.getElementById("pilares")?.scrollIntoView({ behavior: "smooth" })}>Ver como funciona ↓</button>
          </div>

          <div className="lp-scroll-indicator">
            <div className="lp-scroll-mouse"><div className="lp-scroll-dot" /></div>
          </div>
        </div>
      </section>

      {/* ═══════ STATS TICKER ═══════ */}
      <section className="lp-stats">
        <div className="lp-stats__grid">
          {STATS_BANNER.map((s) => (
            <div key={s.label} className="lp-stats__item">
              <div className="lp-stats__value"><AnimatedCounter value={s.value} /></div>
              <div className="lp-stats__label">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════ 3 PILARES ═══════ */}
      <section id="pilares" className="lp-section">
        <div className="lp-container">
          <div className="lp-section-header">
            <div className="lp-tag">OS 3 PILARES</div>
            <h2 className="lp-section-title">
              <span>Tudo que seu escritório precisa</span><br />
              <span className="lp-gold-text">em uma plataforma</span>
            </h2>
          </div>

          <div className="lp-pilares">
            {PILARES.map((p, i) => (
              <div key={p.tag} className={`lp-pilar ${i % 2 !== 0 ? "lp-pilar--reverse" : ""}`}>
                <div className="lp-pilar__glow" style={{ background: p.glow }} />
                <div className="lp-pilar__text">
                  <div className="lp-pilar__tag" style={{ background: p.gradient }}>{p.tag}</div>
                  <h3 className="lp-pilar__title">{p.title}</h3>
                  <p className="lp-pilar__desc">{p.desc}</p>
                  <div className="lp-pilar__stats">
                    {p.stats.map(s => (
                      <div key={s.label} className="lp-pilar__stat">
                        <div className="lp-pilar__stat-value">{s.value}</div>
                        <div className="lp-pilar__stat-label">{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="lp-pilar__icon">
                  <div className="lp-pilar__orb" style={{ background: `radial-gradient(circle, ${p.glow} 0%, transparent 70%)` }}>
                    {p.icon}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════ COMO FUNCIONA ═══════ */}
      <section id="como-funciona" className="lp-section lp-section--alt">
        <div className="lp-container lp-container--narrow">
          <div className="lp-section-header">
            <div className="lp-tag">PASSO A PASSO</div>
            <h2 className="lp-section-title">
              Simples de começar,<br /><span className="lp-gold-text">impossível de largar</span>
            </h2>
          </div>

          <div className="lp-steps">
            {COMO_FUNCIONA.map((s) => (
              <div key={s.step} className="lp-step">
                <div className="lp-step__icon">{s.icon}</div>
                <div className="lp-step__num">PASSO {s.step}</div>
                <h3 className="lp-step__title">{s.title}</h3>
                <p className="lp-step__desc">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════ PLANOS ═══════ */}
      <section id="planos" className="lp-section">
        <div className="lp-container">
          <div className="lp-section-header">
            <div className="lp-tag">PLANOS & PREÇOS</div>
            <h2 className="lp-section-title">
              Escolha o plano ideal<br /><span className="lp-gold-text">para seu escritório</span>
            </h2>
          </div>

          <div className="lp-plans">
            {PLANOS.map((plan) => (
              <div key={plan.name} className={`lp-plan ${plan.highlight ? "lp-plan--highlight" : ""}`}>
                {plan.highlight && <div className="lp-plan__badge">MAIS POPULAR</div>}
                <h3 className="lp-plan__name">{plan.name}</h3>
                <p className="lp-plan__desc">{plan.desc}</p>
                <div className="lp-plan__price">
                  {plan.price !== "Sob consulta" ? (
                    <>
                      <span className="lp-plan__currency">R$</span>
                      <span className="lp-plan__amount">{plan.price}</span>
                      <span className="lp-plan__period">/mês</span>
                    </>
                  ) : (
                    <span className="lp-plan__amount lp-plan__amount--custom">{plan.price}</span>
                  )}
                </div>
                <ul className="lp-plan__features">
                  {plan.features.map(f => (
                    <li key={f}>✓ {f}</li>
                  ))}
                </ul>
                <button
                  className={plan.highlight ? "lp-btn-gold lp-btn-full" : "lp-btn-ghost lp-btn-full"}
                  onClick={() => navigate("/auth")}
                >{plan.cta}</button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════ DEPOIMENTOS ═══════ */}
      <section id="depoimentos" className="lp-section lp-section--alt">
        <div className="lp-container">
          <div className="lp-section-header">
            <div className="lp-tag">CASOS DE SUCESSO</div>
            <h2 className="lp-section-title">
              Escritórios que já<br /><span className="lp-gold-text">revolucionaram sua gestão</span>
            </h2>
          </div>

          <div className="lp-testimonials">
            {TESTIMONIALS.map((t) => (
              <div key={t.name} className="lp-testimonial">
                <div className="lp-testimonial__metric">{t.metric}</div>
                <p className="lp-testimonial__text">"{t.text}"</p>
                <div className="lp-testimonial__author">
                  <div className="lp-testimonial__avatar">{t.avatar}</div>
                  <div>
                    <div className="lp-testimonial__name">{t.name}</div>
                    <div className="lp-testimonial__role">{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════ CTA FINAL ═══════ */}
      <section className="lp-cta-final">
        <div className="lp-cta-final__glow" />
        <div className="lp-cta-final__box">
          <div style={{ fontSize: 60, marginBottom: 20 }}>⚡</div>
          <h2 className="lp-cta-final__title">
            Pronto para <span className="lp-gold-text">triplicar</span> seus resultados?
          </h2>
          <p className="lp-cta-final__sub">
            Junte-se aos escritórios que já transformaram sua operação com a parceria <strong>Humano + IA</strong>.
          </p>
          <button className="lp-btn-gold lp-btn-lg" onClick={() => navigate("/auth")}>⚖️ Começar Agora — É Grátis</button>
          <p className="lp-cta-final__note">Sem cartão de crédito • Setup em 2 minutos • Suporte dedicado</p>
        </div>
      </section>

      {/* ═══════ FOOTER ═══════ */}
      <footer className="lp-footer">
        <div className="lp-footer__brand">
          <span>⚖️</span>
          <span>Agent Jus IA</span>
        </div>
        <p className="lp-footer__copy">© {new Date().getFullYear()} Agent Jus IA — Humano + IA revolucionando a gestão jurídica.</p>
      </footer>

      <style>{`
        /* ====== BASE ====== */
        .lp-root {
          min-height: 100vh; background: #05050a; color: #f0ead6;
          font-family: 'Inter', sans-serif; overflow-x: hidden;
        }

        /* ====== UTILITIES ====== */
        .lp-gold-text {
          background: linear-gradient(135deg, #c9a84c 0%, #e8d48b 30%, #c9a84c 60%, #ffd700 100%);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
          filter: drop-shadow(0 0 30px rgba(201,168,76,0.3));
        }
        .lp-tag {
          display: inline-block; padding: 6px 20px; border-radius: 50px; font-size: 12px;
          background: rgba(201,168,76,0.08); border: 1px solid rgba(201,168,76,0.15);
          color: #c9a84c; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; margin-bottom: 20px;
        }
        .lp-section-header { text-align: center; margin-bottom: 60px; }
        .lp-section-title {
          font-size: clamp(28px, 5vw, 48px); font-weight: 900; margin: 0; line-height: 1.1; color: #f0ead6;
        }
        .lp-container { max-width: 1200px; margin: 0 auto; }
        .lp-container--narrow { max-width: 1000px; margin: 0 auto; }
        .lp-section { padding: 80px 20px; }
        .lp-section--alt { background: rgba(201,168,76,0.015); }

        /* ====== BUTTONS ====== */
        .lp-btn-gold {
          background: linear-gradient(135deg, #c9a84c, #a8872e);
          border: none; color: #05050a; border-radius: 12px; padding: 12px 28px;
          cursor: pointer; font-size: 14px; font-weight: 700;
          box-shadow: 0 4px 20px rgba(201,168,76,0.25); transition: all 0.3s;
        }
        .lp-btn-gold:hover { transform: translateY(-2px); box-shadow: 0 8px 30px rgba(201,168,76,0.4); }
        .lp-btn-ghost {
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.12);
          color: #f0ead6; border-radius: 12px; padding: 12px 28px;
          font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.3s;
        }
        .lp-btn-ghost:hover { background: rgba(255,255,255,0.08); border-color: rgba(201,168,76,0.3); }
        .lp-btn-sm { padding: 10px 22px; font-size: 13px; }
        .lp-btn-lg { padding: 16px 40px; font-size: 16px; border-radius: 14px; }
        .lp-btn-full { width: 100%; text-align: center; }

        /* ====== NAVBAR ====== */
        .lp-nav {
          position: fixed; top: 0; left: 0; right: 0; z-index: 100;
          padding: 14px 20px; display: flex; justify-content: space-between; align-items: center;
          transition: all 0.4s;
        }
        .lp-nav--scrolled {
          background: rgba(5,5,10,0.92); backdrop-filter: blur(24px);
          border-bottom: 1px solid rgba(201,168,76,0.12);
        }
        .lp-nav__brand { display: flex; align-items: center; gap: 10px; }
        .lp-nav__logo {
          width: 36px; height: 36px; border-radius: 10px;
          background: linear-gradient(135deg, #c9a84c, #a8872e);
          display: flex; align-items: center; justify-content: center;
          font-size: 16px; font-weight: 900; color: #05050a;
        }
        .lp-nav__name { font-size: 20px; font-weight: 800; color: #c9a84c; letter-spacing: -0.02em; }
        .lp-nav__links { display: flex; align-items: center; gap: 24px; }
        .lp-nav__links a {
          color: #94a3b8; font-size: 14px; text-decoration: none; font-weight: 500; transition: color 0.2s;
        }
        .lp-nav__links a:hover { color: #c9a84c; }
        .lp-hamburger {
          display: none; background: none; border: none; cursor: pointer; padding: 8px;
          flex-direction: column; gap: 5px;
        }
        .lp-hamburger span {
          display: block; width: 24px; height: 2px; background: #c9a84c; border-radius: 2px;
        }

        /* ====== MOBILE MENU ====== */
        .lp-mobile-menu {
          position: fixed; inset: 0; z-index: 200; background: rgba(0,0,0,0.8);
          backdrop-filter: blur(12px); display: flex; align-items: center; justify-content: center;
        }
        .lp-mobile-menu__inner {
          display: flex; flex-direction: column; gap: 20px; text-align: center;
          padding: 40px; background: rgba(15,15,25,0.95); border-radius: 24px;
          border: 1px solid rgba(201,168,76,0.15); min-width: 280px;
        }
        .lp-mobile-menu__inner a {
          color: #f0ead6; font-size: 18px; font-weight: 600; text-decoration: none;
          padding: 12px; border-radius: 12px; transition: background 0.2s;
        }
        .lp-mobile-menu__inner a:hover { background: rgba(201,168,76,0.1); }

        /* ====== HERO ====== */
        .lp-hero {
          position: relative; min-height: 100vh; display: flex; align-items: center;
          justify-content: center; overflow: hidden;
        }
        .lp-hero__3d { position: absolute; inset: 0; opacity: 0.6; }
        .lp-hero__overlay1 { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 40%, transparent 20%, #05050a 75%); }
        .lp-hero__overlay2 { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(5,5,10,0.3) 0%, transparent 30%, transparent 70%, #05050a 100%); }
        .lp-hero__scanlines {
          position: absolute; inset: 0; opacity: 0.03; pointer-events: none;
          background: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(201,168,76,0.5) 2px, rgba(201,168,76,0.5) 4px);
        }
        .lp-hero__content {
          position: relative; z-index: 10; text-align: center; max-width: 900px; padding: 0 20px;
        }
        .lp-badge-pulse {
          display: inline-flex; align-items: center; gap: 8px; margin-bottom: 24px;
          padding: 8px 20px; border-radius: 50px; font-size: 11px; font-weight: 600;
          background: rgba(201,168,76,0.08); border: 1px solid rgba(201,168,76,0.2); color: #c9a84c;
          animation: pulse 3s infinite;
        }
        .lp-badge-dot {
          width: 8px; height: 8px; border-radius: 50%; background: #22c55e; box-shadow: 0 0 12px #22c55e;
        }
        .lp-hero__h1 {
          font-size: clamp(32px, 7vw, 72px); font-weight: 900; line-height: 1.05;
          margin: 0 0 20px; letter-spacing: -0.03em; color: #f0ead6;
        }
        .lp-hero__sub {
          font-size: clamp(15px, 2.5vw, 20px); color: #b8bcc8; max-width: 650px;
          margin: 0 auto 32px; line-height: 1.7; font-weight: 400;
        }
        .lp-hero__sub strong { color: #f0ead6; }
        .lp-hero__btns { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
        .lp-scroll-indicator { margin-top: 48px; opacity: 0.4; }
        .lp-scroll-mouse {
          width: 24px; height: 40px; border: 2px solid rgba(201,168,76,0.4); border-radius: 12px;
          margin: 0 auto; position: relative;
        }
        .lp-scroll-dot {
          width: 4px; height: 8px; background: #c9a84c; border-radius: 2px;
          position: absolute; left: 50%; top: 8px; transform: translateX(-50%);
          animation: bounce 2s infinite;
        }

        /* ====== STATS ====== */
        .lp-stats {
          padding: 40px 20px;
          background: linear-gradient(180deg, rgba(201,168,76,0.04) 0%, rgba(201,168,76,0.01) 100%);
          border-top: 1px solid rgba(201,168,76,0.1); border-bottom: 1px solid rgba(201,168,76,0.1);
        }
        .lp-stats__grid {
          display: flex; justify-content: center; gap: 32px; flex-wrap: wrap; max-width: 1000px; margin: 0 auto;
        }
        .lp-stats__item { text-align: center; min-width: 80px; }
        .lp-stats__value { font-size: clamp(32px, 5vw, 44px); font-weight: 900; color: #c9a84c; line-height: 1; }
        .lp-stats__label { font-size: 11px; color: #64748b; margin-top: 6px; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 600; }

        /* ====== PILARES ====== */
        .lp-pilares { display: flex; flex-direction: column; gap: 32px; }
        .lp-pilar {
          display: grid; grid-template-columns: 1fr 1fr; gap: 32px; align-items: center;
          padding: 40px 32px; background: rgba(255,255,255,0.015);
          border: 1px solid rgba(255,255,255,0.06); border-radius: 24px;
          transition: all 0.4s; position: relative; overflow: hidden;
        }
        .lp-pilar:hover { border-color: rgba(201,168,76,0.2); background: rgba(255,255,255,0.03); }
        .lp-pilar__glow {
          position: absolute; width: 250px; height: 250px; border-radius: 50%;
          filter: blur(120px); opacity: 0.15; pointer-events: none; top: 0; right: -10%;
        }
        .lp-pilar--reverse .lp-pilar__text { order: 1; }
        .lp-pilar--reverse .lp-pilar__icon { order: 0; }
        .lp-pilar__text { position: relative; z-index: 1; }
        .lp-pilar__tag {
          display: inline-block; padding: 5px 14px; border-radius: 6px; font-size: 10px;
          font-weight: 800; color: #fff; text-transform: uppercase; letter-spacing: 0.12em; margin-bottom: 16px;
        }
        .lp-pilar__title { font-size: clamp(22px, 3vw, 30px); font-weight: 800; color: #f0ead6; margin: 0 0 16px; line-height: 1.2; }
        .lp-pilar__desc { font-size: 15px; color: #94a3b8; line-height: 1.8; margin: 0 0 24px; }
        .lp-pilar__stats { display: flex; gap: 16px; flex-wrap: wrap; }
        .lp-pilar__stat {
          padding: 10px 16px; background: rgba(255,255,255,0.04); border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.06);
        }
        .lp-pilar__stat-value { font-size: 24px; font-weight: 900; color: #c9a84c; }
        .lp-pilar__stat-label { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; }
        .lp-pilar__icon {
          display: flex; align-items: center; justify-content: center; position: relative; z-index: 1;
        }
        .lp-pilar__orb {
          width: 180px; height: 180px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center; font-size: 72px;
        }

        /* ====== STEPS ====== */
        .lp-steps {
          display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px;
        }
        .lp-step {
          padding: 28px; border-radius: 20px; background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.06); text-align: center; transition: all 0.3s;
        }
        .lp-step:hover { border-color: rgba(201,168,76,0.25); transform: translateY(-4px); }
        .lp-step__icon {
          width: 56px; height: 56px; border-radius: 14px; margin: 0 auto 16px;
          background: linear-gradient(135deg, #c9a84c, #a8872e);
          display: flex; align-items: center; justify-content: center; font-size: 24px;
          box-shadow: 0 8px 24px rgba(201,168,76,0.2);
        }
        .lp-step__num { font-size: 11px; color: #c9a84c; font-weight: 800; letter-spacing: 0.15em; margin-bottom: 8px; }
        .lp-step__title { font-size: 17px; font-weight: 700; color: #f0ead6; margin: 0 0 10px; }
        .lp-step__desc { font-size: 13px; color: #94a3b8; line-height: 1.7; margin: 0; }

        /* ====== PLANS ====== */
        .lp-plans {
          display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 24px;
          align-items: stretch;
        }
        .lp-plan {
          padding: 36px 28px; border-radius: 24px; background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.06); display: flex; flex-direction: column;
          position: relative; transition: all 0.3s;
        }
        .lp-plan:hover { border-color: rgba(201,168,76,0.2); transform: translateY(-4px); }
        .lp-plan--highlight {
          background: rgba(201,168,76,0.04); border-color: rgba(201,168,76,0.25);
          box-shadow: 0 0 60px rgba(201,168,76,0.08);
        }
        .lp-plan__badge {
          position: absolute; top: -14px; left: 50%; transform: translateX(-50%);
          padding: 6px 20px; border-radius: 50px; font-size: 11px; font-weight: 800;
          background: linear-gradient(135deg, #c9a84c, #a8872e); color: #05050a;
          letter-spacing: 0.1em; white-space: nowrap;
        }
        .lp-plan__name { font-size: 22px; font-weight: 800; color: #f0ead6; margin: 0 0 6px; }
        .lp-plan__desc { font-size: 13px; color: #64748b; margin: 0 0 24px; line-height: 1.5; }
        .lp-plan__price { display: flex; align-items: baseline; gap: 4px; margin-bottom: 28px; }
        .lp-plan__currency { font-size: 18px; color: #94a3b8; font-weight: 600; }
        .lp-plan__amount { font-size: 48px; font-weight: 900; color: #c9a84c; line-height: 1; }
        .lp-plan__amount--custom { font-size: 28px; }
        .lp-plan__period { font-size: 14px; color: #64748b; font-weight: 500; }
        .lp-plan__features {
          list-style: none; padding: 0; margin: 0 0 28px; flex: 1;
          display: flex; flex-direction: column; gap: 10px;
        }
        .lp-plan__features li { font-size: 14px; color: #b8bcc8; line-height: 1.5; }

        /* ====== TESTIMONIALS ====== */
        .lp-testimonials {
          display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 24px;
        }
        .lp-testimonial {
          background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06);
          border-radius: 24px; padding: 32px; position: relative; overflow: hidden; transition: all 0.3s;
        }
        .lp-testimonial:hover { border-color: rgba(201,168,76,0.2); }
        .lp-testimonial__metric {
          position: absolute; top: 16px; right: 16px; padding: 5px 12px; border-radius: 8px;
          background: rgba(201,168,76,0.1); border: 1px solid rgba(201,168,76,0.2);
          color: #c9a84c; font-size: 11px; font-weight: 800;
        }
        .lp-testimonial__text {
          font-size: 14px; color: #b8bcc8; line-height: 1.9; margin: 0 0 24px; font-style: italic;
        }
        .lp-testimonial__author { display: flex; align-items: center; gap: 12px; }
        .lp-testimonial__avatar {
          width: 48px; height: 48px; border-radius: 14px;
          background: linear-gradient(135deg, rgba(201,168,76,0.15), rgba(201,168,76,0.05));
          border: 2px solid rgba(201,168,76,0.2);
          display: flex; align-items: center; justify-content: center; font-size: 22px;
        }
        .lp-testimonial__name { font-size: 14px; font-weight: 700; color: #f0ead6; }
        .lp-testimonial__role { font-size: 11px; color: #64748b; }

        /* ====== CTA FINAL ====== */
        .lp-cta-final { padding: 80px 20px; position: relative; overflow: hidden; }
        .lp-cta-final__glow {
          position: absolute; width: 500px; height: 500px; border-radius: 50%;
          background: rgba(201,168,76,0.08); filter: blur(150px);
          top: 50%; left: 50%; transform: translate(-50%, -50%); pointer-events: none;
        }
        .lp-cta-final__box {
          max-width: 700px; margin: 0 auto; text-align: center; position: relative; z-index: 1;
          padding: 48px 32px; border-radius: 28px;
          background: linear-gradient(135deg, rgba(201,168,76,0.06), rgba(201,168,76,0.01));
          border: 1px solid rgba(201,168,76,0.15);
        }
        .lp-cta-final__title {
          font-size: clamp(24px, 4vw, 42px); font-weight: 900; color: #f0ead6; margin: 0 0 16px;
        }
        .lp-cta-final__sub { color: #94a3b8; font-size: 16px; margin: 0 0 32px; line-height: 1.7; }
        .lp-cta-final__sub strong { color: #f0ead6; }
        .lp-cta-final__note { color: #475569; font-size: 13px; margin-top: 16px; }

        /* ====== FOOTER ====== */
        .lp-footer { padding: 32px 20px; border-top: 1px solid rgba(201,168,76,0.08); text-align: center; }
        .lp-footer__brand { display: flex; justify-content: center; align-items: center; gap: 8px; margin-bottom: 10px; }
        .lp-footer__brand span:first-child { font-size: 18px; color: #c9a84c; }
        .lp-footer__brand span:last-child { font-size: 16px; font-weight: 700; color: #c9a84c; }
        .lp-footer__copy { color: #334155; font-size: 13px; margin: 0; }

        /* ====== ANIMATIONS ====== */
        @keyframes bounce {
          0%, 100% { transform: translateX(-50%) translateY(0); opacity: 1; }
          50% { transform: translateX(-50%) translateY(12px); opacity: 0.3; }
        }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }

        /* ====== RESPONSIVE — TABLET ====== */
        @media (max-width: 1024px) {
          .lp-nav { padding: 12px 16px; }
          .lp-pilar { grid-template-columns: 1fr; gap: 24px; padding: 32px 24px; }
          .lp-pilar--reverse .lp-pilar__text { order: 0; }
          .lp-pilar--reverse .lp-pilar__icon { order: 1; }
          .lp-pilar__orb { width: 140px; height: 140px; font-size: 56px; }
          .lp-section { padding: 60px 16px; }
        }

        /* ====== RESPONSIVE — MOBILE ====== */
        @media (max-width: 768px) {
          .lp-nav__links { display: none; }
          .lp-hamburger { display: flex; }
          .lp-hero__h1 { font-size: clamp(28px, 8vw, 48px); }
          .lp-hero__btns { flex-direction: column; align-items: center; }
          .lp-hero__btns .lp-btn-lg { width: 100%; max-width: 320px; }
          .lp-scroll-indicator { display: none; }
          .lp-stats__grid { gap: 20px; }
          .lp-stats__item { min-width: 60px; }
          .lp-stats__value { font-size: 28px; }
          .lp-pilar { padding: 24px 20px; }
          .lp-pilar__icon { justify-content: center; }
          .lp-pilar__orb { width: 120px; height: 120px; font-size: 48px; }
          .lp-steps { grid-template-columns: 1fr 1fr; }
          .lp-plans { grid-template-columns: 1fr; }
          .lp-testimonials { grid-template-columns: 1fr; }
          .lp-section-header { margin-bottom: 40px; }
          .lp-cta-final__box { padding: 36px 20px; }
          .lp-badge-pulse { font-size: 10px; padding: 6px 14px; }
        }

        /* ====== RESPONSIVE — SMALL MOBILE ====== */
        @media (max-width: 480px) {
          .lp-steps { grid-template-columns: 1fr; }
          .lp-hero__h1 { font-size: 28px; }
          .lp-pilar__stats { flex-direction: column; }
        }
      `}</style>
    </div>
  );
}
