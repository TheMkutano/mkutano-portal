import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@workspace/replit-auth-web";
import { useGetMe } from "@workspace/api-client-react";
import NotFound from "@/pages/not-found";
import { ConveningProvider } from "@/contexts/ConveningContext";
import { CurrencyProvider } from "@/contexts/CurrencyContext";
import { BrandingProvider } from "@/contexts/BrandingContext";
import Shell from "@/components/layout/Shell";
import Login from "@/components/auth/Login";
import PendingAccess from "@/components/auth/PendingAccess";
import SetPassword from "@/pages/SetPassword";
import Setup from "@/pages/Setup";
import Register from "@/pages/Register";
import RequestAccess from "@/pages/RequestAccess";
import ResetPassword from "@/pages/ResetPassword";

// Pages
import Dashboard from "@/pages/Dashboard";
import Partners from "@/pages/Partners";
import PartnerDetail from "@/pages/PartnerDetail";
import Speakers from "@/pages/Speakers";
import SpeakerDetail from "@/pages/SpeakerDetail";
import Tasks from "@/pages/Tasks";
import Budget from "@/pages/Budget";
import Settings from "@/pages/Settings";
import Agenda from "@/pages/Agenda";
import ServiceProviders from "@/pages/ServiceProviders";
import DealRoom from "@/pages/DealRoom";
import Outcomes from "@/pages/Outcomes";
import Documents from "@/pages/Documents";
import Delegates from "@/pages/Delegates";
import Exhibition from "@/pages/Exhibition";
import Team from "@/pages/Team";
import AuditLog from "@/pages/AuditLog";
import Trash from "@/pages/Trash";
import Roadmap from "@/pages/Roadmap";

const queryClient = new QueryClient();

function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  
  if (isAuthLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }
  
  if (!isAuthenticated) {
    return <Login />;
  }
  
  return <ProfileGate>{children}</ProfileGate>;
}

function ProfileGate({ children }: { children: React.ReactNode }) {
  const { data: profile, isLoading, error } = useGetMe();
  
  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading profile...</div>;
  }
  
  if (error || !profile) {
    return <PendingAccess />;
  }
  
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Shell>
      <Switch>
        <Route path="/">
          <Redirect to="/dashboard" />
        </Route>
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/partners" component={Partners} />
        <Route path="/partners/:id" component={PartnerDetail} />
        <Route path="/speakers" component={Speakers} />
        <Route path="/speakers/:id" component={SpeakerDetail} />
        <Route path="/tasks" component={Tasks} />
        <Route path="/roadmap" component={Roadmap} />
        <Route path="/agenda" component={Agenda} />
        <Route path="/budget" component={Budget} />
        <Route path="/service-providers" component={ServiceProviders} />
        <Route path="/delegates" component={Delegates} />
        <Route path="/exhibition" component={Exhibition} />
        <Route path="/deal-room" component={DealRoom} />
        <Route path="/outcomes" component={Outcomes} />
        <Route path="/documents" component={Documents} />
        <Route path="/team" component={Team} />
        <Route path="/settings" component={Settings} />
        <Route path="/audit" component={AuditLog} />
        <Route path="/trash" component={Trash} />
        <Route component={NotFound} />
      </Switch>
    </Shell>
  );
}

const PRE_AUTH_PATHS = ["/set-password", "/setup", "/register", "/request-access", "/reset-password"];

function App() {
  const path = window.location.pathname;
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const localPath = base ? path.replace(base, "") || "/" : path;
  const isPreAuth = PRE_AUTH_PATHS.some((p) => localPath === p || localPath.startsWith(p + "?"));

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={base}>
          {isPreAuth ? (
            <Switch>
              <Route path="/set-password" component={SetPassword} />
              <Route path="/setup" component={Setup} />
              <Route path="/register" component={Register} />
              <Route path="/request-access" component={RequestAccess} />
              <Route path="/reset-password" component={ResetPassword} />
            </Switch>
          ) : (
            <AuthGate>
              <ConveningProvider>
                <BrandingProvider>
                  <CurrencyProvider>
                    <AppRoutes />
                  </CurrencyProvider>
                </BrandingProvider>
              </ConveningProvider>
            </AuthGate>
          )}
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
