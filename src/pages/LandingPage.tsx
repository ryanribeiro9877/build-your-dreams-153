import { lazy, Suspense, useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Crown, CheckCircle2, Coffee,
  Shield, Lock,
  ArrowRight, Menu, X,
  Plus, Minus,
} from "lucide-react";
import { trackEvent, onCtaClick } from "@/lib/tracking";
import "@/styles/landing.css";
import {
  CASOS_DE_USO, FAQ, PILARES, FLUXO, SEGURANCA,
  TESTIMONIALS, STATS_BANNER, PLANOS,
} from "@/pages/landing/data";

const HumanCommandScene3D = lazy(() => import("@/components/HumanCommandScene3D"));

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
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Track initial landing page view (once per session per path).
  useEffect(() => {
    trackEvent("page_view", { section: "landing" });
  }, []);

  // Track when key sections come into view.
  useEffect(() => {
    const seen = new Set<string>();
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          const id = (e.target as HTMLElement).id;
          if (e.isIntersecting && id && !seen.has(id)) {
            seen.add(id);
            trackEvent("section_view", { section: id });
          }
        });
      },
      { threshold: 0.4 }
    );
    document.querySelectorAll("section[id]").forEach((s) => obs.observe(s));
    return () => obs.disconnect();
  }, []);

  /** Centralized handler for every CTA — tracks then navigates. */
  const goToAuth = (ctaId: string, ctaLabel: string, section: string) => {
    onCtaClick(ctaId, ctaLabel, section, "/auth");
    navigate("/auth");
  };

  const toggleFaq = (i: number) => {
    const next = openFaq === i ? null : i;
    setOpenFaq(next);
    if (next !== null) {
      trackEvent("faq_open", { section: "faq", cta_id: `faq_${i}`, cta_label: FAQ[i].q });
    }
  };


  return (
    <div className="lf-root">

      {/* ═══════ NAVBAR ═══════ */}
      <nav className={`lf-nav ${scrollY > 50 ? "lf-nav--scrolled" : ""}`}>
        <div className="lf-nav__brand">
          <div className="lf-nav__logo" aria-hidden="true">J</div>
          <div className="lf-nav__name-wrap">
            <span className="lf-nav__name">JurisAI</span>
            <span className="lf-nav__tagline">Você comanda</span>
          </div>
        </div>

        <div className="lf-nav__links">
          <a href="#fluxo">Como funciona</a>
          <a href="#casos">Casos de uso</a>
          <a href="#seguranca">Segurança</a>
          <a href="#faq">FAQ</a>
          <a href="#planos">Planos</a>
          <button
            className="lf-btn-primary lf-btn-sm"
            onClick={() => goToAuth("nav_primary", "Assumir o comando", "navbar")}
          >
            Assumir o comando
            <ArrowRight size={14} />
          </button>
        </div>

        <button className="lf-hamburger" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Menu">
          {mobileMenu ? <X size={24} /> : <Menu size={24} />}
        </button>
      </nav>

      {mobileMenu && (
        <div className="lf-mobile-menu" onClick={() => setMobileMenu(false)}>
          <div className="lf-mobile-menu__inner" onClick={e => e.stopPropagation()}>
            <a href="#fluxo" onClick={() => setMobileMenu(false)}>Como funciona</a>
            <a href="#casos" onClick={() => setMobileMenu(false)}>Casos de uso</a>
            <a href="#seguranca" onClick={() => setMobileMenu(false)}>Segurança</a>
            <a href="#faq" onClick={() => setMobileMenu(false)}>FAQ</a>
            <a href="#planos" onClick={() => setMobileMenu(false)}>Planos</a>
            <button
              className="lf-btn-primary"
              onClick={() => { setMobileMenu(false); goToAuth("mobile_nav_primary", "Assumir o comando", "mobile_menu"); }}
            >
              Assumir o comando
            </button>
          </div>
        </div>
      )}

      {/* ═══════ HERO ═══════ */}
      <section className="lf-hero">
        <div className="lf-hero__3d">
          <Suspense fallback={<div className="lf-hero__3d-fallback" />}>
            <HumanCommandScene3D />
          </Suspense>
        </div>
        <div className="lf-hero__vignette" />
        <div className="lf-hero__grain" />

        <div className="lf-hero__content">
          <div className="lf-hero__badge">
            <span className="lf-hero__badge-dot" />
            <span>SUA FORÇA DE IA JURÍDICA · ATIVA 24/7</span>
          </div>

          <h1 className="lf-hero__h1">
            <span className="lf-hero__h1-line">Seus agentes preparam.</span>
            <span className="lf-hero__h1-line lf-gradient-text">Você decide.</span>
          </h1>

          <p className="lf-hero__sub">
            Uma força de <strong>91+ agentes de IA jurídica</strong> que auxilia em pesquisa, redação, cálculos e monitoramento processual.{" "}
            <strong className="lf-gradient-text">A análise técnica e a decisão final permanecem com o advogado responsável.</strong>
          </p>

          <div className="lf-hero__btns">
            <button
              className="lf-btn-primary lf-btn-lg"
              onClick={() => goToAuth("hero_primary", "Assumir o comando", "hero")}
            >
              <Crown size={18} />
              Assumir o comando
              <ArrowRight size={18} />
            </button>
            <button
              className="lf-btn-ghost lf-btn-lg"
              onClick={() => {
                onCtaClick("hero_secondary", "Ver como funciona", "hero", "#fluxo");
                document.getElementById("fluxo")?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              Ver como funciona
            </button>
          </div>

          <div className="lf-hero__trust">
            <div className="lf-hero__trust-item">
              <Shield size={14} /> LGPD & OAB
            </div>
            <div className="lf-hero__trust-divider" />
            <div className="lf-hero__trust-item">
              <CheckCircle2 size={14} /> Você aprova tudo
            </div>
            <div className="lf-hero__trust-divider" />
            <div className="lf-hero__trust-item">
              <Lock size={14} /> Dados criptografados
            </div>
          </div>
        </div>
      </section>

      {/* ═══════ STATS TICKER ═══════ */}
      <section className="lf-stats">
        <div className="lf-stats__grid">
          {STATS_BANNER.map(({ value, label, Icon }) => (
            <div key={label} className="lf-stats__item">
              <Icon size={18} className="lf-stats__icon" />
              <div className="lf-stats__value"><AnimatedCounter value={value} /></div>
              <div className="lf-stats__label">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════ COMO FUNCIONA — 3 PASSOS CLAROS ═══════ */}
      <section id="fluxo" className="lf-section">
        <div className="lf-container lf-container--narrow">
          <div className="lf-section-header">
            <div className="lf-tag">COMO FUNCIONA</div>
            <h2 className="lf-section-title">
              Três passos. <span className="lf-gradient-text">Você no controle.</span>
            </h2>
            <p className="lf-section-sub">
              Sem código. Sem formulários. Sem complicação. Você fala — o agente executa — você aprova.
            </p>
          </div>

          <div className="lf-fluxo">
            {FLUXO.map((s, i) => (
              <div key={s.step} className="lf-fluxo__item" style={{ "--accent": s.color } as React.CSSProperties}>
                <div className="lf-fluxo__step">{s.step}</div>
                <div className="lf-fluxo__icon-wrap">
                  <s.Icon size={28} strokeWidth={1.8} />
                </div>
                <h3 className="lf-fluxo__title">{s.title}</h3>
                <p className="lf-fluxo__desc">{s.desc}</p>
                {i < FLUXO.length - 1 && <div className="lf-fluxo__connector"><ArrowRight size={20} /></div>}
              </div>
            ))}
          </div>

          <div className="lf-fluxo__footer">
            <div className="lf-fluxo__footer-icon">
              <Coffee size={24} />
            </div>
            <p>
              <strong>E você?</strong> Recupera seu tempo. Janta com a família. Foca no que só humano pode fazer:
              estratégia, relacionamento e decisão.
            </p>
          </div>
        </div>
      </section>

      {/* ═══════ PILARES ═══════ */}
      <section id="pilares" className="lf-section lf-section--alt">
        <div className="lf-container">
          <div className="lf-section-header">
            <div className="lf-tag">A NOVA ORDEM</div>
            <h2 className="lf-section-title">
              Você no comando.<br />
              <span className="lf-gradient-text">Eles no trabalho pesado.</span>
            </h2>
          </div>

          <div className="lf-pilares">
            {PILARES.map((p, i) => (
              <div
                key={p.tag}
                className={`lf-pilar ${i % 2 !== 0 ? "lf-pilar--reverse" : ""}`}
                style={{ "--accent": p.accent } as React.CSSProperties}
              >
                <div className="lf-pilar__glow" />
                <div className="lf-pilar__text">
                  <div className="lf-pilar__tag">{p.tag}</div>
                  <h3 className="lf-pilar__title">{p.title}</h3>
                  <p className="lf-pilar__desc">{p.desc}</p>
                  <div className="lf-pilar__stats">
                    {p.stats.map(s => (
                      <div key={s.label} className="lf-pilar__stat">
                        <div className="lf-pilar__stat-value">{s.value}</div>
                        <div className="lf-pilar__stat-label">{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="lf-pilar__visual">
                  <div className="lf-pilar__orb">
                    <p.Icon size={56} strokeWidth={1.5} />
                  </div>
                  <div className="lf-pilar__rings">
                    <div className="lf-pilar__ring lf-pilar__ring--1" />
                    <div className="lf-pilar__ring lf-pilar__ring--2" />
                    <div className="lf-pilar__ring lf-pilar__ring--3" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════ CASOS DE USO ═══════ */}
      <section id="casos" className="lf-section">
        <div className="lf-container">
          <div className="lf-section-header">
            <div className="lf-tag">ESTUDOS DE CASO</div>
            <h2 className="lf-section-title">
              Resultados reais.<br />
              <span className="lf-gradient-text">Por tipo de processo.</span>
            </h2>
            <p className="lf-section-sub">
              Três escritórios. Três realidades diferentes. Mesma transformação:
              o humano deixou de executar e passou a comandar.
            </p>
          </div>

          <div className="lf-casos">
            {CASOS_DE_USO.map((c) => (
              <article
                key={c.badge}
                className="lf-caso"
                style={{ "--accent": c.accent } as React.CSSProperties}
              >
                <header className="lf-caso__head">
                  <div className="lf-caso__icon">
                    <c.Icon size={22} strokeWidth={1.8} />
                  </div>
                  <span className="lf-caso__badge">{c.badge}</span>
                </header>

                <h3 className="lf-caso__title">{c.title}</h3>

                <div className="lf-caso__block">
                  <span className="lf-caso__label">Desafio</span>
                  <p>{c.challenge}</p>
                </div>
                <div className="lf-caso__block">
                  <span className="lf-caso__label">Solução JurisAI</span>
                  <p>{c.solution}</p>
                </div>

                <div className="lf-caso__metrics">
                  {c.metrics.map((m) => (
                    <div key={m.label} className="lf-caso__metric">
                      <div className="lf-caso__metric-value">{m.value}</div>
                      <div className="lf-caso__metric-label">{m.label}</div>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════ SEGURANÇA & CONTROLE ═══════ */}
      <section id="seguranca" className="lf-section">
        <div className="lf-container">
          <div className="lf-section-header">
            <div className="lf-tag">SEGURANÇA & CONTROLE</div>
            <h2 className="lf-section-title">
              IA poderosa. <span className="lf-gradient-text">Decisão sempre humana.</span>
            </h2>
            <p className="lf-section-sub">
              Você não terceiriza decisões. Você terceiriza execução. Cada ação importante passa pela sua aprovação.
            </p>
          </div>

          <div className="lf-seguranca">
            {SEGURANCA.map(s => (
              <div key={s.title} className="lf-seguranca__item">
                <div className="lf-seguranca__icon">
                  <s.Icon size={22} strokeWidth={1.8} />
                </div>
                <h3 className="lf-seguranca__title">{s.title}</h3>
                <p className="lf-seguranca__desc">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════ FAQ — SEGURANÇA & CONTROLE ═══════ */}
      <section id="faq" className="lf-section lf-section--alt">
        <div className="lf-container lf-container--narrow">
          <div className="lf-section-header">
            <div className="lf-tag">PERGUNTAS FREQUENTES</div>
            <h2 className="lf-section-title">
              Tudo que você quer saber sobre<br />
              <span className="lf-gradient-text">segurança e controle.</span>
            </h2>
            <p className="lf-section-sub">
              LGPD, OAB, auditoria, aprovação humana. As respostas que importam antes de assinar.
            </p>
          </div>

          <div className="lf-faq">
            {FAQ.map((item, i) => {
              const isOpen = openFaq === i;
              return (
                <div key={item.q} className={`lf-faq__item ${isOpen ? "lf-faq__item--open" : ""}`}>
                  <button
                    type="button"
                    className="lf-faq__q"
                    onClick={() => toggleFaq(i)}
                    aria-expanded={isOpen}
                    aria-controls={`faq-${i}`}
                  >
                    <span>{item.q}</span>
                    <span className="lf-faq__icon" aria-hidden>
                      {isOpen ? <Minus size={18} /> : <Plus size={18} />}
                    </span>
                  </button>
                  <div
                    id={`faq-${i}`}
                    className="lf-faq__a"
                    role="region"
                    aria-hidden={!isOpen}
                  >
                    <p>{item.a}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="lf-faq__footer">
            <Shield size={18} />
            <p>
              Tem outra dúvida sobre segurança ou compliance?{" "}
              <button
                type="button"
                className="lf-faq__contact"
                onClick={() => goToAuth("faq_contact", "Falar com nosso time", "faq")}
              >
                Falar com nosso time →
              </button>
            </p>
          </div>
        </div>
      </section>

      {/* ═══════ PLANOS ═══════ */}
      <section id="planos" className="lf-section lf-section--alt">
        <div className="lf-container">
          <div className="lf-section-header">
            <div className="lf-tag">SUA FORÇA DE TRABALHO</div>
            <h2 className="lf-section-title">
              Quantos agentes<br /><span className="lf-gradient-text">vão trabalhar para você?</span>
            </h2>
          </div>

          <div className="lf-plans">
            {PLANOS.map((plan) => (
              <div key={plan.name} className={`lf-plan ${plan.highlight ? "lf-plan--highlight" : ""}`}>
                {plan.highlight && <div className="lf-plan__badge">MAIS POPULAR</div>}
                <h3 className="lf-plan__name">{plan.name}</h3>
                <p className="lf-plan__desc">{plan.desc}</p>
                <div className="lf-plan__price">
                  {plan.price !== "Sob consulta" ? (
                    <>
                      <span className="lf-plan__currency">R$</span>
                      <span className="lf-plan__amount">{plan.price}</span>
                      <span className="lf-plan__period">/mês</span>
                    </>
                  ) : (
                    <span className="lf-plan__amount lf-plan__amount--custom">{plan.price}</span>
                  )}
                </div>
                <ul className="lf-plan__features">
                  {plan.features.map(f => (
                    <li key={f}>
                      <CheckCircle2 size={14} className="lf-plan__check" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <button
                  className={plan.highlight ? "lf-btn-primary lf-btn-full" : "lf-btn-ghost lf-btn-full"}
                  onClick={() => goToAuth(`plan_${plan.name.toLowerCase()}`, plan.cta, "planos")}
                >{plan.cta}</button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════ DEPOIMENTOS ═══════ */}
      <section className="lf-section">
        <div className="lf-container">
          <div className="lf-section-header">
            <div className="lf-tag">QUEM JÁ COMANDA</div>
            <h2 className="lf-section-title">
              Advogados que pararam de executar<br />
              <span className="lf-gradient-text">e começaram a comandar</span>
            </h2>
          </div>

          <div className="lf-testimonials">
            {TESTIMONIALS.map((t) => (
              <div key={t.name} className="lf-testimonial">
                <div className="lf-testimonial__metric">{t.metric}</div>
                <p className="lf-testimonial__text">"{t.text}"</p>
                <div className="lf-testimonial__author">
                  <div className="lf-testimonial__avatar">{t.initial}</div>
                  <div>
                    <div className="lf-testimonial__name">{t.name}</div>
                    <div className="lf-testimonial__role">{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════ CTA FINAL ═══════ */}
      <section className="lf-cta-final">
        <div className="lf-cta-final__glow" />
        <div className="lf-cta-final__box">
          <div className="lf-cta-final__icon">
            <Crown size={32} strokeWidth={1.8} />
          </div>
          <h2 className="lf-cta-final__title">
            Conheça a plataforma <span className="lf-gradient-text">JurisAI</span>.
          </h2>
          <p className="lf-cta-final__sub">
            Uma ferramenta de produtividade para o profissional do Direito.{" "}
            <strong>A decisão técnica e a responsabilidade profissional permanecem do advogado</strong>.
          </p>
          <button
            className="lf-btn-primary lf-btn-lg"
            onClick={() => {
              trackEvent("cta_conversion", { cta_id: "cta_final", cta_label: "Assumir o comando agora", section: "cta_final" });
              goToAuth("cta_final", "Assumir o comando agora", "cta_final");
            }}
          >
            <Crown size={18} />
            Assumir o comando agora
            <ArrowRight size={18} />
          </button>
          <div className="lf-cta-final__notes">
            <span><CheckCircle2 size={12} /> Sem cartão de crédito</span>
            <span><CheckCircle2 size={12} /> Setup em 2 minutos</span>
            <span><CheckCircle2 size={12} /> Cancele quando quiser</span>
          </div>
        </div>
      </section>

      {/* ═══════ FOOTER ═══════ */}
      <footer className="lf-footer">
        <div className="lf-footer__brand">
          <div className="lf-footer__logo" aria-hidden="true">J</div>
          <span>JurisAI</span>
        </div>
        <p className="lf-footer__copy">
          © {new Date().getFullYear()} JurisAI — Sua força de trabalho de IA jurídica.
          <br />
          <strong>Você comanda. Eles executam.</strong>
        </p>
      </footer>

    </div>
  );
}
