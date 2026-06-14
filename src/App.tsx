import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { PortalAuthProvider, usePortalAuth } from "@/contexts/PortalAuthContext";
import { PreferencesProvider } from "@/contexts/PreferencesContext";
import { isCurrentTabSessionBlocked } from "@/hooks/useSessionEnforcement";
import { storeAuthRedirect } from "@/lib/authRedirect";
import { isSessionPolicyExemptEmail } from "@/lib/authExemptions";
import Auth from "./pages/Auth";
import Index from "./pages/Index";
import CasesList from "./pages/CasesList";
import CasesKanban from "./pages/CasesKanban";
import CaseDetail from "./pages/CaseDetail";
import AdminUsers from "./pages/AdminUsers";
import AdminMasterData from "./pages/AdminMasterData";
import AdminArticles from "./pages/AdminArticles";
import AdminInventory from "./pages/AdminInventory";
import AdminStorageLocations from "./pages/AdminStorageLocations";
import AdminPurchasing from "./pages/AdminPurchasing";
import AdminDisposition from "./pages/AdminDisposition";
import AdminLots from "./pages/AdminLots";
import AdminSperrlager from "./pages/AdminSperrlager";
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
import AdminSecurity from "./pages/AdminSecurity";
import AdminAnnouncements from "./pages/AdminAnnouncements";
import AdminAiPrompts from "./pages/AdminAiPrompts";
import AdminInsurance from "./pages/AdminInsurance";
import AdminOrders from "./pages/AdminOrders";
import AdminDeliveries from "./pages/AdminDeliveries";
import AdminInvoices from "./pages/AdminInvoices";
import AdminSupplierInvoices from "./pages/AdminSupplierInvoices";
import AdminPurchasingReport from "./pages/AdminPurchasingReport";
import AdminCapacityPlan from "./pages/AdminCapacityPlan";
import AdminDrawings from "./pages/AdminDrawings";
import AdminFolderTemplates from "./pages/AdminFolderTemplates";
import AdminSupplierRatings from "./pages/AdminSupplierRatings";
import AdminPriceManagement from "./pages/AdminPriceManagement";
import AdminContainerAccess from "./pages/AdminContainerAccess";

import { SessionTimeoutGuard } from "@/components/SessionTimeoutGuard";
import Documentation from "./pages/Documentation";
import Documents from "./pages/Documents";
import DocumentDetail from "./pages/DocumentDetail";
import NotFound from "./pages/NotFound";
import Profile from "./pages/Profile";
import ResetPassword from "./pages/ResetPassword";
import MfaChallenge from "./pages/MfaChallenge";
import MfaGuide from "./pages/MfaGuide";
import SupportTickets from "./pages/SupportTickets";
import SupportTicketDetail from "./pages/SupportTicketDetail";
import MyFeedback from "./pages/MyFeedback";
import Notes from "./pages/Notes";
import MtiqDrafts from "./pages/MtiqDrafts";
import Inbox from "./pages/Inbox";
import InboxHub from "./pages/InboxHub";
import AdminDocumentTypes from "./pages/AdminDocumentTypes";
import Issos from "./pages/Issos";
import Container3D from "./pages/Container3D";
import BusinessMap from "./pages/BusinessMap";
import AdminActionRules from "./pages/AdminActionRules";
import AdminInboxStats from "./pages/AdminInboxStats";
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

function ProtectedRoute({ children, enforceMfa = true }: { children: React.ReactNode; enforceMfa?: boolean }) {
  const { session, loading } = useAuth();
  const location = useLocation();
  const [mfaState, setMfaState] = useState<'unknown' | 'ok' | 'required'>('unknown');

  useEffect(() => {
    if (!session) { setMfaState('unknown'); return; }
    if (!enforceMfa) { setMfaState('ok'); return; }
    // 2FA-Enforcement deaktiviert für Dev-/Ausnahme-Accounts.
    if (isSessionPolicyExemptEmail(session.user?.email)) { setMfaState('ok'); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (cancelled) return;
      if (data?.nextLevel === 'aal2' && data?.currentLevel !== 'aal2') {
        const { data: factors } = await supabase.auth.mfa.listFactors();
        if (cancelled) return;
        const hasVerifiedFactor = factors?.totp?.some(factor => factor.status === 'verified');
        setMfaState(hasVerifiedFactor ? 'required' : 'ok');
      } else {
        setMfaState('ok');
      }
    })();
    return () => { cancelled = true; };
  }, [session, enforceMfa]);

  if (loading || (session && mfaState === 'unknown')) return <div className="flex min-h-screen items-center justify-center"><p className="text-muted-foreground">Laden…</p></div>;
  if (!session || isCurrentTabSessionBlocked()) {
    storeAuthRedirect(location);
    return <Navigate to={`/auth?redirect=${encodeURIComponent(`${location.pathname}${location.search}${location.hash}`)}`} replace state={{ from: location }} />;
  }
  if (mfaState === 'required') {
    storeAuthRedirect(location);
    return <Navigate to="/mfa-challenge" replace state={{ from: location }} />;
  }
  return <>{children}</>;
}

function PortalProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, customer, loading } = usePortalAuth();
  const location = useLocation();
  if (loading) return <div className="flex min-h-screen items-center justify-center"><p className="text-muted-foreground">Laden…</p></div>;
  if (!session || !customer) return <Navigate to="/portal/auth" replace state={{ from: location }} />;
  return <>{children}</>;
}

function CrmProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const { allowed, loading: accessLoading } = useCrmAccess();
  const location = useLocation();
  if (loading || accessLoading) return <div className="flex min-h-screen items-center justify-center"><p className="text-muted-foreground">Laden…</p></div>;
  if (!session || isCurrentTabSessionBlocked()) {
    storeAuthRedirect(location);
    return <Navigate to={`/auth?redirect=${encodeURIComponent(`${location.pathname}${location.search}${location.hash}`)}`} replace state={{ from: location }} />;
  }
  if (!allowed) return <CrmNoAccess />;
  return <>{children}</>;
}

function AuthenticatedApp() {
  return (
    <PreferencesProvider>
      <SessionTimeoutGuard />
      <Routes>
        <Route path="/auth" element={<Auth />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/mfa-challenge" element={<MfaChallenge />} />
        <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
        <Route path="/cases" element={<ProtectedRoute><CasesList /></ProtectedRoute>} />
        <Route path="/cases/kanban" element={<ProtectedRoute><CasesKanban /></ProtectedRoute>} />
        <Route path="/cases/:id" element={<ProtectedRoute><CaseDetail /></ProtectedRoute>} />
        
        <Route path="/projects" element={<ProtectedRoute><ProjectsList /></ProtectedRoute>} />
        <Route path="/projects/:id" element={<ProtectedRoute><ProjectDetail /></ProtectedRoute>} />
        <Route path="/projects/:id/files" element={<ProtectedRoute><ProjectFiles /></ProtectedRoute>} />
        <Route path="/docs" element={<ProtectedRoute><Documentation /></ProtectedRoute>} />
        <Route path="/notes" element={<ProtectedRoute><Notes /></ProtectedRoute>} />
        <Route path="/mtiq/drafts" element={<ProtectedRoute><MtiqDrafts /></ProtectedRoute>} />
        <Route path="/inbox" element={<ProtectedRoute><Inbox /></ProtectedRoute>} />
        <Route path="/inbox/documents" element={<ProtectedRoute><Inbox /></ProtectedRoute>} />
        <Route path="/inbox/mtiq" element={<ProtectedRoute><MtiqDrafts /></ProtectedRoute>} />
        <Route path="/admin/document-types" element={<ProtectedRoute><AdminDocumentTypes /></ProtectedRoute>} />
        <Route path="/admin/action-rules" element={<ProtectedRoute><AdminActionRules /></ProtectedRoute>} />
        <Route path="/admin/inbox-stats" element={<ProtectedRoute><AdminInboxStats /></ProtectedRoute>} />
        <Route path="/support" element={<ProtectedRoute><SupportTickets /></ProtectedRoute>} />
        <Route path="/support/:id" element={<ProtectedRoute><SupportTicketDetail /></ProtectedRoute>} />
        <Route path="/feedback" element={<ProtectedRoute><MyFeedback /></ProtectedRoute>} />
        <Route path="/admin/users" element={<ProtectedRoute><AdminUsers /></ProtectedRoute>} />
        <Route path="/admin/dashboard" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
        <Route path="/admin/master-data" element={<ProtectedRoute><AdminMasterData /></ProtectedRoute>} />
        <Route path="/admin/partners" element={<Navigate to="/crm/companies" replace />} />
        <Route path="/admin/articles" element={<ProtectedRoute><AdminArticles /></ProtectedRoute>} />
        <Route path="/admin/inventory" element={<ProtectedRoute><AdminInventory /></ProtectedRoute>} />
        <Route path="/admin/storage-locations" element={<ProtectedRoute><AdminStorageLocations /></ProtectedRoute>} />
        <Route path="/admin/purchasing" element={<ProtectedRoute><AdminPurchasing /></ProtectedRoute>} />
        <Route path="/admin/disposition" element={<ProtectedRoute><AdminDisposition /></ProtectedRoute>} />
        <Route path="/admin/lots" element={<ProtectedRoute><AdminLots /></ProtectedRoute>} />
        <Route path="/admin/sperrlager" element={<ProtectedRoute><AdminSperrlager /></ProtectedRoute>} />
        <Route path="/products/requests" element={<ProtectedRoute><ProductRequests /></ProtectedRoute>} />
        <Route path="/admin/departments" element={<ProtectedRoute><AdminDepartments /></ProtectedRoute>} />
        <Route path="/admin/workflows" element={<ProtectedRoute><AdminWorkflows /></ProtectedRoute>} />
        <Route path="/admin/backups" element={<ProtectedRoute><AdminBackups /></ProtectedRoute>} />
        <Route path="/admin/deleted-cases" element={<ProtectedRoute><AdminDeletedCases /></ProtectedRoute>} />
        <Route path="/admin/papierkorb" element={<ProtectedRoute><AdminTrash /></ProtectedRoute>} />
        <Route path="/admin/templates" element={<ProtectedRoute><AdminTemplates /></ProtectedRoute>} />
        <Route path="/admin/security" element={<ProtectedRoute><AdminSecurity /></ProtectedRoute>} />
        <Route path="/admin/announcements" element={<ProtectedRoute><AdminAnnouncements /></ProtectedRoute>} />
        <Route path="/admin/ai-prompts" element={<ProtectedRoute><AdminAiPrompts /></ProtectedRoute>} />
        <Route path="/admin/container-access" element={<ProtectedRoute><AdminContainerAccess /></ProtectedRoute>} />
        <Route path="/insurance" element={<ProtectedRoute><AdminInsurance /></ProtectedRoute>} />
        <Route path="/insurance/:id" element={<ProtectedRoute><AdminInsurance /></ProtectedRoute>} />
        <Route path="/issos" element={<ProtectedRoute><Issos /></ProtectedRoute>} />
        <Route path="/container" element={<ProtectedRoute><Container3D /></ProtectedRoute>} />
        <Route path="/map" element={<ProtectedRoute><BusinessMap /></ProtectedRoute>} />
        <Route path="/orders" element={<ProtectedRoute><AdminOrders /></ProtectedRoute>} />
        <Route path="/bestellungen" element={<ProtectedRoute><AdminOrders /></ProtectedRoute>} />
        <Route path="/lieferscheine" element={<ProtectedRoute><AdminDeliveries /></ProtectedRoute>} />
        <Route path="/rechnungen" element={<ProtectedRoute><AdminInvoices /></ProtectedRoute>} />
        <Route path="/eingangsrechnungen" element={<ProtectedRoute><AdminSupplierInvoices /></ProtectedRoute>} />
        <Route path="/reporting/einkauf" element={<ProtectedRoute><AdminPurchasingReport /></ProtectedRoute>} />
        <Route path="/kapazitaet" element={<ProtectedRoute><AdminCapacityPlan /></ProtectedRoute>} />
        <Route path="/zeichnungen" element={<ProtectedRoute><AdminDrawings /></ProtectedRoute>} />
        <Route path="/admin/folder-templates" element={<ProtectedRoute><AdminFolderTemplates /></ProtectedRoute>} />
        <Route path="/lieferantenbewertung" element={<ProtectedRoute><AdminSupplierRatings /></ProtectedRoute>} />
        <Route path="/documents" element={<ProtectedRoute><Documents /></ProtectedRoute>} />
        <Route path="/documents/:id" element={<ProtectedRoute><DocumentDetail /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        <Route path="/2fa-anleitung" element={<ProtectedRoute enforceMfa={false}><MfaGuide /></ProtectedRoute>} />
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
