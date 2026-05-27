import { lazy, Suspense, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { HexagonLoader } from "@/components/HexagonLoader";

const Index = lazy(() => import("./pages/Index.tsx"));
const Auth = lazy(() => import("./pages/Auth.tsx"));
const Clients = lazy(() => import("./pages/Clients.tsx"));
const ClientDetails = lazy(() => import("./pages/ClientDetails.tsx"));
const Admin = lazy(() => import("./pages/Admin.tsx"));
const Profile = lazy(() => import("./pages/Profile.tsx"));
const Dashboard = lazy(() => import("./pages/Dashboard.tsx"));
const ResetPassword = lazy(() => import("./pages/ResetPassword.tsx"));
const LandingPage = lazy(() => import("./pages/LandingPage.tsx"));
const OrgChart = lazy(() => import("./pages/OrgChart.tsx"));
const OrgModelV14 = lazy(() => import("./pages/OrgModelV14.tsx"));
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
const NotFound = lazy(() => import("./pages/NotFound.tsx"));

const queryClient = new QueryClient();

function PageLoader() {
  return <HexagonLoader variant="fullscreen" />;
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return <HexagonLoader variant="fullscreen" />;
  }
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/site" element={<LandingPage />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/sistema" element={<ProtectedRoute><Index /></ProtectedRoute>} />
              <Route path="/clientes" element={<ProtectedRoute><Clients /></ProtectedRoute>} />
              <Route path="/clientes/:id" element={<ProtectedRoute><ClientDetails /></ProtectedRoute>} />
              <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
              <Route path="/perfil" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
              <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/organograma" element={<ProtectedRoute><OrgChart /></ProtectedRoute>} />
              <Route path="/admin/modelo-v14" element={<ProtectedRoute><OrgModelV14 /></ProtectedRoute>} />
              <Route path="/eficiencia" element={<ProtectedRoute><EfficiencyKPIs /></ProtectedRoute>} />
              <Route path="/tokens" element={<ProtectedRoute><Tokens /></ProtectedRoute>} />
              <Route path="/admin/tokens" element={<ProtectedRoute><AdminTokens /></ProtectedRoute>} />
              <Route path="/admin/ui" element={<ProtectedRoute><AdminUiEvents /></ProtectedRoute>} />
              <Route path="/admin/master" element={<ProtectedRoute><AdminMaster /></ProtectedRoute>} />
              <Route path="/admin/notificacoes" element={<ProtectedRoute><AdminNotifications /></ProtectedRoute>} />
              <Route path="/admin/agentes" element={<ProtectedRoute><AgentsAdmin /></ProtectedRoute>} />
              <Route path="/admin/agentes/:id" element={<ProtectedRoute><AgentDetail /></ProtectedRoute>} />
              <Route path="/configuracoes/providers" element={<ProtectedRoute><ProvidersConfig /></ProtectedRoute>} />
              <Route path="/sistema/chat" element={<ProtectedRoute><ChatWithAgent /></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
