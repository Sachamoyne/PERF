import { RefreshCw, User, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/useAuth";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import { generateTestData, clearTestData } from "@/lib/mock-data";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export function AppHeader() {
  const [syncing, setSyncing] = useState(false);
  const [mocking, setMocking] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const { user } = useAuth();
  const { data: syncStatus } = useSyncStatus();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const handleSync = () => {
    setConnectOpen(true);
  };

  const handleSimulateConnect = async () => {
    setConnectOpen(false);
    setSyncing(true);
    // Simulate Terra/Garmin webhook callback
    await new Promise((r) => setTimeout(r, 2500));
    setSyncing(false);
    queryClient.invalidateQueries({ queryKey: ["sync_status"] });
    toast.success("Synchronisation Garmin terminée");
  };

  const handleMockData = async () => {
    if (!user) {
      toast.error("Connectez-vous d'abord via la page Paramètres");
      navigate("/settings");
      return;
    }
    setMocking(true);
    try {
      await clearTestData(user.id);
      await generateTestData(user.id);
      queryClient.invalidateQueries();
      toast.success("Données de test ajoutées !");
    } catch (e) {
      toast.error("Erreur lors de l'ajout des données");
    }
    setMocking(false);
  };

  return (
    <>
      <header className="h-14 flex items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-2">
          <SidebarTrigger />
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleMockData}
            disabled={mocking}
            className="text-xs"
          >
            {mocking ? "Chargement..." : "📊 Add Mock Data"}
          </Button>

          <div className="flex items-center gap-2">
            {/* Sync status indicator */}
            {syncStatus && (
              <div className="flex items-center gap-1.5">
                <div
                  className={`h-2 w-2 rounded-full ${
                    syncStatus.isRecent
                      ? "bg-primary animate-pulse-glow"
                      : syncStatus.isStale
                      ? "bg-destructive"
                      : "bg-running"
                  }`}
                />
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  {syncStatus.label}
                </span>
              </div>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={handleSync}
              disabled={syncing}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Synchro..." : "Sync Garmin"}
            </Button>
          </div>

          <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center">
            <User className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
      </header>

      {/* Garmin/Terra connect dialog */}
      <Dialog open={connectOpen} onOpenChange={setConnectOpen}>
        <DialogContent className="glass-card border-glass-border">
          <DialogHeader>
            <DialogTitle className="font-display text-foreground">Connexion Garmin Connect</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Connectez votre compte Garmin via Terra API pour synchroniser automatiquement vos activités et données de santé.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="glass-card p-4 space-y-2">
              <p className="text-sm font-medium text-foreground">Étape 1 — Autorisation</p>
              <p className="text-xs text-muted-foreground">
                Vous serez redirigé vers Garmin Connect pour autoriser l'accès à vos données.
              </p>
              <a
                href="https://connect.garmin.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-medium ring-offset-background hover:bg-accent hover:text-accent-foreground"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Ouvrir Garmin Connect
              </a>
            </div>
            <div className="glass-card p-4 space-y-2">
              <p className="text-sm font-medium text-foreground">Étape 2 — Synchroniser</p>
              <p className="text-xs text-muted-foreground">
                Une fois autorisé, les données seront envoyées via webhook vers votre endpoint.
              </p>
              <Button
                size="sm"
                className="w-full"
                onClick={handleSimulateConnect}
              >
                Simuler la synchronisation
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
