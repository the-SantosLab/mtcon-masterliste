import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { PortalAuthProvider, usePortalAuth } from "@/contexts/PortalAuthContext";
import { PreferencesProvider } from "@/contexts/PreferencesContext";
import Auth from "./pages/Auth";
import Index from "./pages/Index";
import CasesList from "./pages/CasesList";
import CasesKanban from "./pages/CasesKanban";
import CaseDetail from "./pages/CaseDetail";
import AdminUsers from "./pages/AdminUsers";
import AdminMasterData from "./pages/AdminMasterData";
import ProductRequests from "./pages/ProductRequests";
import AdminDepartments from "./pages/AdminDepartments";

import ProjectsList from "./pages/ProjectsList";
import ProjectFiles from "./pages/ProjectFiles";
import ProjectDetail from "./pages/ProjectDetail";
import AdminDashboard from "./pages/AdminDashboard";
import AdminWorkflows from "./pages/AdminWorkflows";
import AdminBackups from "./pages/AdminBackups";
import Documentation from "./pages/Documentation";
import NotFound from "./pages/NotFound";
import Profile from "./pages/Profile";
import ResetPassword from "./pages/ResetPassword";
import SupportTickets from "./pages/SupportTickets";
import SupportTicketDetail from "./pages/SupportTicketDetail";
import PortalAuth from "./pages/portal/PortalAuth";
import PortalDashboard from "./pages/portal/PortalDashboard";
import PortalTickets from "./pages/portal/PortalTickets";
import PortalCreateTicket from "./pages/portal/PortalCreateTicket";
import PortalTicketDetail from "./pages/portal/PortalTicketDetail";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center"><p className="text-muted-foreground">Laden…</p></div>;
  if (!session) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

function PortalProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, customer, loading } = usePortalAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center"><p className="text-muted-foreground">Laden…</p></div>;
  if (!session || !customer) return <Navigate to="/portal/auth" replace />;
  return <>{children}</>;
}

function AuthenticatedApp() {
  return (
    <PreferencesProvider>
      <Routes>
        <Route path="/auth" element={<Auth />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
        <Route path="/cases" element={<ProtectedRoute><CasesList /></ProtectedRoute>} />
        <Route path="/cases/kanban" element={<ProtectedRoute><CasesKanban /></ProtectedRoute>} />
        <Route path="/cases/:id" element={<ProtectedRoute><CaseDetail /></ProtectedRoute>} />
        
        <Route path="/projects" element={<ProtectedRoute><ProjectsList /></ProtectedRoute>} />
        <Route path="/projects/:id" element={<ProtectedRoute><ProjectDetail /></ProtectedRoute>} />
        <Route path="/projects/:id/files" element={<ProtectedRoute><ProjectFiles /></ProtectedRoute>} />
        <Route path="/docs" element={<ProtectedRoute><Documentation /></ProtectedRoute>} />
        <Route path="/support" element={<ProtectedRoute><SupportTickets /></ProtectedRoute>} />
        <Route path="/support/:id" element={<ProtectedRoute><SupportTicketDetail /></ProtectedRoute>} />
        <Route path="/admin/users" element={<ProtectedRoute><AdminUsers /></ProtectedRoute>} />
        <Route path="/admin/dashboard" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
        <Route path="/admin/master-data" element={<ProtectedRoute><AdminMasterData /></ProtectedRoute>} />
        <Route path="/products/requests" element={<ProtectedRoute><ProductRequests /></ProtectedRoute>} />
        <Route path="/admin/departments" element={<ProtectedRoute><AdminDepartments /></ProtectedRoute>} />
        <Route path="/admin/workflows" element={<ProtectedRoute><AdminWorkflows /></ProtectedRoute>} />
        <Route path="/admin/backups" element={<ProtectedRoute><AdminBackups /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </PreferencesProvider>
  );
}

function PortalApp() {
  return (
    <Routes>
      <Route path="auth" element={<PortalAuth />} />
      <Route path="" element={<PortalProtectedRoute><PortalDashboard /></PortalProtectedRoute>} />
      <Route path="tickets" element={<PortalProtectedRoute><PortalTickets /></PortalProtectedRoute>} />
      <Route path="tickets/new" element={<PortalProtectedRoute><PortalCreateTicket /></PortalProtectedRoute>} />
      <Route path="tickets/:id" element={<PortalProtectedRoute><PortalTicketDetail /></PortalProtectedRoute>} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <PortalAuthProvider>
          <AuthProvider>
            <Routes>
              <Route path="/portal/*" element={<PortalApp />} />
              <Route path="/*" element={<AuthenticatedApp />} />
            </Routes>
          </AuthProvider>
        </PortalAuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
