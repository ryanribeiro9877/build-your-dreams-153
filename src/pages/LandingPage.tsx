import { lazy, Suspense, useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Brain, Zap, Crown, MessageSquare, CheckCircle2, Coffee,
  Shield, Lock, Eye, Clock, TrendingUp, Sparkles,
  ArrowRight, Menu, X, Scale, Award, FileCheck, Bot,
  Briefcase, Gavel, Building2, Plus, Minus,
} from "lucide-react";
import { trackEvent, onCtaClick } from "@/lib/tracking";

const HumanCommandScene3D = lazy(() => import("@/components/HumanCommandScene3D"));

const CASOS_DE_USO = [
  {
    Icon: Briefcase,
    badge: "TRABALHISTA",
    title: "Escritório trabalhista — 12 advogados",
    challenge: "Equipe gastava 60% do tempo em cálculos de rescisão e petições iniciais repetitivas.",
    solution: "Calculista IA + Redator de Iniciais assumiram a base operacional. Advogados passaram a apenas revisar e assinar.",
    metrics: [
      { value: "+340%", label: "Petições/mês" },
      { value: "−72%", label: "Tempo por caso" },
      { value: "R$ 180k", label: "Economia anual" },
    ],
    accent: "#06b6d4",
  },
  {
    Icon: Gavel,
    badge: "CÍVEL & CONSUMIDOR",
    title: "Banca de massa — 45 mil processos ativos",
    challenge: "Impossível monitorar manualmente prazos, audiências e despachos em volume tão grande.",
    solution: "Monitor de Prazos + Agente de Andamentos vigiam 24/7. Alertas só sobem quando há ação humana necessária.",
    metrics: [
      { value: "0", label: "Prazos perdidos em 6 meses" },
      { value: "−85%", label: "Carga do gerente" },
      { value: "3.2x", label: "Mais audiências cobertas" },
    ],
    accent: "#8b5cf6",
  },
  {
    Icon: Building2,
    badge: "CORPORATIVO",
    title: "Departamento jurídico interno — Fintech",
    challenge: "Diretora jurídica afogada em revisão de contratos e pareceres de compliance.",
    solution: "Agente Revisor + Compliance IA analisam contratos em minutos. Diretora valida apenas pontos críticos.",
    metrics: [
      { value: "12 min", label: "Revisão média (era 3h)" },
      { value: "+5x", label: "Contratos analisados/dia" },
      { value: "100%", label: "Conformidade LGPD" },
    ],
    accent: "#c9a84c",
  },
];

const FAQ = [
  {
    q: "Quem toma a decisão final — eu ou a IA?",
    a: "Sempre você. Os agentes preparam tudo (peças, cálculos, comunicações), mas nada é protocolado, enviado ou assinado sem sua aprovação explícita. Você é o comandante; eles são executores.",
  },
  {
    q: "Como vocês garantem conformidade com a LGPD?",
    a: "Dados criptografados em trânsito (TLS 1.3) e em repouso (AES-256). Servidores em território brasileiro. Você é o controlador dos dados; nós somos operadores. Não usamos os dados dos seus clientes para treinar modelos públicos. Contrato de Operação de Dados (DPA) disponível para todos os planos.",
  },
  {
    q: "E o sigilo profissional da OAB? Os agentes têm acesso aos meus processos?",
    a: "Os agentes operam dentro do seu ambiente isolado. Cada escritório tem dados completamente segregados. Apenas seus usuários autorizados acessam. Logs de auditoria registram cada acesso de cada agente, com timestamp e contexto — você prova compliance a qualquer momento.",
  },
  {
    q: "Como funciona a auditoria das ações dos agentes?",
    a: "Cada ação executada pelos agentes (consulta de jurisprudência, redação, cálculo, envio de email, protocolo) é registrada em log imutável com data, hora, usuário que comandou, agente executor e resultado. Você exporta o relatório de auditoria a qualquer momento — útil para corregedoria e clientes corporativos.",
  },
  {
    q: "O que acontece se um agente cometer um erro?",
    a: "Como nada vai para fora sem sua aprovação, erros ficam contidos na fase de revisão — onde você corrige antes de assinar. Além disso, agentes revisores cruzam o trabalho dos executores: é uma cadeia humano-IA-IA-humano. Cada peça passa por dois pares de olhos digitais antes do seu.",
  },
  {
    q: "Posso desligar agentes ou limitar o que eles fazem?",
    a: "Sim — controle granular total. Você define quais agentes atuam em quais departamentos, quais tarefas eles podem executar e quais exigem aprovação dupla. Configurável por usuário, por papel e por tipo de processo, a qualquer momento.",
  },
  {
    q: "Meus clientes vão saber que estou usando IA?",
    a: "Isso é decisão sua. A IA é seu instrumento de trabalho, igual ao Word ou ao sistema do TJ. Você pode mencionar ou não — assim como não comunica que usou Google Acadêmico para pesquisar jurisprudência. Recomendamos transparência em casos onde a IA gera conteúdo enviado diretamente ao cliente.",
  },
  {
    q: "Preciso assinar contrato longo? Posso cancelar?",
    a: "Não. Cobrança mensal, sem fidelidade. Cancelamento em 1 clique no painel. Seus dados ficam disponíveis para exportação por 30 dias após o cancelamento — você sai com tudo que entrou.",
  },
];

