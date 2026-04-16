import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { useUserProfile } from "@/hooks/useUserProfile";
import { getSyncConsent, setSyncConsent } from "@/lib/syncConsent";
import { requestHealthPermissions } from "@/services/health";
import Dashboard from "./pages/Dashboard";

import Running from "./pages/Running";
import Cycling from "./pages/Cycling";
import Swimming from "./pages/Swimming";
import Racket from "./pages/Racket";
import Strength from "./pages/Strength";
import SportMenu from "./pages/SportMenu";
import Journal from "./pages/Journal";
import SettingsPage from "./pages/SettingsPage";
import AuthPage from "./pages/AuthPage";
import OnboardingPage from "./pages/OnboardingPage";
import ConsentPage from "./pages/ConsentPage";
import NotFound from "./pages/NotFound";
import {
  CaloriesDetailPage,
  WeightDetailPage,
  BodyFatDetailPage,
  ProteinDetailPage,
  SleepDetailPage,
  StepsDetailPage,
  HrvDetailPage,
  Vo2maxDetailPage,
  TrainingDetailPage,
} from "./pages/DashboardDetailPages";

const queryClient = new QueryClient();

function LoggedRedirect({
  to,
  authState,
}: {
  to: string;
  authState: {
    isAuthenticated: boolean;
    authLoading: boolean;
    profileLoading: boolean;
    isProfileComplete: boolean;
    pathname: string;
  };
}) {
  console.log("[router] navigation vers:", to, "auth state:", authState);
  return <Navigate to={to} replace />;
}

function ProtectedRoutes() {
  const { user, loading } = useAuth();
  const { isLoading: profileLoading, isComplete: isProfileComplete } = useUserProfile();
  const location = useLocation();

  if (loading || (user && profileLoading)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground text-sm">Chargement...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <LoggedRedirect
        to="/auth"
        authState={{
          isAuthenticated: false,
          authLoading: loading,
          profileLoading,
          isProfileComplete,
          pathname: location.pathname,
        }}
      />
    );
  }
  
  if (!isProfileComplete) {
    return (
      <LoggedRedirect
        to="/onboarding"
        authState={{
          isAuthenticated: true,
          authLoading: loading,
          profileLoading,
          isProfileComplete,
          pathname: location.pathname,
        }}
      />
    );
  }

  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/running" element={<Running />} />
        <Route path="/cycling" element={<Cycling />} />
        <Route path="/swimming" element={<Swimming />} />
        <Route path="/racket" element={<Racket />} />
        <Route path="/strength" element={<Strength />} />
        <Route path="/sport" element={<SportMenu />} />
        <Route path="/journal" element={<Journal />} />
        <Route path="/details/calories" element={<CaloriesDetailPage />} />
        <Route path="/details/weight" element={<WeightDetailPage />} />
        <Route path="/details/body-fat" element={<BodyFatDetailPage />} />
        <Route path="/details/protein" element={<ProteinDetailPage />} />
        <Route path="/details/sleep" element={<SleepDetailPage />} />
        <Route path="/details/steps" element={<StepsDetailPage />} />
        <Route path="/details/hrv" element={<HrvDetailPage />} />
        <Route path="/details/vo2max" element={<Vo2maxDetailPage />} />
        <Route path="/details/training" element={<TrainingDetailPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AppLayout>
  );
}

function AppRoutes() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isAuthorizingHealth, setIsAuthorizingHealth] = useState(false);
  const queryClient = useQueryClient();
  const previousUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    const currentUserId = user?.id ?? null;
    if (previousUserIdRef.current !== null && previousUserIdRef.current !== currentUserId) {
      queryClient.clear();
    }
    previousUserIdRef.current = currentUserId;
  }, [queryClient, user?.id]);

  const handleConsentAccept = async () => {
    setSyncConsent(true);
    setIsAuthorizingHealth(true);
    try {
      await requestHealthPermissions();
    } finally {
      setIsAuthorizingHealth(false);
      navigate("/dashboard", { replace: true });
    }
  };

  const handleConsentDecline = () => {
    setSyncConsent(false);
    navigate("/dashboard", { replace: true });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground text-sm">Chargement...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route path="*" element={<LoggedRedirect to="/auth" authState={{
          isAuthenticated: false,
          authLoading: loading,
          profileLoading: false,
          isProfileComplete: false,
          pathname: location.pathname,
        }} />} />
      </Routes>
    );
  }

  if (getSyncConsent() === "unknown") {
    return (
      <Routes>
        <Route
          path="/consent"
          element={
            <ConsentPage
              onAccept={handleConsentAccept}
              onDecline={handleConsentDecline}
              isLoading={isAuthorizingHealth}
            />
          }
        />
        <Route path="*" element={<LoggedRedirect
          to="/consent"
          authState={{
            isAuthenticated: true,
            authLoading: loading,
            profileLoading: false,
            isProfileComplete: false,
            pathname: location.pathname,
          }}
        />} />
      </Routes>
    );
  }

  return <PostConsentRoutes />;
}

function PostConsentRoutes() {
  const { user, loading } = useAuth();
  const { isLoading: profileLoading, isComplete: isProfileComplete } = useUserProfile();
  const location = useLocation();
  const onboardingEditMode = location.pathname === "/onboarding" && new URLSearchParams(location.search).get("mode") === "edit";

  if (!user || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground text-sm">Chargement...</div>
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/auth"
        element={
          profileLoading
            ? (
              <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="text-muted-foreground text-sm">Chargement...</div>
              </div>
            )
            : isProfileComplete
              ? (
                <LoggedRedirect
                  to="/dashboard"
                  authState={{
                    isAuthenticated: true,
                    authLoading: loading,
                    profileLoading,
                    isProfileComplete,
                    pathname: location.pathname,
                  }}
                />
              )
              : (
                <LoggedRedirect
                  to="/onboarding"
                  authState={{
                    isAuthenticated: true,
                    authLoading: loading,
                    profileLoading,
                    isProfileComplete,
                    pathname: location.pathname,
                  }}
                />
              )
        }
      />
      <Route
        path="/onboarding"
        element={
          profileLoading
            ? (
              <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="text-muted-foreground text-sm">Chargement...</div>
              </div>
            )
            : isProfileComplete && !onboardingEditMode
              ? (
                <LoggedRedirect
                  to="/dashboard"
                  authState={{
                    isAuthenticated: true,
                    authLoading: loading,
                    profileLoading,
                    isProfileComplete,
                    pathname: location.pathname,
                  }}
                />
              )
              : <OnboardingPage />
        }
      />
      <Route path="/consent" element={<Navigate to="/dashboard" replace />} />
      <Route path="/*" element={<ProtectedRoutes />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner />
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
