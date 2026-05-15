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
import AdminDeletedCases from "./pages/AdminDeletedCases";
import AdminTrash from "./pages/AdminTrash";
import AdminTemplates from "./pages/AdminTemplates";
import Documentation from "./pages/Documentation";
import NotFound from "./pages/NotFound";
import Profile from "./pages/Profile";
import ResetPassword from "./pages/ResetPassword";
import MfaChallenge from "./pages/MfaChallenge";
import SupportTickets from "./pages/SupportTickets";
import SupportTicketDetail from "./pages/SupportTicketDetail";
import PortalAuth from "./pages/portal/PortalAuth";
import PortalDashboard from "./pages/portal/PortalDashboard";
import PortalTickets from "./pages/portal/PortalTickets";
import PortalCreateTicket from "./pages/portal/PortalCreateTicket";
import PortalTicketDetail from "./pages/portal/PortalTicketDetail";
import ModuleSelect from "./pages/ModuleSelect";
import CrmDashboard from "./pages/crm/CrmDashboard";
import CrmDeals from "./pages/crm/CrmDeals";
import CrmDealDetail from "./pages/crm/CrmDealDetail";
import CrmCompanies from "./pages/crm/CrmCompanies";
import CrmCompanyDetail from "./pages/crm/CrmCompanyDetail";
import CrmContacts from "./pages/crm/CrmContacts";
import CrmStub from "./pages/crm/CrmStub";
import CrmOffers from "./pages/crm/CrmOffers";
import CrmOfferDetail from "./pages/crm/CrmOfferDetail";
import CrmActivities from "./pages/crm/CrmActivities";
import CrmSettings from "./pages/crm/CrmSettings";
import CrmWiki from "./pages/crm/CrmWiki";
import CrmOutbound from "./pages/crm/CrmOutbound";
import CrmSequenceDetail from "./pages/crm/CrmSequenceDetail";
import CrmEnrollments from "./pages/crm/CrmEnrollments";
import CrmLeads from "./pages/crm/CrmLeads";
import CrmCalendar from "./pages/crm/CrmCalendar";
import CrmRoles from "./pages/crm/CrmRoles";
import CrmAccess from "./pages/crm/CrmAccess";
import CrmNoAccess from "./pages/crm/CrmNoAccess";
import { useCrmAccess } from "./hooks/useCrmAccess";

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

function CrmProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const { allowed, loading: accessLoading } = useCrmAccess();
  if (loading || accessLoading) return <div className="flex min-h-screen items-center justify-center"><p className="text-muted-foreground">Laden…</p></div>;
  if (!session) return <Navigate to="/auth" replace />;
  if (!allowed) return <CrmNoAccess />;
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
        <Route path="/admin/deleted-cases" element={<ProtectedRoute><AdminDeletedCases /></ProtectedRoute>} />
        <Route path="/admin/papierkorb" element={<ProtectedRoute><AdminTrash /></ProtectedRoute>} />
        <Route path="/admin/templates" element={<ProtectedRoute><AdminTemplates /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        <Route path="/modules" element={<ProtectedRoute><ModuleSelect /></ProtectedRoute>} />
        <Route path="/crm" element={<CrmProtectedRoute><CrmDashboard /></CrmProtectedRoute>} />
        <Route path="/crm/dashboard" element={<CrmProtectedRoute><CrmDashboard /></CrmProtectedRoute>} />
        <Route path="/crm/deals" element={<CrmProtectedRoute><CrmDeals /></CrmProtectedRoute>} />
        <Route path="/crm/deals/:id" element={<CrmProtectedRoute><CrmDealDetail /></CrmProtectedRoute>} />
        <Route path="/crm/companies" element={<CrmProtectedRoute><CrmCompanies /></CrmProtectedRoute>} />
        <Route path="/crm/companies/:id" element={<CrmProtectedRoute><CrmCompanyDetail /></CrmProtectedRoute>} />
        <Route path="/crm/contacts" element={<CrmProtectedRoute><CrmContacts /></CrmProtectedRoute>} />
        <Route path="/crm/offers" element={<CrmProtectedRoute><CrmOffers /></CrmProtectedRoute>} />
        <Route path="/crm/offers/:id" element={<CrmProtectedRoute><CrmOfferDetail /></CrmProtectedRoute>} />
        <Route path="/crm/activities" element={<CrmProtectedRoute><CrmActivities /></CrmProtectedRoute>} />
        <Route path="/crm/settings" element={<CrmProtectedRoute><CrmSettings /></CrmProtectedRoute>} />
        <Route path="/crm/settings/preislisten" element={<CrmProtectedRoute><CrmSettings /></CrmProtectedRoute>} />
        <Route path="/crm/settings/roles" element={<CrmProtectedRoute><CrmRoles /></CrmProtectedRoute>} />
        <Route path="/crm/settings/zugang" element={<CrmProtectedRoute><CrmAccess /></CrmProtectedRoute>} />
        <Route path="/crm/wiki" element={<CrmProtectedRoute><CrmWiki /></CrmProtectedRoute>} />
        <Route path="/crm/outbound" element={<CrmProtectedRoute><CrmOutbound /></CrmProtectedRoute>} />
        <Route path="/crm/outbound/sequences/:id" element={<CrmProtectedRoute><CrmSequenceDetail /></CrmProtectedRoute>} />
        <Route path="/crm/outbound/enrollments" element={<CrmProtectedRoute><CrmEnrollments /></CrmProtectedRoute>} />
        <Route path="/crm/outbound/leads" element={<CrmProtectedRoute><CrmLeads /></CrmProtectedRoute>} />
        <Route path="/crm/activities/calendar" element={<CrmProtectedRoute><CrmCalendar /></CrmProtectedRoute>} />
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