const PILARES = [
  {
    Icon: Brain,
    tag: "VOCÊ É O ESTRATEGISTA",
    title: "Você pensa. Eles executam.",
    desc: "Chega de afogar advogados em tarefas repetitivas. Você define o caso, a estratégia e o resultado esperado — sua força de IA cuida de petições, prazos, cálculos, protocolos e comunicação. Seu tempo volta a ser seu.",
    stats: [
      { value: "8h", label: "devolvidas por dia" },
      { value: "0", label: "tarefas operacionais" },
    ],
    accent: "#06b6d4",
  },
  {
    Icon: Bot,
    tag: "SUA EQUIPE INVISÍVEL",
    title: "91 agentes. Trabalhando para você. Sempre.",
    desc: "Enquanto você dorme, janta com a família ou descansa, sua força de IA está protocolando, calculando, redigindo e monitorando prazos. Eles não cansam, não esquecem, não pedem férias. Você comanda — eles entregam.",
    stats: [
      { value: "24/7", label: "ativos por você" },
      { value: "91+", label: "agentes ao seu serviço" },
    ],
    accent: "#8b5cf6",
  },
  {
    Icon: Crown,
    tag: "VOCÊ NO COMANDO",
    title: "Você dá a ordem. O resultado chega pronto.",
    desc: "Cada decisão importante volta para suas mãos com tudo preparado: análise feita, peça redigida, cálculo conferido. Você só aprova e assina. Pare de executar tarefas — comece a comandar resultados.",
    stats: [
      { value: "3x", label: "mais clientes atendidos" },
      { value: "100%", label: "decisão sua" },
    ],
    accent: "#c9a84c",
  },
];

const FLUXO = [
  {
    step: "01",
    Icon: MessageSquare,
    title: "Você define o objetivo",
    desc: "Em linguagem natural: \"Faça a inicial trabalhista do cliente Silva\". Sem formulários, sem códigos. Como falar com um chefe de gabinete de elite.",
    color: "#06b6d4",
  },
  {
    step: "02",
    Icon: Zap,
    title: "O agente executa",
    desc: "A IA certa é mobilizada. Consulta jurisprudência, redige, calcula valores, prepara protocolo. Outros agentes revisam. Tudo em minutos.",
    color: "#8b5cf6",
  },
  {
    step: "03",
    Icon: FileCheck,
    title: "Você aprova e assina",
    desc: "O resultado chega pronto para sua revisão. Você lê, ajusta se quiser, e aprova com um clique. A decisão final é sempre sua.",
    color: "#c9a84c",
  },
];

const SEGURANCA = [
  {
    Icon: Shield,
    title: "Você sempre tem a última palavra",
    desc: "Nenhuma peça é protocolada, nenhum email é enviado, nenhum acordo é fechado sem sua aprovação explícita. O agente prepara — você decide.",
  },
  {
    Icon: Lock,
    title: "Sigilo profissional garantido",
    desc: "Dados criptografados em trânsito e em repouso. Conformidade com LGPD e OAB. Seus clientes nunca aparecem em treinamentos de IA.",
  },
  {
    Icon: Eye,
    title: "Tudo auditável e rastreável",
    desc: "Cada ação do agente fica registrada com data, hora e contexto. Você vê quem fez o quê, quando e por quê. Total transparência.",
  },
  {
    Icon: Award,
    title: "Resultados práticos, não promessas",
    desc: "Petições prontas em minutos. Cálculos conferidos por IA. Prazos monitorados 24/7. Resultados mensuráveis desde o primeiro dia.",
  },
];

const TESTIMONIALS = [
  {
    name: "Dr. Marcos Oliveira",
    role: "Sócio Fundador — Oliveira & Associados",
    text: "Antes eu trabalhava 14h por dia. Hoje saio às 18h e meus agentes continuam protocolando peças. Voltei a jantar com minha família.",
    initial: "MO",
    metric: "8h/dia recuperadas",
  },
  {
    name: "Dra. Ana Carolina Souza",
    role: "Diretora Jurídica — TechLaw SP",
    text: "Eu não executo mais nada operacional. Minha função virou estratégica: defino, aprovo, assino. Os agentes fazem o resto. Triplicamos a banca em 6 meses.",
    initial: "AS",
    metric: "0 tarefas operacionais",
  },
  {
    name: "Dr. Rafael Lima",
    role: "Advogado Trabalhista — Lima Advocacia",
    text: "É como ter 90 estagiários de elite que nunca dormem. Eu só comando. Eles entregam tudo pronto para minha assinatura. Inacreditável.",
    initial: "RL",
    metric: "3x mais casos por mês",
  },
];

