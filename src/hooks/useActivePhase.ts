import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  ACTIVITY_LEVEL_OPTIONS,
  isUserProfileComplete,
  useUserProfile,
  type UserProfile,
} from "@/hooks/useUserProfile";

export type TrainingPhaseKey =
  | "lean_bulk"
  | "bulk_total"
  | "maintenance"
  | "cut"
  | "race_prep";

export type PhaseGoals = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type TrainingPhaseMeta = {
  key: TrainingPhaseKey;
  label: string;
  accentClass: string;
  weightMonthlyMinKg: number;
  weightMonthlyMaxKg: number;
  sleepHoursTarget: number;
  stepsTarget: number;
  vo2maxTarget: number;
  plannedSessionsPerWeek: number;
};

export type TrainingPhaseConfig = TrainingPhaseMeta & {
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
};

const STORAGE_KEY = "perf_active_phase";
const DEFAULT_PHASE_KEY: TrainingPhaseKey = "lean_bulk";

const TRAINING_PHASE_META: Record<TrainingPhaseKey, TrainingPhaseMeta> = {
  lean_bulk: {
    key: "lean_bulk",
    label: "Lean Bulk",
    accentClass: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
    weightMonthlyMinKg: 0.5,
    weightMonthlyMaxKg: 1,
    sleepHoursTarget: 8,
    stepsTarget: 10000,
    vo2maxTarget: 55,
    plannedSessionsPerWeek: 6,
  },
  bulk_total: {
    key: "bulk_total",
    label: "Bulk total",
    accentClass: "bg-orange-500/15 text-orange-500 border-orange-500/30",
    weightMonthlyMinKg: 1,
    weightMonthlyMaxKg: 2,
    sleepHoursTarget: 8,
    stepsTarget: 10000,
    vo2maxTarget: 55,
    plannedSessionsPerWeek: 6,
  },
  maintenance: {
    key: "maintenance",
    label: "Maintenance",
    accentClass: "bg-blue-500/15 text-blue-500 border-blue-500/30",
    weightMonthlyMinKg: 0,
    weightMonthlyMaxKg: 0,
    sleepHoursTarget: 8,
    stepsTarget: 10000,
    vo2maxTarget: 55,
    plannedSessionsPerWeek: 6,
  },
  cut: {
    key: "cut",
    label: "Sèche",
    accentClass: "bg-rose-500/15 text-rose-500 border-rose-500/30",
    weightMonthlyMinKg: -1,
    weightMonthlyMaxKg: -0.5,
    sleepHoursTarget: 8,
    stepsTarget: 10000,
    vo2maxTarget: 55,
    plannedSessionsPerWeek: 6,
  },
  race_prep: {
    key: "race_prep",
    label: "Préparation course",
    accentClass: "bg-cyan-500/15 text-cyan-500 border-cyan-500/30",
    weightMonthlyMinKg: 0,
    weightMonthlyMaxKg: 0,
    sleepHoursTarget: 8,
    stepsTarget: 10000,
    vo2maxTarget: 55,
    plannedSessionsPerWeek: 6,
  },
};

export const TRAINING_PHASES: Record<TrainingPhaseKey, TrainingPhaseMeta> = TRAINING_PHASE_META;

type StoredPhase = {
  activePhase: TrainingPhaseKey;
  phaseStartedAt: string;
};

function parseStoredPhase(raw: string | null): StoredPhase | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredPhase>;
    if (!parsed.activePhase || !(parsed.activePhase in TRAINING_PHASE_META)) return null;
    if (!parsed.phaseStartedAt) return null;
    return {
      activePhase: parsed.activePhase,
      phaseStartedAt: parsed.phaseStartedAt,
    } as StoredPhase;
  } catch {
    return null;
  }
}

function getLocalFallback(): StoredPhase {
  const stored = parseStoredPhase(localStorage.getItem(STORAGE_KEY));
  if (stored) return stored;
  const created = {
    activePhase: DEFAULT_PHASE_KEY,
    phaseStartedAt: new Date().toISOString(),
  } satisfies StoredPhase;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(created));
  return created;
}

function round(n: number): number {
  return Math.round(n);
}

function getTdee(profile: UserProfile): number {
  const weight = profile.weight_kg ?? 0;
  const height = profile.height_cm ?? 0;
  const age = profile.age ?? 0;
  const mb =
    profile.sex === "male"
      ? 10 * weight + 6.25 * height - 5 * age + 5
      : 10 * weight + 6.25 * height - 5 * age - 161;
  const activity = ACTIVITY_LEVEL_OPTIONS[profile.activity_level]?.multiplier ?? 1.725;
  return mb * activity;
}

