import { lazy, Suspense, useEffect, type ComponentType, type ReactNode } from "react";
import * as Sentry from "@sentry/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate, useNavigate, useParams } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { HexagonLoader } from "@/components/HexagonLoader";
import { PlatformPresenceSync } from "@/components/PlatformPresenceSync";
import { AdminRoute } from "@/components/AdminRoute";
import { MasterRoute } from "@/components/MasterRoute";
import { DashboardRoute } from "@/components/DashboardRoute";

// E5: chunk lazy obsoleto após um redeploy (hash mudou na Vercel) faz o import()
// rejeitar — sintoma: o menu destaca mas a rota "não abre" (Organograma/Crons).
// Aqui tentamos UM reload completo (busca o manifest novo) antes de desistir;
// na 2ª falha, deixa o Sentry.ErrorBoundary tratar. Recupera TODAS as rotas lazy.
const CHUNK_RELOAD_KEY = "jurisai:chunk-reload";
// BUG-02: rota-alvo que estava sendo aberta quando o chunk falhou. Persistimos antes
// do reload e re-navegamos depois do boot (ChunkReloadRestore) — assim o clique em
// "Crons" (ou qualquer rota lazy) chega ao destino mesmo se o reload cair na raiz.
const CHUNK_RELOAD_TO_KEY = "jurisai:chunk-reload-to";

function lazyWithRetry<T extends ComponentType<unknown>>(factory: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      const mod = await factory();
      try { sessionStorage.removeItem(CHUNK_RELOAD_KEY); } catch { /* noop */ }
      return mod;
    } catch (err) {
      let alreadyReloaded = false;
      try { alreadyReloaded = sessionStorage.getItem(CHUNK_RELOAD_KEY) === "1"; } catch { /* noop */ }
      if (!alreadyReloaded) {
        try {
          sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
          // Guarda a rota de destino para restaurar após o reload buscar o manifest novo.
          sessionStorage.setItem(CHUNK_RELOAD_TO_KEY, window.location.pathname + window.location.search);
        } catch { /* noop */ }
        window.location.reload();
        // Promise que nunca resolve: a página vai recarregar antes de renderizar.
        return new Promise<{ default: T }>(() => { /* noop */ });
      }
      throw err;
    }
  });
}

// BUG-02: após um reload disparado pelo lazyWithRetry, garante que voltamos para a
// rota que o usuário estava abrindo. Roda uma vez no mount (dentro do Router).
function ChunkReloadRestore() {
  const navigate = useNavigate();
  useEffect(() => {
    let target: string | null = null;
    try { target = sessionStorage.getItem(CHUNK_RELOAD_TO_KEY); } catch { /* noop */ }
    if (!target) return;
    try { sessionStorage.removeItem(CHUNK_RELOAD_TO_KEY); } catch { /* noop */ }
    const current = window.location.pathname + window.location.search;
    if (target !== current) navigate(target, { replace: true });
  }, [navigate]);
  return null;
}