const STATS_BANNER = [
  { value: "91+", label: "Agentes ao seu serviço", Icon: Bot },
  { value: "8h", label: "Devolvidas por dia", Icon: Clock },
  { value: "3x", label: "Mais casos atendidos", Icon: TrendingUp },
  { value: "24/7", label: "Trabalhando por você", Icon: Sparkles },
  { value: "100%", label: "Controle humano", Icon: Shield },
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
    cta: "Começar grátis",
  },
  {
    name: "Professional",
    price: "697",
    desc: "Para escritórios que querem escalar",
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
    cta: "Assumir o comando",
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
    cta: "Falar com consultor",
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

  /** Centralized handler for every CTA → tracks then navigates. */
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
          <div className="lf-nav__logo">
            <Scale size={18} strokeWidth={2.5} />
          </div>
          <div className="lf-nav__name-wrap">
            <span className="lf-nav__name">LexForce</span>
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
            <span className="lf-hero__h1-line">Seus agentes trabalham.</span>
            <span className="lf-hero__h1-line lf-gradient-text">Você decide.</span>
          </h1>

          <p className="lf-hero__sub">
            Pare de executar. Comece a <strong>comandar</strong>. Uma força de{" "}
            <strong>91+ agentes de IA jurídica</strong> que protocola, redige, calcula e monitora —{" "}
            <strong className="lf-gradient-text">enquanto você vive sua vida</strong>.
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
                  <span className="lf-caso__label">Solução LexForce</span>
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
            Está na hora de <span className="lf-gradient-text">comandar</span>.
          </h2>
          <p className="lf-cta-final__sub">
            Você é advogado, não operador. Deixe sua força de IA executar — e{" "}
            <strong>recupere seu tempo, sua família e seu lucro</strong>.
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
          <div className="lf-footer__logo"><Scale size={16} strokeWidth={2.5} /></div>
          <span>LexForce</span>
        </div>
        <p className="lf-footer__copy">
          © {new Date().getFullYear()} LexForce — Sua força de trabalho de IA jurídica.
          <br />
          <strong>Você comanda. Eles executam.</strong>
        </p>
      </footer>

      <style>{`
        /* ════════════════════════════════════════
           LEXFORCE — LANDING PAGE DESIGN SYSTEM
           Identidade: futurístico, premium, humano-cêntrico
           Paleta: ouro champagne sobre noir profundo
           Tipografia: Cormorant (heads) + Inter (body)
        ════════════════════════════════════════ */

        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Inter:wght@400;500;600;700;800;900&display=swap');

        /* ───── BASE ───── */
        .lf-root {
          min-height: 100vh;
          background: #060610;
          color: #e8e5d4;
          font-family: 'Inter', sans-serif;
          overflow-x: hidden;
          font-feature-settings: "ss01", "cv11";
        }
        .lf-root * { box-sizing: border-box; }

        /* ───── TOKENS ───── */
        .lf-gradient-text {
          background: linear-gradient(135deg, #c9a84c 0%, #f0d97a 35%, #e8c96a 65%, #c9a84c 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          filter: drop-shadow(0 0 28px rgba(201,168,76,0.25));
        }
        .lf-tag {
          display: inline-block;
          padding: 6px 16px;
          border-radius: 100px;
          font-size: 11px;
          background: rgba(201,168,76,0.06);
          border: 1px solid rgba(201,168,76,0.18);
          color: #c9a84c;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.18em;
          margin-bottom: 20px;
        }
        .lf-section-header {
          text-align: center;
          margin-bottom: 64px;
        }
        .lf-section-title {
          font-family: 'Cormorant Garamond', serif;
          font-size: clamp(32px, 5.5vw, 56px);
          font-weight: 600;
          margin: 0;
          line-height: 1.1;
          color: #f0ead6;
          letter-spacing: -0.02em;
        }
        .lf-section-sub {
          margin: 20px auto 0;
          max-width: 580px;
          color: #94a3b8;
          font-size: 16px;
          line-height: 1.7;
        }
        .lf-container { max-width: 1240px; margin: 0 auto; padding: 0 24px; }
        .lf-container--narrow { max-width: 1080px; }
        .lf-section { padding: 100px 0; position: relative; }
        .lf-section--alt {
          background:
            radial-gradient(ellipse at top, rgba(201,168,76,0.025), transparent 60%),
            #07070f;
        }

        /* ───── BUTTONS ───── */
        .lf-btn-primary {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: linear-gradient(135deg, #d4b157 0%, #b8932f 100%);
          border: none;
          color: #060610;
          border-radius: 100px;
          padding: 13px 28px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 700;
          font-family: 'Inter', sans-serif;
          letter-spacing: 0.01em;
          box-shadow: 0 8px 32px rgba(201,168,76,0.28), inset 0 1px 0 rgba(255,255,255,0.2);
          transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
          white-space: nowrap;
        }
        .lf-btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 40px rgba(201,168,76,0.45), inset 0 1px 0 rgba(255,255,255,0.3);
        }
        .lf-btn-ghost {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(232,229,212,0.15);
          color: #e8e5d4;
          border-radius: 100px;
          padding: 13px 28px;
          font-size: 14px;
          font-weight: 600;
          font-family: 'Inter', sans-serif;
          cursor: pointer;
          transition: all 0.3s;
          backdrop-filter: blur(8px);
        }
        .lf-btn-ghost:hover {
          background: rgba(201,168,76,0.06);
          border-color: rgba(201,168,76,0.35);
          color: #c9a84c;
        }
        .lf-btn-sm { padding: 10px 22px; font-size: 13px; }
        .lf-btn-lg { padding: 16px 36px; font-size: 15px; }
        .lf-btn-full { width: 100%; justify-content: center; }

        /* ───── NAVBAR ───── */
        .lf-nav {
          position: fixed;
          top: 0; left: 0; right: 0;
          z-index: 100;
          padding: 18px 24px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          transition: all 0.4s;
        }
        .lf-nav--scrolled {
          background: rgba(6,6,16,0.85);
          backdrop-filter: blur(28px) saturate(140%);
          border-bottom: 1px solid rgba(201,168,76,0.1);
          padding: 12px 24px;
        }
        .lf-nav__brand { display: flex; align-items: center; gap: 12px; }
        .lf-nav__logo {
          width: 38px; height: 38px;
          border-radius: 12px;
          background: linear-gradient(135deg, #d4b157, #a8872e);
          display: flex; align-items: center; justify-content: center;
          color: #060610;
          box-shadow: 0 6px 20px rgba(201,168,76,0.3);
        }
        .lf-nav__name-wrap { display: flex; flex-direction: column; line-height: 1; }
        .lf-nav__name {
          font-family: 'Cormorant Garamond', serif;
          font-size: 22px;
          font-weight: 700;
          color: #e8e5d4;
          letter-spacing: 0.01em;
        }
        .lf-nav__tagline {
          font-size: 9px;
          color: #c9a84c;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          margin-top: 2px;
          font-weight: 600;
        }
        .lf-nav__links { display: flex; align-items: center; gap: 28px; }
        .lf-nav__links a {
          color: #94a3b8;
          font-size: 14px;
          text-decoration: none;
          font-weight: 500;
          transition: color 0.2s;
        }
        .lf-nav__links a:hover { color: #c9a84c; }
        .lf-hamburger {
          display: none;
          background: none;
          border: 1px solid rgba(201,168,76,0.2);
          border-radius: 10px;
          color: #c9a84c;
          cursor: pointer;
          padding: 8px;
        }

        /* ───── MOBILE MENU ───── */
        .lf-mobile-menu {
          position: fixed;
          inset: 0;
          z-index: 200;
          background: rgba(0,0,0,0.85);
          backdrop-filter: blur(16px);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .lf-mobile-menu__inner {
          display: flex;
          flex-direction: column;
          gap: 14px;
          text-align: center;
          padding: 40px;
          background: rgba(15,15,25,0.95);
          border-radius: 24px;
          border: 1px solid rgba(201,168,76,0.15);
          min-width: 290px;
        }
        .lf-mobile-menu__inner a {
          color: #e8e5d4;
          font-size: 17px;
          font-weight: 600;
          text-decoration: none;
          padding: 12px;
          border-radius: 12px;
          transition: background 0.2s;
        }
        .lf-mobile-menu__inner a:hover { background: rgba(201,168,76,0.1); }

        /* ───── HERO ───── */
        .lf-hero {
          position: relative;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }
        .lf-hero__3d {
          position: absolute;
          inset: 0;
          opacity: 0.85;
        }
        .lf-hero__3d-fallback {
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse at center, rgba(201,168,76,0.1), transparent 60%);
        }
        .lf-hero__vignette {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(ellipse at 50% 50%, transparent 30%, #060610 85%),
            linear-gradient(180deg, rgba(6,6,16,0.4) 0%, transparent 25%, transparent 70%, #060610 100%);
          pointer-events: none;
        }
        .lf-hero__grain {
          position: absolute;
          inset: 0;
          opacity: 0.04;
          pointer-events: none;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)'/%3E%3C/svg%3E");
        }
        .lf-hero__content {
          position: relative;
          z-index: 10;
          text-align: center;
          max-width: 920px;
          padding: 100px 24px 60px;
        }
        .lf-hero__badge {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 32px;
          padding: 8px 20px;
          border-radius: 100px;
          font-size: 11px;
          font-weight: 600;
          background: rgba(201,168,76,0.06);
          border: 1px solid rgba(201,168,76,0.22);
          color: #c9a84c;
          letter-spacing: 0.15em;
          backdrop-filter: blur(12px);
          animation: lf-pulse-soft 3s ease-in-out infinite;
        }
        .lf-hero__badge-dot {
          width: 8px; height: 8px;
          border-radius: 50%;
          background: #22c55e;
          box-shadow: 0 0 14px #22c55e;
          animation: lf-pulse-dot 1.5s ease-in-out infinite;
        }
        .lf-hero__h1 {
          font-family: 'Cormorant Garamond', serif;
          font-size: clamp(44px, 9vw, 92px);
          font-weight: 600;
          line-height: 1.0;
          margin: 0 0 28px;
          letter-spacing: -0.025em;
          color: #f0ead6;
        }
        .lf-hero__h1-line {
          display: block;
          opacity: 0;
          transform: translateY(24px);
          animation: lf-rise 0.9s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
        }
        .lf-hero__h1-line:nth-child(2) { animation-delay: 0.15s; }
        .lf-hero__sub {
          font-size: clamp(15px, 2vw, 19px);
          color: #b8bcc8;
          max-width: 640px;
          margin: 0 auto 36px;
          line-height: 1.7;
          font-weight: 400;
          opacity: 0;
          animation: lf-rise 0.9s cubic-bezier(0.2, 0.8, 0.2, 1) 0.4s forwards;
        }
        .lf-hero__sub strong { color: #f0ead6; font-weight: 600; }
        .lf-hero__btns {
          display: flex;
          gap: 14px;
          justify-content: center;
          flex-wrap: wrap;
          opacity: 0;
          animation: lf-rise 0.9s cubic-bezier(0.2, 0.8, 0.2, 1) 0.6s forwards;
        }
        .lf-hero__trust {
          display: flex;
          gap: 24px;
          justify-content: center;
          align-items: center;
          flex-wrap: wrap;
          margin-top: 48px;
          opacity: 0;
          animation: lf-rise 0.9s cubic-bezier(0.2, 0.8, 0.2, 1) 0.8s forwards;
        }
        .lf-hero__trust-item {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: #64748b;
          font-weight: 500;
          letter-spacing: 0.04em;
        }
        .lf-hero__trust-item svg { color: #c9a84c; }
        .lf-hero__trust-divider {
          width: 4px; height: 4px;
          border-radius: 50%;
          background: rgba(201,168,76,0.3);
        }

        /* ───── STATS ───── */
        .lf-stats {
          padding: 48px 24px;
          background:
            linear-gradient(180deg, rgba(201,168,76,0.04) 0%, rgba(201,168,76,0.01) 100%);
          border-top: 1px solid rgba(201,168,76,0.1);
          border-bottom: 1px solid rgba(201,168,76,0.1);
        }
        .lf-stats__grid {
          display: flex;
          justify-content: center;
          gap: 40px;
          flex-wrap: wrap;
          max-width: 1100px;
          margin: 0 auto;
        }
        .lf-stats__item {
          text-align: center;
          min-width: 100px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        }
        .lf-stats__icon {
          color: #c9a84c;
          opacity: 0.7;
        }
        .lf-stats__value {
          font-family: 'Cormorant Garamond', serif;
          font-size: clamp(36px, 5vw, 52px);
          font-weight: 700;
          color: #c9a84c;
          line-height: 1;
        }
        .lf-stats__label {
          font-size: 11px;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          font-weight: 600;
        }

        /* ───── FLUXO ───── */
        .lf-fluxo {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 24px;
          position: relative;
        }
        .lf-fluxo__item {
          --accent: #c9a84c;
          padding: 36px 28px;
          border-radius: 24px;
          background:
            linear-gradient(180deg, rgba(255,255,255,0.025) 0%, rgba(255,255,255,0.01) 100%);
          border: 1px solid rgba(255,255,255,0.06);
          text-align: center;
          position: relative;
          transition: all 0.4s;
        }
        .lf-fluxo__item:hover {
          border-color: color-mix(in srgb, var(--accent) 35%, transparent);
          transform: translateY(-4px);
          box-shadow: 0 20px 50px -20px color-mix(in srgb, var(--accent) 30%, transparent);
        }
        .lf-fluxo__step {
          font-family: 'Cormorant Garamond', serif;
          font-size: 60px;
          font-weight: 700;
          color: var(--accent);
          opacity: 0.2;
          line-height: 1;
          margin-bottom: 8px;
        }
        .lf-fluxo__icon-wrap {
          width: 64px; height: 64px;
          border-radius: 18px;
          margin: 0 auto 20px;
          background: color-mix(in srgb, var(--accent) 12%, transparent);
          border: 1px solid color-mix(in srgb, var(--accent) 25%, transparent);
          color: var(--accent);
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 8px 24px -8px color-mix(in srgb, var(--accent) 30%, transparent);
        }
        .lf-fluxo__title {
          font-family: 'Cormorant Garamond', serif;
          font-size: 22px;
          font-weight: 600;
          color: #f0ead6;
          margin: 0 0 12px;
          letter-spacing: -0.01em;
        }
        .lf-fluxo__desc {
          font-size: 14px;
          color: #94a3b8;
          line-height: 1.7;
          margin: 0;
        }
        .lf-fluxo__connector {
          position: absolute;
          right: -22px;
          top: 50%;
          transform: translateY(-50%);
          width: 32px; height: 32px;
          border-radius: 50%;
          background: #060610;
          border: 1px solid rgba(201,168,76,0.3);
          color: #c9a84c;
          display: flex; align-items: center; justify-content: center;
          z-index: 2;
        }
        .lf-fluxo__footer {
          margin-top: 56px;
          padding: 28px 32px;
          border-radius: 20px;
          background: linear-gradient(135deg, rgba(201,168,76,0.06), rgba(201,168,76,0.02));
          border: 1px solid rgba(201,168,76,0.15);
          display: flex;
          align-items: center;
          gap: 20px;
        }
        .lf-fluxo__footer-icon {
          flex-shrink: 0;
          width: 56px; height: 56px;
          border-radius: 16px;
          background: linear-gradient(135deg, #d4b157, #a8872e);
          color: #060610;
          display: flex; align-items: center; justify-content: center;
        }
        .lf-fluxo__footer p {
          margin: 0;
          color: #b8bcc8;
          font-size: 15px;
          line-height: 1.7;
        }
        .lf-fluxo__footer strong {
          color: #c9a84c;
          font-weight: 700;
        }

        /* ───── PILARES ───── */
        .lf-pilares { display: flex; flex-direction: column; gap: 32px; }
        .lf-pilar {
          --accent: #c9a84c;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 48px;
          align-items: center;
          padding: 56px 48px;
          background: rgba(255,255,255,0.018);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 28px;
          transition: all 0.4s;
          position: relative;
          overflow: hidden;
        }
        .lf-pilar:hover {
          border-color: color-mix(in srgb, var(--accent) 30%, transparent);
        }
        .lf-pilar__glow {
          position: absolute;
          width: 380px; height: 380px;
          border-radius: 50%;
          background: var(--accent);
          filter: blur(140px);
          opacity: 0.12;
          pointer-events: none;
          top: -100px; right: -100px;
        }
        .lf-pilar--reverse .lf-pilar__text { order: 1; }
        .lf-pilar--reverse .lf-pilar__visual { order: 0; }
        .lf-pilar--reverse .lf-pilar__glow { right: auto; left: -100px; }
        .lf-pilar__text { position: relative; z-index: 1; }
        .lf-pilar__tag {
          display: inline-block;
          padding: 5px 14px;
          border-radius: 100px;
          font-size: 10px;
          font-weight: 700;
          color: var(--accent);
          background: color-mix(in srgb, var(--accent) 12%, transparent);
          border: 1px solid color-mix(in srgb, var(--accent) 25%, transparent);
          text-transform: uppercase;
          letter-spacing: 0.16em;
          margin-bottom: 18px;
        }
        .lf-pilar__title {
          font-family: 'Cormorant Garamond', serif;
          font-size: clamp(26px, 3.2vw, 36px);
          font-weight: 600;
          color: #f0ead6;
          margin: 0 0 18px;
          line-height: 1.15;
          letter-spacing: -0.01em;
        }
        .lf-pilar__desc {
          font-size: 15px;
          color: #94a3b8;
          line-height: 1.85;
          margin: 0 0 28px;
        }
        .lf-pilar__stats { display: flex; gap: 16px; flex-wrap: wrap; }
        .lf-pilar__stat {
          padding: 14px 20px;
          background: rgba(255,255,255,0.03);
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.06);
        }
        .lf-pilar__stat-value {
          font-family: 'Cormorant Garamond', serif;
          font-size: 30px;
          font-weight: 700;
          color: var(--accent);
          line-height: 1;
        }
        .lf-pilar__stat-label {
          font-size: 10px;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          font-weight: 600;
          margin-top: 6px;
        }
        .lf-pilar__visual {
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          z-index: 1;
          height: 280px;
        }
        .lf-pilar__orb {
          width: 140px; height: 140px;
          border-radius: 50%;
          background:
            radial-gradient(circle at 30% 30%, color-mix(in srgb, var(--accent) 30%, transparent), color-mix(in srgb, var(--accent) 5%, transparent));
          border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
          color: var(--accent);
          display: flex; align-items: center; justify-content: center;
          box-shadow:
            0 0 80px color-mix(in srgb, var(--accent) 25%, transparent),
            inset 0 2px 10px rgba(255,255,255,0.06);
          position: relative;
          z-index: 2;
        }
        .lf-pilar__rings {
          position: absolute;
          inset: 0;
          display: flex; align-items: center; justify-content: center;
          pointer-events: none;
        }
        .lf-pilar__ring {
          position: absolute;
          border-radius: 50%;
          border: 1px solid color-mix(in srgb, var(--accent) 25%, transparent);
        }
        .lf-pilar__ring--1 { width: 200px; height: 200px; animation: lf-spin 20s linear infinite; }
        .lf-pilar__ring--2 { width: 240px; height: 240px; animation: lf-spin 30s linear infinite reverse; opacity: 0.6; }
        .lf-pilar__ring--3 { width: 280px; height: 280px; animation: lf-spin 40s linear infinite; opacity: 0.3; }

        /* ───── SEGURANÇA ───── */
        .lf-seguranca {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 20px;
        }
        .lf-seguranca__item {
          padding: 32px;
          border-radius: 20px;
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.06);
          transition: all 0.3s;
          display: flex;
          gap: 20px;
          align-items: flex-start;
        }
        .lf-seguranca__item:hover {
          border-color: rgba(201,168,76,0.25);
          transform: translateY(-3px);
        }
        .lf-seguranca__icon {
          flex-shrink: 0;
          width: 48px; height: 48px;
          border-radius: 14px;
          background: linear-gradient(135deg, rgba(201,168,76,0.15), rgba(201,168,76,0.05));
          border: 1px solid rgba(201,168,76,0.25);
          color: #c9a84c;
          display: flex; align-items: center; justify-content: center;
        }
        .lf-seguranca__title {
          font-family: 'Cormorant Garamond', serif;
          font-size: 20px;
          font-weight: 600;
          color: #f0ead6;
          margin: 0 0 8px;
          letter-spacing: -0.005em;
        }
        .lf-seguranca__desc {
          font-size: 14px;
          color: #94a3b8;
          line-height: 1.7;
          margin: 0;
        }

        /* ───── PLANS ───── */
        .lf-plans {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 24px;
          align-items: stretch;
        }
        .lf-plan {
          padding: 40px 32px;
          border-radius: 24px;
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.06);
          display: flex;
          flex-direction: column;
          position: relative;
          transition: all 0.3s;
        }
        .lf-plan:hover {
          border-color: rgba(201,168,76,0.2);
          transform: translateY(-4px);
        }
        .lf-plan--highlight {
          background:
            linear-gradient(180deg, rgba(201,168,76,0.06) 0%, rgba(201,168,76,0.01) 100%);
          border-color: rgba(201,168,76,0.3);
          box-shadow: 0 0 80px rgba(201,168,76,0.1);
        }
        .lf-plan__badge {
          position: absolute;
          top: -14px; left: 50%;
          transform: translateX(-50%);
          padding: 6px 18px;
          border-radius: 100px;
          font-size: 10px;
          font-weight: 800;
          background: linear-gradient(135deg, #d4b157, #a8872e);
          color: #060610;
          letter-spacing: 0.14em;
          white-space: nowrap;
          box-shadow: 0 8px 24px rgba(201,168,76,0.4);
        }
        .lf-plan__name {
          font-family: 'Cormorant Garamond', serif;
          font-size: 26px;
          font-weight: 600;
          color: #f0ead6;
          margin: 0 0 6px;
        }
        .lf-plan__desc {
          font-size: 13px;
          color: #64748b;
          margin: 0 0 28px;
          line-height: 1.5;
        }
        .lf-plan__price {
          display: flex;
          align-items: baseline;
          gap: 4px;
          margin-bottom: 32px;
          padding-bottom: 24px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .lf-plan__currency {
          font-size: 18px;
          color: #94a3b8;
          font-weight: 600;
        }
        .lf-plan__amount {
          font-family: 'Cormorant Garamond', serif;
          font-size: 56px;
          font-weight: 700;
          color: #c9a84c;
          line-height: 1;
        }
        .lf-plan__amount--custom { font-size: 28px; }
        .lf-plan__period { font-size: 14px; color: #64748b; font-weight: 500; }
        .lf-plan__features {
          list-style: none;
          padding: 0;
          margin: 0 0 32px;
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .lf-plan__features li {
          font-size: 14px;
          color: #b8bcc8;
          line-height: 1.5;
          display: flex;
          gap: 10px;
          align-items: flex-start;
        }
        .lf-plan__check {
          color: #c9a84c;
          flex-shrink: 0;
          margin-top: 3px;
        }

        /* ───── TESTIMONIALS ───── */
        .lf-testimonials {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(290px, 1fr));
          gap: 24px;
        }
        .lf-testimonial {
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 24px;
          padding: 36px 32px;
          position: relative;
          overflow: hidden;
          transition: all 0.3s;
        }
        .lf-testimonial:hover {
          border-color: rgba(201,168,76,0.25);
          transform: translateY(-4px);
        }
        .lf-testimonial__metric {
          position: absolute;
          top: 18px; right: 18px;
          padding: 5px 12px;
          border-radius: 100px;
          background: rgba(201,168,76,0.1);
          border: 1px solid rgba(201,168,76,0.25);
          color: #c9a84c;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.05em;
        }
        .lf-testimonial__text {
          font-family: 'Cormorant Garamond', serif;
          font-size: 18px;
          color: #d8d5c5;
          line-height: 1.6;
          margin: 24px 0 28px;
          font-style: italic;
          font-weight: 500;
        }
        .lf-testimonial__author {
          display: flex;
          align-items: center;
          gap: 14px;
          padding-top: 20px;
          border-top: 1px solid rgba(255,255,255,0.05);
        }
        .lf-testimonial__avatar {
          width: 48px; height: 48px;
          border-radius: 14px;
          background: linear-gradient(135deg, rgba(201,168,76,0.2), rgba(201,168,76,0.05));
          border: 1px solid rgba(201,168,76,0.3);
          color: #c9a84c;
          display: flex; align-items: center; justify-content: center;
          font-weight: 700;
          font-size: 14px;
          letter-spacing: 0.05em;
        }
        .lf-testimonial__name {
          font-size: 14px;
          font-weight: 700;
          color: #f0ead6;
        }
        .lf-testimonial__role {
          font-size: 11px;
          color: #64748b;
          margin-top: 2px;
        }

        /* ───── CTA FINAL ───── */
        .lf-cta-final {
          padding: 100px 24px;
          position: relative;
          overflow: hidden;
        }
        .lf-cta-final__glow {
          position: absolute;
          width: 600px; height: 600px;
          border-radius: 50%;
          background: rgba(201,168,76,0.1);
          filter: blur(160px);
          top: 50%; left: 50%;
          transform: translate(-50%, -50%);
          pointer-events: none;
        }
        .lf-cta-final__box {
          max-width: 720px;
          margin: 0 auto;
          text-align: center;
          position: relative;
          z-index: 1;
          padding: 56px 40px;
          border-radius: 32px;
          background:
            linear-gradient(135deg, rgba(201,168,76,0.08) 0%, rgba(201,168,76,0.015) 100%);
          border: 1px solid rgba(201,168,76,0.2);
          backdrop-filter: blur(12px);
        }
        .lf-cta-final__icon {
          width: 72px; height: 72px;
          border-radius: 22px;
          margin: 0 auto 24px;
          background: linear-gradient(135deg, #d4b157, #a8872e);
          color: #060610;
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 12px 40px rgba(201,168,76,0.4);
        }
        .lf-cta-final__title {
          font-family: 'Cormorant Garamond', serif;
          font-size: clamp(32px, 5vw, 48px);
          font-weight: 600;
          color: #f0ead6;
          margin: 0 0 18px;
          letter-spacing: -0.02em;
        }
        .lf-cta-final__sub {
          color: #94a3b8;
          font-size: 16px;
          margin: 0 0 36px;
          line-height: 1.7;
        }
        .lf-cta-final__sub strong { color: #f0ead6; }
        .lf-cta-final__notes {
          display: flex;
          gap: 24px;
          justify-content: center;
          flex-wrap: wrap;
          margin-top: 24px;
        }
        .lf-cta-final__notes span {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: #64748b;
          font-size: 12px;
          font-weight: 500;
        }
        .lf-cta-final__notes svg { color: #c9a84c; }

        /* ───── FOOTER ───── */
        .lf-footer {
          padding: 48px 24px;
          border-top: 1px solid rgba(201,168,76,0.08);
          text-align: center;
        }
        .lf-footer__brand {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 10px;
          margin-bottom: 16px;
        }
        .lf-footer__logo {
          width: 32px; height: 32px;
          border-radius: 10px;
          background: linear-gradient(135deg, #d4b157, #a8872e);
          color: #060610;
          display: flex; align-items: center; justify-content: center;
        }
        .lf-footer__brand span:last-child {
          font-family: 'Cormorant Garamond', serif;
          font-size: 20px;
          font-weight: 700;
          color: #c9a84c;
        }
        .lf-footer__copy {
          color: #475569;
          font-size: 13px;
          line-height: 1.7;
          margin: 0;
        }
        .lf-footer__copy strong { color: #94a3b8; font-weight: 600; }

        /* ───── ANIMATIONS ───── */
        @keyframes lf-rise {
          0% { opacity: 0; transform: translateY(24px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes lf-pulse-soft {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
        @keyframes lf-pulse-dot {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.4); opacity: 0.6; }
        }
        @keyframes lf-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        /* ───── RESPONSIVE — TABLET ───── */
        @media (max-width: 1024px) {
          .lf-nav { padding: 14px 20px; }
          .lf-nav__links { display: none; }
          .lf-hamburger { display: flex; }
          .lf-pilar {
            grid-template-columns: 1fr;
            gap: 32px;
            padding: 40px 32px;
          }
          .lf-pilar--reverse .lf-pilar__text { order: 0; }
          .lf-pilar--reverse .lf-pilar__visual { order: 1; }
          .lf-pilar__visual { height: 240px; }
          .lf-section { padding: 72px 0; }
          .lf-fluxo { grid-template-columns: 1fr; gap: 20px; }
          .lf-fluxo__connector { display: none; }
          .lf-seguranca { grid-template-columns: 1fr; }
        }

        /* ───── RESPONSIVE — MOBILE ───── */
        @media (max-width: 768px) {
          .lf-hero__content { padding-top: 90px; }
          .lf-hero__btns { flex-direction: column; align-items: stretch; max-width: 320px; margin-left: auto; margin-right: auto; }
          .lf-hero__btns .lf-btn-lg { width: 100%; justify-content: center; }
          .lf-hero__trust { gap: 14px; }
          .lf-hero__trust-divider { display: none; }
          .lf-stats__grid { gap: 24px; }
          .lf-stats__item { min-width: 80px; }
          .lf-pilar { padding: 32px 24px; }
          .lf-plans { grid-template-columns: 1fr; }
          .lf-testimonials { grid-template-columns: 1fr; }
          .lf-section-header { margin-bottom: 44px; }
          .lf-cta-final__box { padding: 40px 24px; }
          .lf-fluxo__footer { flex-direction: column; text-align: center; padding: 24px; }
          .lf-seguranca__item { flex-direction: column; }
        }

        @media (max-width: 480px) {
          .lf-hero__h1 { font-size: 40px; }
          .lf-pilar__stats { flex-direction: column; }
          .lf-pilar__stat { width: 100%; }
        }
      `}</style>
    </div>
  );
}
