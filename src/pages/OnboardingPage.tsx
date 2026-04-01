import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  ACTIVITY_LEVEL_OPTIONS,
  type ActivityLevel,
  type ProfileSex,
  useUserProfile,
} from "@/hooks/useUserProfile";
import {
  TRAINING_PHASES,
  computeGoalsForPhase,
  type TrainingPhaseKey,
  useActivePhase,
} from "@/hooks/useActivePhase";
import { useAuth } from "@/hooks/useAuth";
import { syncAppleHealth } from "@/services/appleHealth";
import { setSyncConsent } from "@/lib/syncConsent";

type StepKey = "welcome" | "profile" | "phase" | "consent" | "health";

function phaseWeightLabel(min: number, max: number) {
  if (min === 0 && max === 0) return "Objectif poids: stable";
  return `Objectif poids: ${min > 0 ? "+" : ""}${min} à ${max > 0 ? "+" : ""}${max} kg/mois`;
}

export default function OnboardingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const {
    profile,
    isLoading: profileLoading,
    isComplete,
    saveProfile,
    isSaving: isSavingProfile,
  } = useUserProfile();
  const { setActivePhase, activePhaseKey, goalsByPhase, hasWeightForGoals } = useActivePhase();

  const isEditMode = searchParams.get("mode") === "edit";
  const [step, setStep] = useState<StepKey>(isEditMode ? "profile" : "welcome");
  const [sex, setSex] = useState<ProfileSex | "">("");
  const [age, setAge] = useState(25);
  const [heightCm, setHeightCm] = useState(180);
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>("very_active");
  const [selectedPhase, setSelectedPhase] = useState<TrainingPhaseKey>(activePhaseKey);
  const [syncingHealth, setSyncingHealth] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setSex(profile.sex ?? "");
    setAge(profile.age ?? 25);
    setHeightCm(profile.height_cm ?? 180);
    setActivityLevel(profile.activity_level ?? "very_active");
  }, [profile]);

  useEffect(() => {
    setSelectedPhase(activePhaseKey);
  }, [activePhaseKey]);

  useEffect(() => {
    if (profileLoading || isEditMode) return;
    if (isComplete) {
      navigate("/", { replace: true });
    }
  }, [profileLoading, isComplete, isEditMode, navigate]);

  const previewGoals = useMemo(() => {
    if (!profile?.weight_kg || profile.weight_kg <= 0) return null;
    if (sex !== "male" && sex !== "female") return null;
    const simulatedProfile = {
      sex,
      age,
      height_cm: heightCm,
      weight_kg: profile.weight_kg,
      activity_level: activityLevel,
    };

    return {
      lean_bulk: computeGoalsForPhase(simulatedProfile, "lean_bulk"),
      bulk_total: computeGoalsForPhase(simulatedProfile, "bulk_total"),
      maintenance: computeGoalsForPhase(simulatedProfile, "maintenance"),
      cut: computeGoalsForPhase(simulatedProfile, "cut"),
      race_prep: computeGoalsForPhase(simulatedProfile, "race_prep"),
    } satisfies Record<TrainingPhaseKey, { calories: number; protein: number; carbs: number; fat: number }>;
  }, [activityLevel, age, heightCm, profile?.weight_kg, sex]);

  const persistOnboardingDone = () => {
    localStorage.setItem("perf_onboarding_done", "true");
    if (user) {
      localStorage.setItem(`perf_onboarding_done:${user.id}`, "true");
    }
  };

  const handleSaveProfile = async () => {
    if (sex !== "male" && sex !== "female") {
      toast.error("Sélectionne ton sexe");
      return false;
    }

    try {
      await saveProfile({
        sex,
        age,
        height_cm: heightCm,
        activity_level: activityLevel,
      });
      return true;
    } catch (e: any) {
      toast.error(e?.message ?? "Impossible d'enregistrer ton profil");
      return false;
    }
  };

  const goToNext = async () => {
    if (step === "welcome") {
      setStep("profile");
      return;
    }

    if (step === "profile") {
      const ok = await handleSaveProfile();
      if (!ok) return;
      setStep("phase");
      return;
    }

    if (step === "phase") {
      try {
        await setActivePhase(selectedPhase);
      } catch (e: any) {
        toast.error(e?.message ?? "Impossible d'enregistrer la phase");
        return;
      }

      if (isEditMode) {
        persistOnboardingDone();
        toast.success("Profil mis à jour");
        navigate("/settings", { replace: true });
        return;
      }

      setStep("consent");
      return;
    }

    if (step === "consent") {
      setSyncConsent(true);
      setStep("health");
    }
  };

  const handleContinueWithoutSync = () => {
    setSyncConsent(false);
    setStep("health");
  };

  const handleAuthorizeAndImport = async () => {
    if (!user) return;
    setSyncingHealth(true);
    try {
      await syncAppleHealth(user.id);
      persistOnboardingDone();
      toast.success("Apple Santé connecté");
      navigate("/", { replace: true });
    } catch (e: any) {
      toast.error(e?.message ?? "Impossible d'importer Apple Santé");
    }
    setSyncingHealth(false);
  };

  if (profileLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Chargement...</p>
      </div>
    );
  }

  const showWelcome = step === "welcome";
  const showProfile = step === "profile";
  const showPhase = step === "phase";
  const showConsent = step === "consent";
  const showHealth = step === "health";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-xl space-y-4">
        <div className="glass-card p-6 space-y-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {!isEditMode ? (
              <>
                <span className={showWelcome ? "text-foreground" : ""}>1. Bienvenue</span>
                <span>•</span>
                <span className={showProfile ? "text-foreground" : ""}>2. Profil</span>
                <span>•</span>
                <span className={showPhase ? "text-foreground" : ""}>3. Phase</span>
                <span>•</span>
                <span className={showConsent ? "text-foreground" : ""}>4. Confidentialité</span>
                <span>•</span>
                <span className={showHealth ? "text-foreground" : ""}>5. Santé</span>
              </>
            ) : (
              <>
                <span className={showProfile ? "text-foreground" : ""}>Profil</span>
                <span>•</span>
                <span className={showPhase ? "text-foreground" : ""}>Phase</span>
              </>
            )}
          </div>

          {showWelcome && (
            <div className="space-y-3">
              <h1 className="text-2xl font-display font-bold text-foreground">Bienvenue sur Mova</h1>
              <p className="text-sm text-muted-foreground">Quelques informations pour personnaliser tes objectifs</p>
              <Button onClick={goToNext}>Commencer</Button>
            </div>
          )}

          {showProfile && (
            <div className="space-y-4">
              <h1 className="text-xl font-display font-bold text-foreground">Ton profil</h1>

              <div className="space-y-2">
                <Label>Sexe</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className={`rounded-lg border p-3 text-sm ${sex === "male" ? "border-primary bg-primary/10" : "border-border"}`}
                    onClick={() => setSex("male")}
                  >
                    Homme
                  </button>
                  <button
                    type="button"
                    className={`rounded-lg border p-3 text-sm ${sex === "female" ? "border-primary bg-primary/10" : "border-border"}`}
                    onClick={() => setSex("female")}
                  >
                    Femme
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Âge: {age} ans</Label>
                <Input type="range" min={10} max={80} value={age} onChange={(e) => setAge(Number(e.target.value))} />
              </div>

              <div className="space-y-2">
                <Label>Taille: {heightCm} cm</Label>
                <Input type="range" min={140} max={220} value={heightCm} onChange={(e) => setHeightCm(Number(e.target.value))} />
              </div>

              <div className="space-y-2">
                <Label>Niveau d'activité</Label>
                <Select value={activityLevel} onValueChange={(v) => setActivityLevel(v as ActivityLevel)}>
                  <SelectTrigger className="bg-secondary border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ACTIVITY_LEVEL_OPTIONS).map(([key, cfg]) => (
                      <SelectItem key={key} value={key}>
                        {cfg.label} ({cfg.description})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button onClick={goToNext} disabled={isSavingProfile}>
                {isSavingProfile ? "Enregistrement..." : "Suivant"}
              </Button>
            </div>
          )}

          {showPhase && (
            <div className="space-y-4">
              <h1 className="text-xl font-display font-bold text-foreground">Ta phase actuelle</h1>
              {!hasWeightForGoals && (
                <p className="text-xs text-muted-foreground">
                  Poids HealthKit non disponible pour l'instant. Les objectifs nutritionnels apparaîtront après la première synchronisation.
                </p>
              )}

              <div className="grid grid-cols-1 gap-2">
                {(Object.values(TRAINING_PHASES) as Array<(typeof TRAINING_PHASES)[TrainingPhaseKey]>).map((phaseCfg) => (
                  <button
                    key={phaseCfg.key}
                    type="button"
                    onClick={() => setSelectedPhase(phaseCfg.key)}
                    className={`rounded-lg border p-3 text-left ${selectedPhase === phaseCfg.key ? "border-primary bg-primary/10" : "border-border"}`}
                  >
                    <p className="text-sm font-medium text-foreground">{phaseCfg.label}</p>
                    {previewGoals?.[phaseCfg.key] ? (
                      <p className="text-xs text-muted-foreground">
                        {previewGoals[phaseCfg.key].calories} kcal • {previewGoals[phaseCfg.key].protein}g P • {previewGoals[phaseCfg.key].carbs}g G • {previewGoals[phaseCfg.key].fat}g L
                      </p>
                    ) : goalsByPhase?.[phaseCfg.key] ? (
                      <p className="text-xs text-muted-foreground">
                        {goalsByPhase[phaseCfg.key].calories} kcal • {goalsByPhase[phaseCfg.key].protein}g P • {goalsByPhase[phaseCfg.key].carbs}g G • {goalsByPhase[phaseCfg.key].fat}g L
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">Objectifs disponibles après synchronisation du poids</p>
                    )}
                    <p className="text-xs text-muted-foreground">{phaseWeightLabel(phaseCfg.weightMonthlyMinKg, phaseCfg.weightMonthlyMaxKg)}</p>
                  </button>
                ))}
              </div>

              <Button onClick={goToNext}>{isEditMode ? "Enregistrer" : "Suivant"}</Button>
            </div>
          )}

          {showConsent && (
            <div className="space-y-4">
              <h1 className="text-xl font-display font-bold text-foreground">Confidentialité et données</h1>
              <div className="rounded-lg border border-border p-3 text-sm text-muted-foreground space-y-3">
                <p>
                  Mova synchronise tes données de santé (activité, nutrition, sommeil, fréquence cardiaque) sur nos serveurs sécurisés afin de conserver ton historique.
                </p>
                <p>Tes données ne sont jamais partagées avec des tiers.</p>
                <p>En continuant, tu acceptes que tes données soient stockées sur nos serveurs.</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button onClick={goToNext}>J'accepte</Button>
                <Button variant="outline" onClick={handleContinueWithoutSync}>
                  Refuser — données locales uniquement
                </Button>
              </div>
            </div>
          )}

          {showHealth && (
            <div className="space-y-4">
              <h1 className="text-xl font-display font-bold text-foreground">Autorisation Apple Santé</h1>
              <div className="rounded-lg border border-border bg-card/70 p-3 space-y-3">
                <p className="text-base font-semibold text-foreground">❤️ Cette app utilise Apple HealthKit</p>
                <p className="text-sm text-muted-foreground">Les données de santé suivantes seront lues depuis Apple Santé :</p>
                <ul className="list-disc pl-5 text-sm text-foreground space-y-1">
                  <li>Activité physique</li>
                  <li>Nutrition</li>
                  <li>Sommeil</li>
                  <li>Fréquence cardiaque</li>
                  <li>Composition corporelle</li>
                  <li>Pas</li>
                </ul>
              </div>
              <p className="text-sm text-muted-foreground">
                Autorise l'accès Santé pour importer automatiquement tes données et ton poids (Withings / Apple Santé).
              </p>
              <Button onClick={handleAuthorizeAndImport} disabled={syncingHealth}>
                {syncingHealth ? "Import en cours..." : "Autoriser et importer"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
