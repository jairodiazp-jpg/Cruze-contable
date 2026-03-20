import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense, lazy, type ReactNode } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import { RealtimeTaskNotifier } from "@/components/RealtimeTaskNotifier";
import { SupportChatbot } from "@/components/SupportChatbot";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Inventory = lazy(() => import("./pages/Inventory"));
const Tickets = lazy(() => import("./pages/Tickets"));
const Deliveries = lazy(() => import("./pages/Deliveries"));
const KnowledgeBase = lazy(() => import("./pages/KnowledgeBase"));
const Reports = lazy(() => import("./pages/Reports"));
const Devices = lazy(() => import("./pages/Devices"));
const Automation = lazy(() => import("./pages/Automation"));
const Diagnostics = lazy(() => import("./pages/Diagnostics"));
const SystemLogs = lazy(() => import("./pages/SystemLogs"));
const RoleProfiles = lazy(() => import("./pages/RoleProfiles"));
const Backups = lazy(() => import("./pages/Backups"));
const EmailProvisioning = lazy(() => import("./pages/EmailProvisioning"));
const VpnManager = lazy(() => import("./pages/VpnManager"));
const FirewallManager = lazy(() => import("./pages/FirewallManager"));
const UserRoles = lazy(() => import("./pages/UserRoles"));
const Licenses = lazy(() => import("./pages/Licenses"));
const CorporateProvisioning = lazy(() => import("./pages/CorporateProvisioning"));
const EmployeePortal = lazy(() => import("./pages/EmployeePortal"));
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const AcceptInvitation = lazy(() => import("./pages/AcceptInvitation"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const PageFallback = () => (
  <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
    Cargando modulo...
  </div>
);

const ProtectedPage = ({ children }: { children: ReactNode }) => (
  <ProtectedRoute>
    <AppLayout>{children}</AppLayout>
  </ProtectedRoute>
);


const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <RealtimeTaskNotifier />
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<PageFallback />}>
            <Routes>
              {/* ...existing routes... */}
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/aceptar-invitacion" element={<AcceptInvitation />} />
              <Route path="/" element={<ProtectedPage><Dashboard /></ProtectedPage>} />
              <Route path="/dispositivos" element={<ProtectedPage><Devices /></ProtectedPage>} />
              <Route path="/inventario" element={<ProtectedPage><Inventory /></ProtectedPage>} />
              <Route path="/tickets" element={<ProtectedPage><Tickets /></ProtectedPage>} />
              <Route path="/automatizacion" element={<ProtectedPage><Automation /></ProtectedPage>} />
              <Route path="/diagnosticos" element={<ProtectedPage><Diagnostics /></ProtectedPage>} />
              <Route
                path="/perfiles"
                element={<ProtectedRoute allowedRoles={["admin", "technician"]}><AppLayout><RoleProfiles /></AppLayout></ProtectedRoute>}
              />
              <Route path="/entregas" element={<ProtectedPage><Deliveries /></ProtectedPage>} />
              <Route path="/backups" element={<ProtectedPage><Backups /></ProtectedPage>} />
              <Route path="/email" element={<ProtectedPage><EmailProvisioning /></ProtectedPage>} />
              <Route path="/vpn" element={<ProtectedPage><VpnManager /></ProtectedPage>} />
              <Route path="/firewall" element={<ProtectedPage><FirewallManager /></ProtectedPage>} />
              <Route path="/licencias" element={<ProtectedPage><Licenses /></ProtectedPage>} />
              <Route path="/corporativo" element={<ProtectedPage><CorporateProvisioning /></ProtectedPage>} />
              <Route path="/conocimiento" element={<ProtectedPage><KnowledgeBase /></ProtectedPage>} />
              <Route path="/logs" element={<ProtectedPage><SystemLogs /></ProtectedPage>} />
              <Route path="/roles" element={<ProtectedRoute allowedRoles={["admin"]}><AppLayout><UserRoles /></AppLayout></ProtectedRoute>} />
              <Route path="/reportes" element={<ProtectedPage><Reports /></ProtectedPage>} />
              <Route path="/portal" element={<ProtectedPage><EmployeePortal /></ProtectedPage>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
            <SupportChatbot />
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
