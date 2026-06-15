import { lazy, Suspense, type ReactNode } from "react";
import * as Sentry from "@sentry/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { HexagonLoader } from "@/components/HexagonLoader";
import { PlatformPresenceSync } from "@/components/PlatformPresenceSync";
import { AdminRoute } from "@/components/AdminRoute";
import { MasterRoute } from "@/components/MasterRoute";

const Index = lazy(() => import("./pages/Index.tsx"));
const Auth = lazy(() => import("./pages/Auth.tsx"));
const Clients = lazy(() => import("./pages/Clients.tsx"));
const ClientDetails = lazy(() => import("./pages/ClientDetails.tsx"));
const Admin = lazy(() => import("./pages/Admin.tsx"));
const Profile = lazy(() => import("./pages/Profile.tsx"));
const Dashboard = lazy(() => import("./pages/Dashboard.tsx"));
const ResetPassword = lazy(() => import("./pages/ResetPassword.tsx"));
const DefinePassword = lazy(() => import("./pages/DefinePassword.tsx"));
const AdminEmployees = lazy(() => import("./pages/AdminEmployees.tsx"));
const LandingPage = lazy(() => import("./pages/LandingPage.tsx"));
const OrgChart = lazy(() => import("./pages/OrgChart.tsx"));
const EfficiencyKPIs = lazy(() => import("./pages/EfficiencyKPIs.tsx"));
const Tokens = lazy(() => import("./pages/Tokens.tsx"));
const AdminTokens = lazy(() => import("./pages/AdminTokens.tsx"));
const AdminUiEvents = lazy(() => import("./pages/AdminUiEvents.tsx"));
const AdminMaster = lazy(() => import("./pages/AdminMaster.tsx"));
const AdminNotifications = lazy(() => import("./pages/AdminNotifications.tsx"));
const ProvidersConfig = lazy(() => import("./pages/ProvidersConfig.tsx"));
const AgentsAdmin = lazy(() => import("./pages/AgentsAdmin.tsx"));
const AgentDetail = lazy(() => import("./pages/AgentDetail.tsx"));
const ChatWithAgent = lazy(() => import("./pages/ChatWithAgent.tsx"));
const MyInbox = lazy(() => import("./pages/MyInbox.tsx"));
const TeamDashboard = lazy(() => import("./pages/TeamDashboard.tsx"));
const AssignTask = lazy(() => import("./pages/AssignTask.tsx"));
const ValidationQueue = lazy(() => import("./pages/ValidationQueue.tsx"));
const InterAssistantInbox = lazy(() => import("./pages/InterAssistantInbox.tsx"));
const CronJobs = lazy(() => import("./pages/CronJobs.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));

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
              <Route path="/clientes/:id" element={<ProtectedRoute><ClientDetails /></ProtectedRoute>} />
              <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />
              <Route path="/perfil" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
              <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/organograma" element={<ProtectedRoute><OrgChart /></ProtectedRoute>} />

              <Route path="/eficiencia" element={<ProtectedRoute><EfficiencyKPIs /></ProtectedRoute>} />
              <Route path="/tokens" element={<ProtectedRoute><Tokens /></ProtectedRoute>} />
              <Route path="/admin/tokens" element={<AdminRoute><AdminTokens /></AdminRoute>} />
              <Route path="/admin/ui" element={<AdminRoute><AdminUiEvents /></AdminRoute>} />
              <Route path="/admin/master" element={<MasterRoute><AdminMaster /></MasterRoute>} />
              <Route path="/admin/notificacoes" element={<AdminRoute><AdminNotifications /></AdminRoute>} />
              <Route path="/admin/agentes" element={<TechRoute><AgentsAdmin /></TechRoute>} />
              <Route path="/admin/agentes/:id" element={<TechRoute><AgentDetail /></TechRoute>} />
              <Route path="/configuracoes/providers" element={<TechRoute><ProvidersConfig /></TechRoute>} />
              <Route path="/admin/crons" element={<TechRoute><CronJobs /></TechRoute>} />
              <Route path="/sistema/chat" element={<ProtectedRoute><ChatWithAgent /></ProtectedRoute>} />
              <Route path="/sistema/tarefas" element={<ProtectedRoute><MyInbox /></ProtectedRoute>} />
              <Route path="/sistema/equipe" element={<ProtectedRoute><TeamDashboard /></ProtectedRoute>} />
              <Route path="/sistema/equipe/atribuir" element={<ProtectedRoute><AssignTask /></ProtectedRoute>} />
              <Route path="/sistema/validar" element={<ProtectedRoute><ValidationQueue /></ProtectedRoute>} />
              <Route path="/sistema/inter-assistente" element={<ProtectedRoute><InterAssistantInbox /></ProtectedRoute>} />
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
