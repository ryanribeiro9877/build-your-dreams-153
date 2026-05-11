import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import Index from "./pages/Index.tsx";
import Auth from "./pages/Auth.tsx";
import Clients from "./pages/Clients.tsx";
import ClientDetails from "./pages/ClientDetails.tsx";
import Admin from "./pages/Admin.tsx";
import Profile from "./pages/Profile.tsx";
import Dashboard from "./pages/Dashboard.tsx";
import ResetPassword from "./pages/ResetPassword.tsx";
import LandingPage from "./pages/LandingPage.tsx";
import OrgChart from "./pages/OrgChart.tsx";
import EfficiencyKPIs from "./pages/EfficiencyKPIs.tsx";
import Tokens from "./pages/Tokens.tsx";
import AdminTokens from "./pages/AdminTokens.tsx";
import AdminUiEvents from "./pages/AdminUiEvents.tsx";
import AdminMaster from "./pages/AdminMaster.tsx";
import AdminNotifications from "./pages/AdminNotifications.tsx";
import ProvidersConfig from "./pages/ProvidersConfig.tsx";
import AgentsAdmin from "./pages/AgentsAdmin.tsx";
import ChatWithAgent from "./pages/ChatWithAgent.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#09090f", color: "#c9a84c" }}>Carregando...</div>;
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
            <Route path="/eficiencia" element={<ProtectedRoute><EfficiencyKPIs /></ProtectedRoute>} />
            <Route path="/tokens" element={<ProtectedRoute><Tokens /></ProtectedRoute>} />
            <Route path="/admin/tokens" element={<ProtectedRoute><AdminTokens /></ProtectedRoute>} />
            <Route path="/admin/ui" element={<ProtectedRoute><AdminUiEvents /></ProtectedRoute>} />
            <Route path="/admin/master" element={<ProtectedRoute><AdminMaster /></ProtectedRoute>} />
            <Route path="/admin/notificacoes" element={<ProtectedRoute><AdminNotifications /></ProtectedRoute>} />
            <Route path="/admin/agentes" element={<ProtectedRoute><AgentsAdmin /></ProtectedRoute>} />
            <Route path="/configuracoes/providers" element={<ProtectedRoute><ProvidersConfig /></ProtectedRoute>} />
            <Route path="/sistema/chat" element={<ProtectedRoute><ChatWithAgent /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
