import { useEffect, type CSSProperties } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { AppHeader } from "./AppHeader";
import { BottomTabBar } from "./BottomTabBar";
import { useAuth } from "@/hooks/useAuth";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import { syncAppleHealth } from "@/services/appleHealth";
import { refreshDashboardAfterSync } from "@/lib/syncRefresh";
import { useIsMobile } from "@/hooks/use-mobile";
import { isSyncUploadAllowed } from "@/lib/syncConsent";

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
    if (!isSyncUploadAllowed()) return;
    const plt = (() => { try { return (window as any).Capacitor?.getPlatform?.() ?? "web"; } catch { return "web"; } })();
    if (plt !== "ios" && plt !== "android") return;

    console.log("[autoSync] Démarrage sync automatique...");

    syncAppleHealth(user.id)
      .then(async (result) => {
        console.log("[autoSync] ✓ Sync terminé:", result.importedSamples);
        await refreshDashboardAfterSync(queryClient);
      })
      .catch((err) => {
        console.warn("[autoSync] Sync échoué (silencieux):", err.message);
      });
  }, [queryClient, user?.id, syncStatus?.lastSync?.getTime()]);
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  useAutoSync();
  const isMobile = useIsMobile();

  return (
    <SidebarProvider
      className="flex h-screen w-full overflow-hidden"
      style={
        {
          "--sidebar-width": "220px",
          "--sidebar-width-icon": "56px",
        } as CSSProperties
      }
    >
      {!isMobile ? <AppSidebar /> : null}
      <div className="flex-1 flex flex-col overflow-hidden" style={{ paddingBottom: "var(--sab, 0px)" }}>
        <AppHeader />
        <main className={`flex-1 overflow-y-auto bg-background ${isMobile ? "p-4 pb-[calc(80px+env(safe-area-inset-bottom,0px))]" : "p-6"}`}>
          {children}
        </main>
      </div>
      {isMobile ? <BottomTabBar /> : null}
    </SidebarProvider>
  );
}
