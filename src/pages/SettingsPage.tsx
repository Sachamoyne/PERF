import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { TRAINING_PHASES, type TrainingPhaseKey, useActivePhase } from "@/hooks/useActivePhase";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Link } from "react-router-dom";
import { useTheme } from "@/hooks/useTheme";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getManualEntryReminderSettings,
  saveManualEntryReminderSettings,
  syncManualEntryReminderSchedule,
} from "@/services/manualEntryReminder";

export default function SettingsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [mockLoading, setMockLoading] = useState(false);
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [reminderTime, setReminderTime] = useState("08:00");
  const [savingReminder, setSavingReminder] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [confirmStep, setConfirmStep] = useState<1 | 2>(1);
  const [confirmText, setConfirmText] = useState("");
  const [confirmAction, setConfirmAction] = useState<"reset" | "delete">("reset");
  const { isDark, setTheme } = useTheme();
  const queryClient = useQueryClient();
  const {
    activePhaseKey,
    phase,
    phaseStartedAt,
    goalsByPhase,
    setActivePhase,
    isSaving: isSavingPhase,
  } = useActivePhase();

  useEffect(() => {
    const settings = getManualEntryReminderSettings();
    setReminderEnabled(settings.enabled);
    setReminderTime(settings.time);
  }, []);

  const handleSaveReminder = async () => {
    setSavingReminder(true);
    try {
      const settings = { enabled: reminderEnabled, time: reminderTime };
      saveManualEntryReminderSettings(settings);
      await syncManualEntryReminderSchedule(settings, { requestPermissions: true });
      toast.success("Rappel quotidien enregistré");
    } catch (e: any) {
      toast.error(e?.message ?? "Impossible d'enregistrer le rappel");
    }
    setSavingReminder(false);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast.success("Déconnecté");
  };

  const handleSelectPhase = async (nextPhase: TrainingPhaseKey) => {
    try {
      await setActivePhase(nextPhase);
      queryClient.invalidateQueries({ queryKey: ["latest_nutrition"] });
      toast.success(`Phase active: ${TRAINING_PHASES[nextPhase].label}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Impossible de changer la phase");
    }
  };

  const startedLabel = new Date(phaseStartedAt).toLocaleDateString("fr-FR");

  const closeConfirmModal = () => {
    setConfirmModalOpen(false);
    setConfirmStep(1);
    setConfirmText("");
  };

  const openConfirmModal = (action: "reset" | "delete") => {
    setConfirmAction(action);
    setConfirmStep(1);
    setConfirmText("");
    setConfirmModalOpen(true);
  };

  const handleResetAllData = async () => {
    if (!user) return;
    setMockLoading(true);
    try {
      const { error } = await supabase.rpc("clear_user_data", { _user_id: user.id });
      if (error) throw error;
      queryClient.invalidateQueries();
      toast.success("Toutes les données ont été supprimées");
      closeConfirmModal();
    } catch (e: any) {
      toast.error(e.message || "Erreur lors de la suppression");
    }
    setMockLoading(false);
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { error: deleteError } = await supabase.rpc("delete_user_account", { _user_id: user.id });
      if (deleteError) throw deleteError;

      await supabase.auth.signOut();
      queryClient.clear();
      toast.success("Ton compte Mova et tes données ont été supprimés.");
      closeConfirmModal();
    } catch (e: any) {
      toast.error(e.message || "Erreur lors de la suppression du compte");
    }
    setLoading(false);
  };

  return (
    <div className="w-full space-y-8">
      <h1 className="text-2xl font-display font-bold text-foreground">Paramètres</h1>

      <div className="glass-card p-6 space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Mon profil</h2>
        <Link to="/onboarding?mode=edit" className="text-sm text-primary hover:underline">
          Modifier mon profil →
        </Link>
      </div>

      <div className="glass-card p-6 space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Phase d'entraînement</h2>
        <div className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${phase.accentClass}`}>
          {phase.label}
        </div>
        <p className="text-xs text-muted-foreground">Actif depuis le {startedLabel}</p>

        <div className="grid grid-cols-1 gap-2">
          {(Object.values(TRAINING_PHASES) as Array<(typeof TRAINING_PHASES)[TrainingPhaseKey]>).map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => handleSelectPhase(p.key)}
              disabled={isSavingPhase}
              className={`rounded-lg border p-3 text-left transition-colors ${
                activePhaseKey === p.key
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-primary/40"
              }`}
            >
              <p className="text-sm font-medium text-foreground">{p.label}</p>
              {goalsByPhase?.[p.key] ? (
                <p className="text-xs text-muted-foreground">
                  {goalsByPhase[p.key].calories} kcal • {goalsByPhase[p.key].protein}g P • {goalsByPhase[p.key].carbs}g G • {goalsByPhase[p.key].fat}g L
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">Objectifs disponibles après synchronisation du poids</p>
              )}
              <p className="text-xs text-muted-foreground">
                {p.weightMonthlyMinKg === 0 && p.weightMonthlyMaxKg === 0
                  ? "Objectif poids: stable"
                  : `Objectif poids: ${p.weightMonthlyMinKg > 0 ? "+" : ""}${p.weightMonthlyMinKg} à ${p.weightMonthlyMaxKg > 0 ? "+" : ""}${p.weightMonthlyMaxKg} kg/mois`}
              </p>
            </button>
          ))}
        </div>
      </div>

      <div className="glass-card p-6 space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Apparence</h2>
        <div className="flex items-center justify-between rounded-lg border border-border p-3">
          <div className="space-y-0.5">
            <p className="text-sm text-foreground font-medium">Thème sombre</p>
            <p className="text-xs text-muted-foreground">Actif par défaut sur iOS</p>
          </div>
          <Switch
            checked={isDark}
            onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
            aria-label="Basculer thème sombre/clair"
          />
        </div>
      </div>

      <div className="glass-card p-6 space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Rappel de saisie quotidienne</h2>
        <p className="text-sm text-muted-foreground">
          Notification locale chaque matin pour ouvrir la saisie rapide des données.
        </p>
        <div className="flex items-center justify-between rounded-lg border border-border p-3">
          <Label htmlFor="manual-reminder-enabled" className="text-sm">Activer le rappel</Label>
          <Switch
            id="manual-reminder-enabled"
            checked={reminderEnabled}
            onCheckedChange={setReminderEnabled}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="manual-reminder-time">Heure</Label>
          <Input
            id="manual-reminder-time"
            type="time"
            value={reminderTime}
            onChange={(e) => setReminderTime(e.target.value)}
            disabled={!reminderEnabled}
          />
        </div>
        <Button onClick={handleSaveReminder} disabled={savingReminder}>
          {savingReminder ? "Enregistrement..." : "Enregistrer le rappel"}
        </Button>
      </div>

      <div className="glass-card p-6 space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Compte</h2>
        <p className="text-sm text-muted-foreground">Connecté en tant que</p>
        <p className="text-foreground font-medium">{user?.email}</p>
        <Button variant="outline" onClick={handleSignOut}>Se déconnecter</Button>
      </div>

      <div className="glass-card p-6 space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Légal</h2>
        <a
          href="https://mova.app/privacy"
          target="_blank"
          rel="noreferrer"
          className="block text-sm text-primary hover:underline"
        >
          Politique de confidentialité
        </a>
        <a
          href="https://mova.app/terms"
          target="_blank"
          rel="noreferrer"
          className="block text-sm text-primary hover:underline"
        >
          Conditions d'utilisation
        </a>
      </div>

      <div className="space-y-4 pt-6">
        <h2 className="text-lg font-semibold text-destructive">Zone dangereuse</h2>

        <div className="glass-card p-6 space-y-4 border border-destructive/30">
          <div className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-destructive" />
            <h3 className="text-lg font-semibold text-foreground">Réinitialiser mes données</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            Supprime toutes tes activités, métriques, pesées, données de santé et ton profil. Ton compte reste actif.
          </p>
          <Button variant="destructive" onClick={() => openConfirmModal("reset")} disabled={mockLoading}>
            <Trash2 className="h-4 w-4 mr-2" />
            {mockLoading ? "Suppression..." : "Réinitialiser mes données"}
          </Button>
        </div>

        <div className="glass-card p-6 space-y-4 border border-destructive/50 bg-destructive/5">
          <div className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-destructive" />
            <h3 className="text-lg font-semibold text-foreground">Supprimer mon compte</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            Supprime ton profil et toutes tes données de Mova. Cette action est définitive et te déconnectera de l'application.
          </p>
          <Button variant="destructive" onClick={() => openConfirmModal("delete")} disabled={loading}>
            <Trash2 className="h-4 w-4 mr-2" />
            {loading ? "Suppression du compte..." : "Supprimer mon compte"}
          </Button>
        </div>
      </div>

      <Dialog open={confirmModalOpen} onOpenChange={(open) => (open ? setConfirmModalOpen(true) : closeConfirmModal())}>
        <DialogContent className="max-w-md rounded-2xl border border-[rgba(239,68,68,0.3)] bg-[#111111] p-6">
          {confirmStep === 1 ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-foreground">
                  {confirmAction === "reset" ? "Réinitialiser mes données ?" : "Supprimer mon compte ?"}
                </DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground">
                  {confirmAction === "reset"
                    ? "Cette action supprimera définitivement toutes tes activités, métriques, pesées et données de santé synchronisées. Ton compte et ton profil seront conservés. Cette action est irréversible."
                    : "Cette action supprimera définitivement ton compte, ton profil et toutes tes données. Tu seras déconnecté immédiatement. Cette action est irréversible."}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="sm:justify-end">
                <Button variant="outline" onClick={closeConfirmModal}>Annuler</Button>
                <Button variant="destructive" onClick={() => setConfirmStep(2)}>Continuer</Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="text-foreground">Tape CONFIRMER pour valider</DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground">
                  Cette action est irréversible.
                </DialogDescription>
              </DialogHeader>
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="CONFIRMER"
                className="placeholder:text-muted-foreground/60"
              />
              <DialogFooter className="sm:justify-end">
                <Button variant="outline" onClick={closeConfirmModal}>Annuler</Button>
                <Button
                  variant="destructive"
                  disabled={confirmText !== "CONFIRMER" || loading || mockLoading}
                  onClick={confirmAction === "reset" ? handleResetAllData : handleDeleteAccount}
                >
                  {confirmAction === "reset"
                    ? (mockLoading ? "Réinitialisation..." : "Réinitialiser définitivement")
                    : (loading ? "Suppression..." : "Supprimer définitivement")}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
