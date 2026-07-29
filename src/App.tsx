import { useEffect, useState, lazy, Suspense } from "react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { SessionTimeoutGuard } from "@/components/SessionTimeoutGuard";
import { useCrmAccess } from "./hooks/useCrmAccess";

// Auth-Seiten eager (immer benötigt bei Kaltstart, klein)
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import AdminInvoices from "./pages/AdminInvoices";
const AdminErpExport = lazy(() => import("./pages/AdminErpExport"));

// Alle übrigen Seiten lazy — Route-basiertes Code-Splitting
const Index = lazy(() => import("./pages/Index"));
const Cockpit = lazy(() => import("./pages/Cockpit"));
const CasesList = lazy(() => import("./pages/CasesList"));
const CasesKanban = lazy(() => import("./pages/CasesKanban"));
const PrintMyTasks = lazy(() => import("./pages/PrintMyTasks"));
const PrintCase = lazy(() => import("./pages/PrintCase"));
const PrintProject = lazy(() => import("./pages/PrintProject"));

const CaseDetail = lazy(() => import("./pages/CaseDetail"));
const AdminUsers = lazy(() => import("./pages/AdminUsers"));
const AdminMasterData = lazy(() => import("./pages/AdminMasterData"));
const AdminArticles = lazy(() => import("./pages/AdminArticles"));
const AdminInventory = lazy(() => import("./pages/AdminInventory"));

