import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import Dashboard from "./pages/Dashboard";

import Running from "./pages/Running";
import Cycling from "./pages/Cycling";
import Swimming from "./pages/Swimming";
import Racket from "./pages/Racket";
import Strength from "./pages/Strength";
import Journal from "./pages/Journal";
import SettingsPage from "./pages/SettingsPage";
import AuthPage from "./pages/AuthPage";
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

function ProtectedRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground text-sm">Chargement...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/running" element={<Running />} />
        <Route path="/cycling" element={<Cycling />} />
        <Route path="/swimming" element={<Swimming />} />
        <Route path="/racket" element={<Racket />} />
        <Route path="/strength" element={<Strength />} />
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

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground text-sm">Chargement...</div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/auth" element={user ? <Navigate to="/" replace /> : <AuthPage />} />
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
