import type { LucideIcon } from "lucide-react";
import {
  Brain, Bot, Crown, Briefcase, Gavel, Building2,
  MessageSquare, Zap, FileCheck,
  Shield, Lock, Eye, Award, ShieldCheck, Clock,
} from "lucide-react";

/* ───── Shared types ───── */

export interface CasoDeUso {
  Icon: LucideIcon;
  badge: string;
  title: string;
  challenge: string;
  solution: string;
  metrics: { value: string; label: string }[];
  accent: string;
}

export interface FaqItem {
  q: string;
  a: string;
}

export interface Pilar {
  Icon: LucideIcon;
  tag: string;
  title: string;
  desc: string;
  stats: { value: string; label: string }[];
  accent: string;
}

export interface FluxoStep {
  step: string;
  Icon: LucideIcon;
  title: string;
  desc: string;
  color: string;
}

export interface SegurancaItem {
  Icon: LucideIcon;
  title: string;
  desc: string;
}

export interface Testimonial {
  name: string;
  role: string;
  text: string;
  initial: string;
  metric: string;
}

export interface StatBanner {
  value: string;
  label: string;
  Icon: LucideIcon;
}

export interface Plano {
  name: string;
  price: string;
  desc: string;
  highlight: boolean;
  features: string[];
  cta: string;
}

/* ───── Data ───── */

export const CASOS_DE_USO: CasoDeUso[] = [
  {
    Icon: Briefcase,
    badge: "TRABALHISTA",
    title: "Perfil de escritório trabalhista",
    challenge: "Equipes que gastam grande parte do tempo em cálculos de rescisão e petições iniciais repetitivas.",
    solution: "Calculista IA e Redator de Iniciais preparam minutas e cálculos. O advogado mantém a análise, a revisão e a assinatura.",
    metrics: [
      { value: "Cálculos", label: "Pré-preparados pelo agente" },
      { value: "Minutas", label: "Em formato editável" },
      { value: "Revisão", label: "Humana e final" },
    ],
    accent: "#06b6d4",
  },
  {
    Icon: Gavel,
    badge: "CÍVEL & CONSUMIDOR",
    title: "Perfil de banca de alto volume",
    challenge: "Dificuldade de acompanhar manualmente prazos, audiências e despachos em grande volume processual.",
    solution: "Monitor de Prazos e Agente de Andamentos consolidam movimentações e organizam alertas para revisão humana.",
    metrics: [
      { value: "Monitoramento", label: "Contínuo de andamentos" },
      { value: "Alertas", label: "Priorizados para revisão" },
      { value: "Fila", label: "Organizada por prazo" },
    ],
    accent: "#8b5cf6",
  },
  {
    Icon: Building2,
    badge: "CORPORATIVO",
    title: "Perfil de departamento jurídico interno",
    challenge: "Diretoria jurídica sobrecarregada com triagem de contratos e pareceres recorrentes.",
    solution: "Agente Revisor e módulo de Compliance organizam pontos de atenção e checklists. A validação final permanece humana.",
    metrics: [
      { value: "Triagem", label: "Automática de pontos" },
      { value: "Checklist", label: "LGPD configurável" },
      { value: "Decisão", label: "Sempre do advogado" },
    ],
    accent: "#c9a84c",
  },
];

export const FAQ: FaqItem[] = [
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

export const PILARES: Pilar[] = [
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

export const FLUXO: FluxoStep[] = [
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

export const SEGURANCA: SegurancaItem[] = [
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

export const TESTIMONIALS: Testimonial[] = [
  {
    name: "Foco no que é estratégico",
    role: "Princípio do produto",
    text: "A plataforma libera o tempo do advogado das tarefas operacionais e repetitivas — quem decide, quem assina e quem responde tecnicamente continua sendo você.",
    initial: "1",
    metric: "Comando humano",
  },
  {
    name: "Aprovação humana sempre",
    role: "Princípio do produto",
    text: "Nenhuma petição é protocolada, nenhuma comunicação é enviada e nenhum cálculo é entregue ao cliente sem aprovação explícita do profissional responsável.",
    initial: "2",
    metric: "Sem ação autônoma",
  },
  {
    name: "Sigilo e LGPD",
    role: "Princípio do produto",
    text: "Os dados de cada escritório são isolados por RLS no banco, não saem para treinamento de modelos públicos e ficam armazenados em território brasileiro.",
    initial: "3",
    metric: "Dados protegidos",
  },
];

export const STATS_BANNER: StatBanner[] = [
  { value: "91+", label: "Agentes disponíveis", Icon: Bot },
  { value: "24/7", label: "Monitoramento de prazos", Icon: Clock },
  { value: "100%", label: "Decisão humana final", Icon: Shield },
  { value: "LGPD", label: "Em conformidade", Icon: Lock },
  { value: "BR", label: "Dados em território nacional", Icon: ShieldCheck },
];

export const PLANOS: Plano[] = [
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