const AdminPurchasing = lazy(() => import("./pages/AdminPurchasing"));
const AdminDisposition = lazy(() => import("./pages/AdminDisposition"));
const AdminLots = lazy(() => import("./pages/AdminLots"));
const AdminSperrlager = lazy(() => import("./pages/AdminSperrlager"));
const ProductRequests = lazy(() => import("./pages/ProductRequests"));
const AdminDepartments = lazy(() => import("./pages/AdminDepartments"));
const ProjectsList = lazy(() => import("./pages/ProjectsList"));
const ProjectFiles = lazy(() => import("./pages/ProjectFiles"));
const ProjectDetail = lazy(() => import("./pages/ProjectDetail"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const AdminWorkflows = lazy(() => import("./pages/AdminWorkflows"));
const AdminBackups = lazy(() => import("./pages/AdminBackups"));
const AdminDeletedCases = lazy(() => import("./pages/AdminDeletedCases"));
const AdminTrash = lazy(() => import("./pages/AdminTrash"));
const AdminTemplates = lazy(() => import("./pages/AdminTemplates"));
const AdminSecurity = lazy(() => import("./pages/AdminSecurity"));
const AdminAnnouncements = lazy(() => import("./pages/AdminAnnouncements"));
const AdminFeedback = lazy(() => import("./pages/AdminFeedback"));
const AdminAiPrompts = lazy(() => import("./pages/AdminAiPrompts"));
const AdminInsurance = lazy(() => import("./pages/AdminInsurance"));
const AdminOrders = lazy(() => import("./pages/AdminOrders"));
const AdminDeliveries = lazy(() => import("./pages/AdminDeliveries"));
const AdminSupplierInvoices = lazy(() => import("./pages/AdminSupplierInvoices"));
const AdminPurchasingReport = lazy(() => import("./pages/AdminPurchasingReport"));
const AdminCapacityPlan = lazy(() => import("./pages/AdminCapacityPlan"));
const AdminDrawings = lazy(() => import("./pages/AdminDrawings"));
const AdminFolderTemplates = lazy(() => import("./pages/AdminFolderTemplates"));
const AdminSupplierRatings = lazy(() => import("./pages/AdminSupplierRatings"));
const AdminPriceManagement = lazy(() => import("./pages/AdminPriceManagement"));
const AdminAiArticleFromPdf = lazy(() => import("./pages/AdminAiArticleFromPdf"));
const AdminSalesRouting = lazy(() => import("./pages/AdminSalesRouting"));
const AdminContainerAccess = lazy(() => import("./pages/AdminContainerAccess"));
const AdminDuplicateScan = lazy(() => import("./pages/AdminDuplicateScan"));
const Documentation = lazy(() => import("./pages/Documentation"));
const Documents = lazy(() => import("./pages/Documents"));
const DocumentDetail = lazy(() => import("./pages/DocumentDetail"));
const Profile = lazy(() => import("./pages/Profile"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const MfaChallenge = lazy(() => import("./pages/MfaChallenge"));
const MfaGuide = lazy(() => import("./pages/MfaGuide"));
const SupportTickets = lazy(() => import("./pages/SupportTickets"));
const SupportTicketDetail = lazy(() => import("./pages/SupportTicketDetail"));
const MyFeedback = lazy(() => import("./pages/MyFeedback"));
const Notes = lazy(() => import("./pages/Notes"));
const MtiqDrafts = lazy(() => import("./pages/MtiqDrafts"));
const MtiqTabletPage = lazy(() => import("./pages/MtiqTabletPage"));
const Inbox = lazy(() => import("./pages/Inbox"));
const AdminDocumentTypes = lazy(() => import("./pages/AdminDocumentTypes"));
const Issos = lazy(() => import("./pages/Issos"));
const Container3D = lazy(() => import("./pages/Container3D"));
const BusinessMap = lazy(() => import("./pages/BusinessMap"));
const AdminActionRules = lazy(() => import("./pages/AdminActionRules"));
const AdminInboxStats = lazy(() => import("./pages/AdminInboxStats"));
const PortalAuth = lazy(() => import("./pages/portal/PortalAuth"));
const PortalDashboard = lazy(() => import("./pages/portal/PortalDashboard"));
const PortalTickets = lazy(() => import("./pages/portal/PortalTickets"));
const PortalCreateTicket = lazy(() => import("./pages/portal/PortalCreateTicket"));
const PortalTicketDetail = lazy(() => import("./pages/portal/PortalTicketDetail"));
const OAuthConsent = lazy(() => import("./pages/OAuthConsent"));
const ModuleSelect = lazy(() => import("./pages/ModuleSelect"));
const CrmDashboard = lazy(() => import("./pages/crm/CrmDashboard"));
const CrmDeals = lazy(() => import("./pages/crm/CrmDeals"));
const CrmDealDetail = lazy(() => import("./pages/crm/CrmDealDetail"));
const CrmCompanies = lazy(() => import("./pages/crm/CrmCompanies"));
const CrmCompanyDetail = lazy(() => import("./pages/crm/CrmCompanyDetail"));
const CrmContacts = lazy(() => import("./pages/crm/CrmContacts"));
const CrmOffers = lazy(() => import("./pages/crm/CrmOffers"));
const CrmOfferDetail = lazy(() => import("./pages/crm/CrmOfferDetail"));
const CrmActivities = lazy(() => import("./pages/crm/CrmActivities"));
const CrmSettings = lazy(() => import("./pages/crm/CrmSettings"));
const CrmMicrosoft365 = lazy(() => import("./pages/crm/CrmMicrosoft365"));
const CrmWiki = lazy(() => import("./pages/crm/CrmWiki"));
const CrmOutbound = lazy(() => import("./pages/crm/CrmOutbound"));
const CrmSequenceDetail = lazy(() => import("./pages/crm/CrmSequenceDetail"));
const CrmEnrollments = lazy(() => import("./pages/crm/CrmEnrollments"));
const CrmLeads = lazy(() => import("./pages/crm/CrmLeads"));
const CrmCalendar = lazy(() => import("./pages/crm/CrmCalendar"));
const CrmAnalytics = lazy(() => import("./pages/crm/CrmAnalytics"));
const CrmForecast = lazy(() => import("./pages/crm/CrmForecast"));
const CrmSalesGoals = lazy(() => import("./pages/crm/CrmSalesGoals"));
const CrmLeadScoring = lazy(() => import("./pages/crm/CrmLeadScoring"));
const CrmRoles = lazy(() => import("./pages/crm/CrmRoles"));
const CrmAccess = lazy(() => import("./pages/crm/CrmAccess"));
const CrmNoAccess = lazy(() => import("./pages/crm/CrmNoAccess"));
const CrmWebForms = lazy(() => import("./pages/crm/CrmWebForms"));
const PublicOffer = lazy(() => import("./pages/public/PublicOffer"));

const queryClient = new QueryClient();

function RouteFallback() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="p-6 space-y-4 animate-in fade-in duration-200"
    >
      <div className="flex items-center gap-3">
        <div className="h-5 w-5 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
        <div className="flex flex-col">
          <span className="text-sm font-medium text-foreground">Seite wird geladen…</span>
          <span className="text-xs text-muted-foreground">
            Inhalte werden vorbereitet. Einen Moment bitte.
          </span>
        </div>
      </div>
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-96" />
      <div className="grid gap-3 mt-6">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
      <span className="sr-only">Seite wird geladen</span>
    </div>
  );
}

function ProtectedRoute({ children, enforceMfa = true }: { children: React.ReactNode; enforceMfa?: boolean }) {
  const { session, loading } = useAuth();
  const location = useLocation();
  const [mfaState, setMfaState] = useState<'unknown' | 'ok' | 'required'>('unknown');

  useEffect(() => {
    if (!session) { setMfaState('unknown'); return; }
    // 2FA-Enforcement projektweit deaktiviert
    setMfaState('ok');
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
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/auth" element={<Auth />} />
          <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/mfa-challenge" element={<MfaChallenge />} />
          <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
          <Route path="/cockpit" element={<ProtectedRoute><Cockpit /></ProtectedRoute>} />
          <Route path="/cases" element={<ProtectedRoute><CasesList /></ProtectedRoute>} />
          <Route path="/cases/kanban" element={<ProtectedRoute><CasesKanban /></ProtectedRoute>} />
          <Route path="/print/my-tasks" element={<ProtectedRoute><PrintMyTasks /></ProtectedRoute>} />
          <Route path="/print/case/:id" element={<ProtectedRoute><PrintCase /></ProtectedRoute>} />
          <Route path="/print/project/:id" element={<ProtectedRoute><PrintProject /></ProtectedRoute>} />

          <Route path="/cases/:id" element={<ProtectedRoute><CaseDetail /></ProtectedRoute>} />
          <Route path="/projects" element={<ProtectedRoute><ProjectsList /></ProtectedRoute>} />
          <Route path="/projects/:id" element={<ProtectedRoute><ProjectDetail /></ProtectedRoute>} />
          <Route path="/projects/:id/files" element={<ProtectedRoute><ProjectFiles /></ProtectedRoute>} />
          <Route path="/docs" element={<ProtectedRoute><Documentation /></ProtectedRoute>} />
          <Route path="/notes" element={<ProtectedRoute><Notes /></ProtectedRoute>} />
          <Route path="/mtiq/drafts" element={<ProtectedRoute><MtiqDrafts /></ProtectedRoute>} />
          <Route path="/mtiq/tablet/:id" element={<ProtectedRoute><MtiqTabletPage /></ProtectedRoute>} />
          <Route path="/inbox" element={<ProtectedRoute><Inbox /></ProtectedRoute>} />
          <Route path="/inbox/documents" element={<ProtectedRoute><Inbox /></ProtectedRoute>} />
          <Route path="/inbox/mtiq" element={<ProtectedRoute><MtiqDrafts /></ProtectedRoute>} />
          <Route path="/admin/document-types" element={<ProtectedRoute><AdminDocumentTypes /></ProtectedRoute>} />
          <Route path="/admin/action-rules" element={<ProtectedRoute><AdminActionRules /></ProtectedRoute>} />
          <Route path="/admin/inbox-stats" element={<ProtectedRoute><AdminInboxStats /></ProtectedRoute>} />
          <Route path="/admin/duplicate-scan" element={<ProtectedRoute><AdminDuplicateScan /></ProtectedRoute>} />
          <Route path="/support" element={<ProtectedRoute><SupportTickets /></ProtectedRoute>} />
          <Route path="/support/:id" element={<ProtectedRoute><SupportTicketDetail /></ProtectedRoute>} />
          <Route path="/feedback" element={<ProtectedRoute><MyFeedback /></ProtectedRoute>} />
          <Route path="/admin/users" element={<ProtectedRoute><AdminUsers /></ProtectedRoute>} />
          <Route path="/admin/dashboard" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
          <Route path="/admin/master-data" element={<ProtectedRoute><AdminMasterData /></ProtectedRoute>} />
          <Route path="/admin/partners" element={<Navigate to="/crm/companies" replace />} />
          <Route path="/admin/articles" element={<ProtectedRoute><AdminArticles /></ProtectedRoute>} />
          <Route path="/admin/inventory" element={<ProtectedRoute><AdminInventory /></ProtectedRoute>} />
          <Route path="/admin/storage-locations" element={<Navigate to="/admin/inventory" replace />} />
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
          <Route path="/admin/feedback" element={<ProtectedRoute><AdminFeedback /></ProtectedRoute>} />
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
          <Route path="/preismanagement" element={<ProtectedRoute><AdminPriceManagement /></ProtectedRoute>} />
          <Route path="/ki-artikel" element={<ProtectedRoute><AdminAiArticleFromPdf /></ProtectedRoute>} />
          <Route path="/crm/settings/routing" element={<CrmProtectedRoute><AdminSalesRouting /></CrmProtectedRoute>} />
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
          <Route path="/crm/analytics" element={<CrmProtectedRoute><CrmAnalytics /></CrmProtectedRoute>} />
          <Route path="/crm/forecast" element={<CrmProtectedRoute><CrmForecast /></CrmProtectedRoute>} />
          <Route path="/crm/settings/ziele" element={<CrmProtectedRoute><CrmSalesGoals /></CrmProtectedRoute>} />
          <Route path="/crm/settings/scoring" element={<CrmProtectedRoute><CrmLeadScoring /></CrmProtectedRoute>} />
          <Route path="/crm/settings/webformulare" element={<CrmProtectedRoute><CrmWebForms /></CrmProtectedRoute>} />
          <Route path="/crm/settings/microsoft-365" element={<CrmProtectedRoute><CrmMicrosoft365 /></CrmProtectedRoute>} />
          <Route path="/p/offer/:token" element={<PublicOffer />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </PreferencesProvider>
  );
}

function PortalApp() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="auth" element={<PortalAuth />} />
        <Route path="" element={<PortalProtectedRoute><PortalDashboard /></PortalProtectedRoute>} />
        <Route path="tickets" element={<PortalProtectedRoute><PortalTickets /></PortalProtectedRoute>} />
        <Route path="tickets/new" element={<PortalProtectedRoute><PortalCreateTicket /></PortalProtectedRoute>} />
        <Route path="tickets/:id" element={<PortalProtectedRoute><PortalTicketDetail /></PortalProtectedRoute>} />
      </Routes>
    </Suspense>
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
