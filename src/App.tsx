import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { PreferencesProvider } from "@/contexts/PreferencesContext";
import Auth from "./pages/Auth";
import Index from "./pages/Index";
import CasesList from "./pages/CasesList";
import CasesKanban from "./pages/CasesKanban";
import CaseDetail from "./pages/CaseDetail";
import AdminUsers from "./pages/AdminUsers";
import AdminMasterData from "./pages/AdminMasterData";
import AdminDepartments from "./pages/AdminDepartments";
import OrgChart from "./pages/OrgChart";
import ProjectsList from "./pages/ProjectsList";
import ProjectFiles from "./pages/ProjectFiles";
import ProjectDetail from "./pages/ProjectDetail";
import AdminDashboard from "./pages/AdminDashboard";
import Documentation from "./pages/Documentation";
import NotFound from "./pages/NotFound";
import ResetPassword from "./pages/ResetPassword";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center"><p className="text-muted-foreground">Laden…</p></div>;
  if (!session) return <Navigate to="/auth" replace />;
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
        <Route path="/org" element={<ProtectedRoute><OrgChart /></ProtectedRoute>} />
        <Route path="/projects" element={<ProtectedRoute><ProjectsList /></ProtectedRoute>} />
        <Route path="/projects/:id" element={<ProtectedRoute><ProjectDetail /></ProtectedRoute>} />
        <Route path="/projects/:id/files" element={<ProtectedRoute><ProjectFiles /></ProtectedRoute>} />
        <Route path="/docs" element={<ProtectedRoute><Documentation /></ProtectedRoute>} />
        <Route path="/admin/users" element={<ProtectedRoute><AdminUsers /></ProtectedRoute>} />
        <Route path="/admin/dashboard" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
        <Route path="/admin/master-data" element={<ProtectedRoute><AdminMasterData /></ProtectedRoute>} />
        <Route path="/admin/departments" element={<ProtectedRoute><AdminDepartments /></ProtectedRoute>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </PreferencesProvider>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AuthenticatedApp />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