export function computeGoalsForPhase(profile: UserProfile, phaseKey: TrainingPhaseKey): PhaseGoals {
  const tdee = getTdee(profile);
  const weight = profile.weight_kg ?? 0;

  let calories = tdee;
  let proteinPerKg = 2.2;
  let carbsRatio = 0.45;
  let fatRatio = 0.25;

  switch (phaseKey) {
    case "lean_bulk":
      calories = tdee + 300;
      proteinPerKg = 2.2;
      carbsRatio = 0.45;
      fatRatio = 0.25;
      break;
    case "bulk_total":
      calories = tdee + 600;
      proteinPerKg = 2.2;
      carbsRatio = 0.48;
      fatRatio = 0.27;
      break;
    case "maintenance":
      calories = tdee;
      proteinPerKg = 1.8;
      carbsRatio = 0.45;
      fatRatio = 0.25;
      break;
    case "cut":
      calories = tdee - 400;
      proteinPerKg = 2.4;
      carbsRatio = 0.35;
      fatRatio = 0.25;
      break;
    case "race_prep":
      calories = tdee + 100;
      proteinPerKg = 1.8;
      carbsRatio = 0.55;
      fatRatio = 0.2;
      break;
  }

  const safeCalories = Math.max(0, round(calories));
  return {
    calories: safeCalories,
    protein: round(weight * proteinPerKg),
    carbs: round((safeCalories * carbsRatio) / 4),
    fat: round((safeCalories * fatRatio) / 9),
  };
}

export function useActivePhase() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { profile, isComplete: hasCompleteProfile, isLoading: profileLoading } = useUserProfile();
  const hasWeightForGoals = !!profile?.weight_kg && profile.weight_kg > 0;

  const phaseQuery = useQuery({
    queryKey: ["active_phase", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<StoredPhase> => {
      if (!user) return getLocalFallback();

      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("active_phase, phase_started_at")
          .eq("user_id", user.id)
          .maybeSingle();

        if (error) throw error;

        const dbPhase = data?.active_phase as TrainingPhaseKey | null;
        const dbStarted = data?.phase_started_at ?? null;
        if (dbPhase && dbPhase in TRAINING_PHASE_META && dbStarted) {
          const normalized = { activePhase: dbPhase, phaseStartedAt: dbStarted };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
          return normalized;
        }

        return getLocalFallback();
      } catch {
        return getLocalFallback();
      }
    },
  });

  const setPhaseMutation = useMutation({
    mutationFn: async (nextPhase: TrainingPhaseKey) => {
      const nowIso = new Date().toISOString();
      const payload = { activePhase: nextPhase, phaseStartedAt: nowIso } satisfies StoredPhase;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));

      if (!user) return payload;

      try {
        const { error } = await supabase
          .from("profiles")
          .upsert(
            {
              user_id: user.id,
              active_phase: nextPhase,
              phase_started_at: nowIso,
            },
            { onConflict: "user_id" }
          );

        if (error) throw error;
      } catch {
        // Fallback localStorage only
      }

      return payload;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["active_phase"] });
    },
  });

  const activePhaseKey = (phaseQuery.data?.activePhase ?? DEFAULT_PHASE_KEY) as TrainingPhaseKey;
  const phaseStartedAt = phaseQuery.data?.phaseStartedAt ?? new Date().toISOString();

  const goalsByPhase = useMemo(() => {
    if (!profile || !isUserProfileComplete(profile) || !hasWeightForGoals) return null;

    return {
      lean_bulk: computeGoalsForPhase(profile, "lean_bulk"),
      bulk_total: computeGoalsForPhase(profile, "bulk_total"),
      maintenance: computeGoalsForPhase(profile, "maintenance"),
      cut: computeGoalsForPhase(profile, "cut"),
      race_prep: computeGoalsForPhase(profile, "race_prep"),
    } satisfies Record<TrainingPhaseKey, PhaseGoals>;
  }, [profile, hasWeightForGoals]);

  const phaseMeta = TRAINING_PHASE_META[activePhaseKey] ?? TRAINING_PHASE_META[DEFAULT_PHASE_KEY];
  const activeGoals = goalsByPhase?.[activePhaseKey] ?? null;

  const phase: TrainingPhaseConfig = {
    ...phaseMeta,
    calories: activeGoals?.calories ?? null,
    protein: activeGoals?.protein ?? null,
    carbs: activeGoals?.carbs ?? null,
    fat: activeGoals?.fat ?? null,
  };

  return {
    activePhaseKey,
    phase,
    phaseStartedAt,
    goalsByPhase,
    profile,
    hasCompleteProfile,
    hasWeightForGoals,
    missingProfileMessage: "Complète ton profil pour personnaliser tes objectifs",
    isLoading: phaseQuery.isLoading || profileLoading,
    setActivePhase: setPhaseMutation.mutateAsync,
    isSaving: setPhaseMutation.isPending,
  };
}
