import { useQueryClient, useIsFetching } from "@tanstack/react-query";
import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/useAuth";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import { syncAppleHealth } from "@/services/appleHealth";
import { refreshDashboardAfterSync } from "@/lib/syncRefresh";
import { useIsMobile } from "@/hooks/use-mobile";
import { isSyncUploadAllowed } from "@/lib/syncConsent";
import { isIphoneSourceDevice } from "@/lib/platform";

export function AppHeader() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isSyncing, setIsSyncing] = useState(false);
  const { data: syncStatus } = useSyncStatus();
  const isFetching = useIsFetching();
  const isMobile = useIsMobile();

  const handleSync = async () => {
    if (!user || isSyncing) return;
    setIsSyncing(true);
    try {
      if (isIphoneSourceDevice() && isSyncUploadAllowed()) {
        await syncAppleHealth(user.id);
      }
      await refreshDashboardAfterSync(queryClient);
      await new Promise((resolve) => setTimeout(resolve, 450));
    } catch {
      // silencieux
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <>
      <header
        className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-background/92 backdrop-blur-md px-4 pb-2"
        style={{ paddingTop: "var(--sat, 20px)" }}
      >
        <div className="flex items-center gap-2">
          {!isMobile ? <SidebarTrigger /> : null}
        </div>
        <div className="flex items-center gap-3">
          {syncStatus && (
            <div className="flex items-center gap-1.5">
              <div
                className={`h-2 w-2 rounded-full ${
                  isFetching > 0
                    ? "bg-primary animate-pulse"
                    : syncStatus?.isRecent
                      ? "bg-primary"
                      : syncStatus?.isStale
                        ? "bg-destructive"
                        : "bg-running"
                }`}
              />
              <button
                onClick={handleSync}
                disabled={isSyncing || isFetching > 0}
                className="h-6 w-6 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-40"
                title="Synchroniser"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`} />
              </button>
              <span className="text-xs text-muted-foreground hidden sm:inline">
                {syncStatus.label}
              </span>
            </div>
          )}
        </div>
      </header>
    </>
  );
}