const Index = lazyWithRetry(() => import("./pages/Index.tsx"));
const Auth = lazyWithRetry(() => import("./pages/Auth.tsx"));
const Clients = lazyWithRetry(() => import("./pages/Clients.tsx"));
const ClientNew = lazyWithRetry(() => import("./pages/ClientNew.tsx"));
const ClientEdit = lazyWithRetry(() => import("./pages/ClientEdit.tsx"));
const ClientDetails = lazyWithRetry(() => import("./pages/ClientDetails.tsx"));
const Admin = lazyWithRetry(() => import("./pages/Admin.tsx"));
const Profile = lazyWithRetry(() => import("./pages/Profile.tsx"));
const Dashboard = lazyWithRetry(() => import("./pages/Dashboard.tsx"));
const DashboardIA = lazyWithRetry(() => import("./pages/DashboardIA.tsx"));
const DashboardOperacional = lazyWithRetry(() => import("./pages/DashboardOperacional.tsx"));
const DashboardPrazos = lazyWithRetry(() => import("./pages/DashboardPrazos.tsx"));
const ResetPassword = lazyWithRetry(() => import("./pages/ResetPassword.tsx"));
const DefinePassword = lazyWithRetry(() => import("./pages/DefinePassword.tsx"));
const AdminEmployees = lazyWithRetry(() => import("./pages/AdminEmployees.tsx"));
const LandingPage = lazyWithRetry(() => import("./pages/LandingPage.tsx"));
const OrgChart = lazyWithRetry(() => import("./pages/OrgChart.tsx"));
const EfficiencyKPIs = lazyWithRetry(() => import("./pages/EfficiencyKPIs.tsx"));
const Tokens = lazyWithRetry(() => import("./pages/Tokens.tsx"));
const AdminTokens = lazyWithRetry(() => import("./pages/AdminTokens.tsx"));
const AdminUiEvents = lazyWithRetry(() => import("./pages/AdminUiEvents.tsx"));
const AdminMaster = lazyWithRetry(() => import("./pages/AdminMaster.tsx"));
const AdminNotifications = lazyWithRetry(() => import("./pages/AdminNotifications.tsx"));
const ProvidersConfig = lazyWithRetry(() => import("./pages/ProvidersConfig.tsx"));
const AgentsAdmin = lazyWithRetry(() => import("./pages/AgentsAdmin.tsx"));
const AgentDetail = lazyWithRetry(() => import("./pages/AgentDetail.tsx"));
const ChatWithAgent = lazyWithRetry(() => import("./pages/ChatWithAgent.tsx"));
const MyInbox = lazyWithRetry(() => import("./pages/MyInbox.tsx"));
const TeamDashboard = lazyWithRetry(() => import("./pages/TeamDashboard.tsx"));
const KanbanBoard = lazyWithRetry(() => import("./pages/KanbanBoard.tsx"));
const Agenda = lazyWithRetry(() => import("./pages/Agenda.tsx"));
const Audiencias = lazyWithRetry(() => import("./pages/Audiencias.tsx"));
const AssignTask = lazyWithRetry(() => import("./pages/AssignTask.tsx"));
const ValidationQueue = lazyWithRetry(() => import("./pages/ValidationQueue.tsx"));
const CronJobs = lazyWithRetry(() => import("./pages/CronJobs.tsx"));
const TechTestes = lazyWithRetry(() => import("./pages/TechTestes.tsx"));
const ImportarDados = lazyWithRetry(() => import("./pages/ImportarDados.tsx"));
const NotFound = lazyWithRetry(() => import("./pages/NotFound.tsx"));

const queryClient = new QueryClient();

function PageLoader() {
  return <HexagonLoader variant="fullscreen" />;
}

// Fallback amigável quando um erro de render escapa (capturado pelo Sentry).
// Sem detalhes técnicos / dados sensíveis na tela — apenas opção de recarregar.
function AppErrorFallback() {
  return (
    <div
      style={{
        minHeight: "100vh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 16,
        padding: 24, textAlign: "center",
      }}
    >
      <h1 style={{ fontSize: 20, fontWeight: 600 }}>Algo deu errado</h1>
      <p style={{ opacity: 0.7, maxWidth: 420 }}>
        Ocorreu um erro inesperado e nossa equipe foi notificada automaticamente.
        Tente recarregar a página.
      </p>
      <button
        onClick={() => window.location.reload()}
        style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid currentColor", cursor: "pointer", background: "transparent" }}
      >
        Recarregar
      </button>
    </div>
  );
}

// Compat: redireciona um caminho antigo para o novo preservando o parâmetro de rota.
// Usado para /admin/agentes/:id → /tech/agentes/:id (o <Navigate> puro não interpola params).
function RedirectWithParams({ to }: { to: (params: Record<string, string | undefined>) => string }) {
  const params = useParams();
  return <Navigate to={to(params)} replace />;
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return <HexagonLoader variant="fullscreen" />;
  }
  if (!user) return <Navigate to="/auth" replace />;
  return (
    <>
      <PlatformPresenceSync />
      {children}
    </>
  );
}

