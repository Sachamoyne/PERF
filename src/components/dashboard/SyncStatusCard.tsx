import { useState, useEffect } from "react";
import { Loader2, Smartphone } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import { syncAppleHealth } from "@/services/appleHealth";
import type { AppleHealthSyncResult } from "@/services/appleHealth";
import { Button } from "@/components/ui/button";
import { refreshDashboardAfterSync } from "@/lib/syncRefresh";
import { isSyncUploadAllowed } from "@/lib/syncConsent";
import { isIphoneSourceDevice } from "@/lib/platform";

type SyncActionResult =
  | { kind: "iphone"; data: AppleHealthSyncResult }
  | { kind: "cloud" };

function useApplePlatform() {
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    setIsIos(isIphoneSourceDevice());
  }, []);

  return { isIos };
}

export function SyncStatusCard() {
  const { user } = useAuth();
  const { data: syncStatus } = useSyncStatus();
  const { isIos } = useApplePlatform();
  const queryClient = useQueryClient();

  const mutation = useMutation<SyncActionResult, Error>({
    mutationFn: async () => {
      if (!user) throw new Error("Non authentifié — reconnecte-toi avant de synchroniser.");

      if (isIphoneSourceDevice() && isSyncUploadAllowed()) {
        const data = await syncAppleHealth(user.id);
        await refreshDashboardAfterSync(queryClient);
        return { kind: "iphone", data };
      }

      await refreshDashboardAfterSync(queryClient);
      await new Promise((resolve) => setTimeout(resolve, 450));
      return { kind: "cloud" };
    },
  });

  const isSyncing = mutation.isPending;

  const lastSyncLabel = syncStatus?.lastSync
    ? syncStatus.label
    : "Aucune synchronisation Apple Health pour l'instant";

  const connectionLabel = isIos ? "Apple Health disponible" : "Apple Health non disponible sur cet appareil";

  return (
    <div className="glass-card p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border border-glass-border/60 bg-background/80 backdrop-blur-xl">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center shadow-[0_0_20px_rgba(34,197,94,0.3)]">
          <Smartphone className="h-5 w-5 text-primary" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">Sync Apple Health</p>
          <p className="text-xs text-muted-foreground">{lastSyncLabel}</p>
          <p className="text-xs text-muted-foreground">{connectionLabel}</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {mutation.isSuccess && !isSyncing && mutation.data?.kind === "iphone" && (() => {
          const d = mutation.data.data;
          const diag = d?.diagnosticReport;
          const auth = diag?.permissions.authorized ?? [];
          const s = diag?.samples;
          return (
            <div className="text-xs text-primary/80 space-y-0.5">
              <p>Sync terminé — HRV: {d?.importedHrv ?? 0}, Sommeil: {d?.importedSleep ?? 0}, Pas: {d?.importedSteps ?? 0}, Calories: {d?.importedCalories ?? 0}, Poids: {d?.importedWeight ?? 0}</p>
              {diag && (
                <>
                  <p className="text-muted-foreground">Permissions: {auth.length > 0 ? auth.join(", ") : "aucune"}</p>
                  <p className="text-muted-foreground">Données trouvées: steps={s?.steps ?? "?"} j, calories={s?.calories ?? "?"} j, hrv={s?.hrv ?? "?"}, sleep={s?.sleep ?? "?"}, weight={s?.weight ?? "?"}</p>
                </>
              )}
            </div>
          );
        })()}
        {mutation.isSuccess && !isSyncing && mutation.data?.kind === "cloud" && (
          <span className="text-xs text-primary/80">Données cloud actualisées</span>
        )}
        {mutation.isError && !isSyncing && (
          <span className="text-xs text-destructive/80">
            {(mutation.error as Error).message || "Erreur de synchronisation"}
          </span>
        )}
        <Button
          size="sm"
          className="relative overflow-hidden bg-sky-500 hover:bg-sky-400 text-white shadow-[0_10px_30px_rgba(56,189,248,0.55)]"
          onClick={() => mutation.mutate()}
          disabled={isSyncing || !user}
        >
          <span className="flex items-center gap-2">
            <Loader2
              className={`h-4 w-4 ${isSyncing ? "animate-spin" : "opacity-40 group-hover:opacity-100 transition-opacity"}`}
            />
            {isSyncing ? "Sync en cours..." : isIos ? "Sync iPhone" : "Actualiser"}
          </span>
        </Button>
      </div>
    </div>
  );
}
