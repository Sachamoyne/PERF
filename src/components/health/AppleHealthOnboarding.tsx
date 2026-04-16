import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Heart, HeartPulse, Loader2, Settings, RefreshCw } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { syncAppleHealth } from "@/services/appleHealth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { isIphoneSourceDevice } from "@/lib/platform";

function isIosLike() {
  return isIphoneSourceDevice();
}

/** Retourne true si le message d'erreur indique un refus explicite des permissions. */
function isDeniedError(message: string) {
  return (
    message.includes("Réglages") ||
    message.includes("refus") ||
    message.includes("denied") ||
    message.includes("not authorized")
  );
}

export function AppleHealthOnboarding() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [showSettingsHint, setShowSettingsHint] = useState(false);
  const [lastResult, setLastResult] = useState<any | null>(null);

  useEffect(() => {
    if (!user || !isIosLike()) return;
    const key = `apple_health_onboarding:${user.id}`;
    const status = localStorage.getItem(key);
    // Afficher si jamais vu, ou si une tentative précédente avait échoué
    if (!status || status === "error") {
      setOpen(true);
    }
  }, [user]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Non authentifié");
      return syncAppleHealth(user.id);
    },
    onSuccess: (res) => {
      if (user) {
        localStorage.setItem(`apple_health_onboarding:${user.id}`, "accepted");
      }
      setShowSettingsHint(false);
      setLastResult(res);
      qc.invalidateQueries();
      // On ne ferme plus automatiquement: on affiche un récap visible dans le popup.
    },
    onError: (err: any) => {
      const message: string = err?.message || "Échec de la synchronisation Apple Health";
      const isDenied = isDeniedError(message);

      if (isDenied) {
        setShowSettingsHint(true);
        setLastResult(null);
        if (user) {
          localStorage.setItem(`apple_health_onboarding:${user.id}`, "error");
        }
      } else {
        toast.error(message);
        setLastResult(null);
        if (user) {
          localStorage.setItem(`apple_health_onboarding:${user.id}`, "error");
        }
      }
    },
  });

  const handleLater = () => {
    if (user) {
      localStorage.setItem(`apple_health_onboarding:${user.id}`, "dismissed");
    }
    setOpen(false);
  };

  if (!user || !isIosLike()) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="glass-card border-glass-border max-w-md bg-background/85 backdrop-blur-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-red-500/10 text-red-500">
              ❤️
            </span>
            Connecter Apple Health
          </DialogTitle>
          <DialogDescription className="text-muted-foreground space-y-2">
            <p className="text-sm font-semibold text-foreground">Cette app utilise Apple HealthKit</p>
            <p>Les données de santé suivantes seront lues depuis Apple Santé :</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Activité physique</li>
              <li>Nutrition</li>
              <li>Sommeil</li>
              <li>Fréquence cardiaque</li>
              <li>Composition corporelle</li>
              <li>Pas</li>
            </ul>
          </DialogDescription>
        </DialogHeader>

        {lastResult ? (
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <p className="text-sm font-medium text-foreground">Synchronisation terminée</p>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>
                <span className="text-foreground font-medium">Import</span>{" "}
                — HRV {lastResult.importedHrv}j · FC repos {lastResult.importedRhr}j · Sommeil {lastResult.importedSleepScore}j ·
                Poids {lastResult.importedWeight}j · Masse grasse {lastResult.importedBodyFat}j · Séances {lastResult.importedWorkouts}
              </p>
              <p>
                <span className="text-foreground font-medium">Reçu (Santé)</span>{" "}
                — HRV {lastResult.fetched?.hrv ?? 0} · FC repos {lastResult.fetched?.restingHR ?? 0} · Sommeil {lastResult.fetched?.sleep ?? 0} ·
                Poids {lastResult.fetched?.weight ?? 0} · Masse grasse {lastResult.fetched?.bodyFat ?? 0} · Workouts {lastResult.fetched?.workouts ?? 0}
              </p>
              <p>
                <span className="text-foreground font-medium">Visible dans l’app</span>{" "}
                — health_metrics: HRV {lastResult.verified?.health_metrics?.hrv ?? 0} · FC repos {lastResult.verified?.health_metrics?.rhr ?? 0} · Sommeil {lastResult.verified?.health_metrics?.sleep_score ?? 0} ·
                body_metrics {lastResult.verified?.body_metrics?.rows ?? 0} · activities {lastResult.verified?.activities?.rows ?? 0}
              </p>
            </div>
            {(lastResult.fetched?.workouts ?? 0) === 0 && (
              <p className="text-[11px] text-muted-foreground">
                Astuce : pour voir des activités (Running, Muscu, Tennis...), il faut qu’elles existent dans l’app{" "}
                <span className="text-foreground font-medium">Santé</span> (via Apple Watch / apps compatibles).
              </p>
            )}
            <div className="flex justify-end pt-2">
              <Button size="sm" className="bg-sky-500 hover:bg-sky-400 text-white" onClick={() => setOpen(false)}>
                OK
              </Button>
            </div>
          </div>
        ) : showSettingsHint ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 space-y-2">
            <p className="text-sm font-medium text-amber-400 flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Accès refusé
            </p>
            <p className="text-xs text-muted-foreground">
              Merci d'activer l'accès dans{" "}
              <strong className="text-foreground">
                Réglages &gt; Santé &gt; Accès aux données &gt; Mova
              </strong>
              , puis reviens ici et réessaie.
            </p>
          </div>
        ) : (
          <div className="space-y-3 text-xs text-muted-foreground">
            <p className="text-foreground text-sm font-medium">Ce qui sera importé :</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Séances (course, tennis, padel, musculation)</li>
              <li>Signes vitaux : HRV, FC repos</li>
              <li>Composition : poids, masse grasse</li>
              <li>Sommeil : durée, phases (profond, léger, REM)</li>
              <li>Activité : calories, minutes d'exercice</li>
            </ul>
            <p className="text-xs text-muted-foreground/70 mt-2">
              Aucune donnée partagée en dehors de ton compte. Révocable à tout moment dans l'app Santé.
            </p>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" size="sm" onClick={handleLater} disabled={mutation.isPending}>
            Plus tard
          </Button>

          {lastResult ? null : showSettingsHint ? (
            <Button
              size="sm"
              variant="outline"
              className="border-amber-500/50 text-amber-400 hover:bg-amber-500/10"
              onClick={() => {
                setShowSettingsHint(false);
                mutation.mutate();
              }}
              disabled={mutation.isPending}
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Réessayer
            </Button>
          ) : (
            <Button
              size="sm"
              className="bg-sky-500 hover:bg-sky-400 text-white shadow-[0_10px_30px_rgba(56,189,248,0.55)]"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Import en cours...
                </span>
              ) : (
                "Autoriser et importer"
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
