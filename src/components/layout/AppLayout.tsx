import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { AppHeader } from "./AppHeader";
import { AppleHealthOnboarding } from "@/components/health/AppleHealthOnboarding";
import { useAuth } from "@/hooks/useAuth";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import { syncAppleHealth } from "@/services/appleHealth";

function useAutoSync() {
  const { user } = useAuth();
  const { data: syncStatus } = useSyncStatus();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user) return;

    // Sync automatique si jamais synchronisé ou sync > 6h
    const shouldSync = !syncStatus?.lastSync ||
      (Date.now() - syncStatus.lastSync.getTime()) > 6 * 60 * 60 * 1000;

    if (!shouldSync) return;

    console.log("[autoSync] Démarrage sync automatique...");

    syncAppleHealth(user.id)
      .then((result) => {
        console.log("[autoSync] ✓ Sync terminé:", result.importedSamples);
        // Invalider toutes les queries après sync
        queryClient.invalidateQueries({ queryKey: ["health_metrics"] });
        queryClient.invalidateQueries({ queryKey: ["body_metrics"] });
        queryClient.invalidateQueries({ queryKey: ["body_metrics_latest"] });
        queryClient.invalidateQueries({ queryKey: ["activities"] });
        queryClient.invalidateQueries({ queryKey: ["weekly_summary"] });
        queryClient.invalidateQueries({ queryKey: ["sync_status"] });
        queryClient.invalidateQueries({ queryKey: ["latest_nutrition"] });
        queryClient.invalidateQueries({ queryKey: ["today_workouts"] });
        queryClient.invalidateQueries({ queryKey: ["calorie_balance"] });
        queryClient.invalidateQueries({ queryKey: ["kpi_metric"] });
        queryClient.invalidateQueries({ queryKey: ["kpi_body_metric"] });
      })
      .catch((err) => {
        console.warn("[autoSync] Sync échoué (silencieux):", err.message);
      });
  }, [queryClient, user?.id, syncStatus?.lastSync?.getTime()]);
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  useAutoSync();

  return (
    <SidebarProvider className="flex h-screen w-full overflow-hidden">
      <AppSidebar />
      <div className="flex-1 flex flex-col overflow-hidden" style={{ paddingBottom: "var(--sab, 0px)" }}>
        <AppHeader />
        <main className="flex-1 overflow-y-auto p-6 bg-background">{children}</main>
      </div>
      <AppleHealthOnboarding />
    </SidebarProvider>
  );
}
