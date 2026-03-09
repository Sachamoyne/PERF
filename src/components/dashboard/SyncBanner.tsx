import { AlertTriangle, RefreshCw } from "lucide-react";
import { useSyncStatus } from "@/hooks/useSyncStatus";

export function SyncBanner() {
  const { data: syncStatus } = useSyncStatus();

  if (!syncStatus?.isStale) return null;

  return (
    <div className="glass-card border-destructive/30 p-3 flex items-center gap-3">
      <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />
      <p className="text-sm text-foreground flex-1">
        <span className="font-medium">Connexion Garmin inactive</span>
        <span className="text-muted-foreground ml-1">
          — Aucune donnée reçue depuis plus de 48h.
        </span>
      </p>
      <button className="text-xs text-primary hover:underline flex items-center gap-1">
        <RefreshCw className="h-3 w-3" />
        Reconnecter
      </button>
    </div>
  );
}
