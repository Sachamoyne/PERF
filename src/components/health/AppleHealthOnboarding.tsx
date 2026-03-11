import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { HeartPulse, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { syncAppleHealth } from "@/services/appleHealth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

function isIosLike() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isAppleDevice = /iPhone|iPad|iPod/.test(ua);
  const hasCapacitor = typeof window !== "undefined" && !!(window as any).Capacitor;
  return isAppleDevice || hasCapacitor;
}

export function AppleHealthOnboarding() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user || !isIosLike()) return;
    const key = `apple_health_onboarding:${user.id}`;
    const status = localStorage.getItem(key);
    if (!status) {
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
      qc.invalidateQueries();
      toast.success(
        `Synchronisation Apple Health terminée (${res.importedSamples} échantillons importés).`
      );
      setOpen(false);
    },
    onError: (err: any) => {
      toast.error(err?.message || "Échec de la synchronisation Apple Health");
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
      <DialogContent className="glass-card border-glass-border max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
              <HeartPulse className="h-4 w-4" />
            </span>
            Connecter Apple Health
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Autorise l'accès à ta fréquence cardiaque, HRV, poids et sommeil pour que nous puissions
            importer automatiquement tes 30 derniers jours de données et calculer ton score de forme.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-xs text-muted-foreground">
          <p className="text-foreground text-sm font-medium">
            Comment ça marche ?
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Aucune donnée n'est partagée en dehors de ton compte Supabase.</li>
            <li>Tu peux révoquer l'accès à tout moment dans l'app Santé d'iOS.</li>
            <li>La synchronisation peut prendre quelques secondes lors du premier import.</li>
          </ul>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" size="sm" onClick={handleLater} disabled={mutation.isPending}>
            Plus tard
          </Button>
          <Button
            size="sm"
            className="bg-primary/90 hover:bg-primary text-primary-foreground shadow-[0_12px_30px_rgba(34,197,94,0.45)]"
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
        </div>
      </DialogContent>
    </Dialog>
  );
}