function TechRoute({ children }: { children: ReactNode }) {
  const { user, loading, hasRole } = useAuth();
  if (loading) return <HexagonLoader variant="fullscreen" />;
  if (!user) return <Navigate to="/auth" replace />;
  if (!hasRole("tech")) return <Navigate to="/sistema" replace />;
  return (
    <>
      <PlatformPresenceSync />
      {children}
    </>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner />
      <Sentry.ErrorBoundary fallback={<AppErrorFallback />}>
      <BrowserRouter>
        <AuthProvider>
          <ChunkReloadRestore />
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/site" element={<LandingPage />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/definir-senha" element={<DefinePassword />} />
              <Route path="/admin/funcionarios" element={<AdminRoute><AdminEmployees /></AdminRoute>} />
              <Route
                path="/admin/funcionarios/novo"
                element={<Navigate to="/sistema?criar=funcionario" replace />}
              />
              <Route path="/sistema" element={<ProtectedRoute><Index /></ProtectedRoute>} />
              <Route path="/clientes" element={<ProtectedRoute><Clients /></ProtectedRoute>} />
              <Route path="/clientes/novo" element={<ProtectedRoute><ClientNew /></ProtectedRoute>} />
              <Route path="/clientes/:id" element={<ProtectedRoute><ClientDetails /></ProtectedRoute>} />
              <Route path="/clientes/:id/editar" element={<ProtectedRoute><ClientEdit /></ProtectedRoute>} />
              <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />
              <Route path="/perfil" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
              <Route path="/dashboard" element={<DashboardRoute><Dashboard /></DashboardRoute>} />
              <Route path="/dashboard-ia" element={<DashboardRoute><DashboardIA /></DashboardRoute>} />
              <Route path="/dashboard-operacional" element={<DashboardRoute><DashboardOperacional /></DashboardRoute>} />
              <Route path="/dashboard-prazos" element={<DashboardRoute><DashboardPrazos /></DashboardRoute>} />
              <Route path="/organograma" element={<ProtectedRoute><OrgChart /></ProtectedRoute>} />

              <Route path="/eficiencia" element={<ProtectedRoute><EfficiencyKPIs /></ProtectedRoute>} />
              <Route path="/tokens" element={<ProtectedRoute><Tokens /></ProtectedRoute>} />
              <Route path="/admin/tokens" element={<AdminRoute><AdminTokens /></AdminRoute>} />
              <Route path="/admin/ui" element={<AdminRoute><AdminUiEvents /></AdminRoute>} />
              <Route path="/admin/master" element={<MasterRoute><AdminMaster /></MasterRoute>} />
              <Route path="/admin/notificacoes" element={<AdminRoute><AdminNotifications /></AdminRoute>} />
              {/* Rotas tech-only — o prefixo /tech/* reflete a privacidade real (gated por TechRoute).
                  Antes viviam sob /admin/* (agentes/crons/importar) e /configuracoes/* (providers),
                  o que confundia com as rotas de fato administrativas (AdminRoute). */}
              <Route path="/tech/agentes" element={<TechRoute><AgentsAdmin /></TechRoute>} />
              <Route path="/tech/agentes/:id" element={<TechRoute><AgentDetail /></TechRoute>} />
              <Route path="/tech/providers" element={<TechRoute><ProvidersConfig /></TechRoute>} />
              <Route path="/tech/crons" element={<TechRoute><CronJobs /></TechRoute>} />
              <Route path="/tech/testes" element={<TechRoute><TechTestes /></TechRoute>} />
              <Route path="/tech/importar" element={<TechRoute><ImportarDados /></TechRoute>} />

              {/* Compat: caminhos antigos redirecionam para o novo prefixo /tech/* (bookmarks/links legados). */}
              <Route path="/admin/agentes" element={<Navigate to="/tech/agentes" replace />} />
              <Route path="/admin/agentes/:id" element={<RedirectWithParams to={(p) => `/tech/agentes/${p.id}`} />} />
              <Route path="/configuracoes/providers" element={<Navigate to="/tech/providers" replace />} />
              <Route path="/admin/crons" element={<Navigate to="/tech/crons" replace />} />
              <Route path="/admin/importar" element={<Navigate to="/tech/importar" replace />} />
              <Route path="/sistema/chat" element={<ProtectedRoute><ChatWithAgent /></ProtectedRoute>} />
              <Route path="/sistema/tarefas" element={<ProtectedRoute><MyInbox /></ProtectedRoute>} />
              <Route path="/sistema/equipe" element={<ProtectedRoute><TeamDashboard /></ProtectedRoute>} />
              <Route path="/sistema/kanban" element={<ProtectedRoute><KanbanBoard /></ProtectedRoute>} />
              <Route path="/sistema/agenda" element={<ProtectedRoute><Agenda /></ProtectedRoute>} />
              <Route path="/sistema/audiencias" element={<ProtectedRoute><Audiencias /></ProtectedRoute>} />
              <Route path="/sistema/equipe/atribuir" element={<ProtectedRoute><AssignTask /></ProtectedRoute>} />
              <Route path="/sistema/validar" element={<ProtectedRoute><ValidationQueue /></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
      </Sentry.ErrorBoundary>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
