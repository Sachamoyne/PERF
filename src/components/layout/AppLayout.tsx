import { useEffect, useRef, type CSSProperties } from "react";
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
import { isIphoneSourceDevice } from "@/lib/platform";

const MIN_SYNC_INTERVAL_MS = 15 * 60 * 1000; // 15 min entre deux syncs foreground

function useAutoSync() {
  const { user } = useAuth();
  const { data: syncStatus } = useSyncStatus();
  const queryClient = useQueryClient();
  const lastSeenSyncAtRef = useRef<number | null>(null);

  const runSync = (userId: string, reason: string) => {
    if (!isSyncUploadAllowed()) return;
    if (!isIphoneSourceDevice()) return;

    console.log(`[autoSync] Démarrage sync (${reason})...`);
    syncAppleHealth(userId)
      .then(async (result) => {
        console.log("[autoSync] ✓ Sync terminé:", result.importedSamples);
        await refreshDashboardAfterSync(queryClient);
      })
      .catch((err) => {
        console.warn("[autoSync] Sync échoué (silencieux):", err.message);
      });
  };

  useEffect(() => {
    const next = syncStatus?.lastSync?.getTime() ?? null;
    if (next == null) {
      lastSeenSyncAtRef.current = null;
      return;
    }

    if (lastSeenSyncAtRef.current == null) {
      lastSeenSyncAtRef.current = next;
      return;
    }

    if (next > lastSeenSyncAtRef.current) {
      lastSeenSyncAtRef.current = next;
      void refreshDashboardAfterSync(queryClient);
    }
  }, [queryClient, syncStatus?.lastSync]);

  // Sync au montage si jamais synchronisé ou sync > 1h
  useEffect(() => {
    if (!user) return;
    const shouldSync = !syncStatus?.lastSync ||
      (Date.now() - syncStatus.lastSync.getTime()) > 60 * 60 * 1000;
    if (shouldSync) runSync(user.id, "montage");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, syncStatus?.lastSync?.getTime()]);

  // Sync au retour au premier plan (visibilitychange) si > 30 min depuis le dernier sync
  useEffect(() => {
    if (!user) return;

    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      const lastSync = syncStatus?.lastSync;
      const elapsed = lastSync ? Date.now() - lastSync.getTime() : Infinity;
      if (elapsed >= MIN_SYNC_INTERVAL_MS) {
        runSync(user.id, "retour premier plan");
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, syncStatus?.lastSync?.getTime()]);
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
