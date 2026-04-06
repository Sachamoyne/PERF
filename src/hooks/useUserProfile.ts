import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export type ProfileSex = "male" | "female";
export type ActivityLevel = "sedentary" | "light" | "moderate" | "very_active" | "extra_active";

export type UserProfile = {
  sex: ProfileSex | null;
  age: number | null;
  height_cm: number | null;
  weight_kg: number | null;
  activity_level: ActivityLevel;
  onboarding_completed: boolean;
};

export type UserProfileInput = {
  sex: ProfileSex;
  age: number;
  height_cm: number;
  activity_level: ActivityLevel;
};

export const DEFAULT_ACTIVITY_LEVEL: ActivityLevel = "very_active";

export const ACTIVITY_LEVEL_OPTIONS: Record<
  ActivityLevel,
  { label: string; description: string; multiplier: number }
> = {
  sedentary: {
    label: "Sédentaire",
    description: "Peu ou pas d'exercice",
    multiplier: 1.2,
  },
  light: {
    label: "Légèrement actif",
    description: "1-3 séances/semaine",
    multiplier: 1.375,
  },
  moderate: {
    label: "Modérément actif",
    description: "3-5 séances/semaine",
    multiplier: 1.55,
  },
  very_active: {
    label: "Très actif",
    description: "6-7 séances/semaine",
    multiplier: 1.725,
  },
  extra_active: {
    label: "Extrêmement actif",
    description: "Athlète, 2x/jour",
    multiplier: 1.9,
  },
};

export const EMPTY_USER_PROFILE: UserProfile = {
  sex: null,
  age: null,
  height_cm: null,
  weight_kg: null,
  activity_level: DEFAULT_ACTIVITY_LEVEL,
  onboarding_completed: false,
};

export function isUserProfileComplete(profile: UserProfile | null | undefined): profile is UserProfile {
  if (!profile) return false;
  if (profile.onboarding_completed) return true;
  return (
    (profile.sex === "male" || profile.sex === "female") &&
    typeof profile.age === "number" &&
    profile.age > 0 &&
    typeof profile.height_cm === "number" &&
    profile.height_cm > 0 &&
    !!ACTIVITY_LEVEL_OPTIONS[profile.activity_level]
  );
}

async function fetchLatestWeightKg(userId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from("body_metrics")
    .select("weight_kg")
    .eq("user_id", userId)
    .not("weight_kg", "is", null)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return null;
  return data?.weight_kg ?? null;
}

export function useUserProfile() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const profileQuery = useQuery({
    queryKey: ["user_profile", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<UserProfile | null> => {
      if (!user) return null;

      const latestWeight = await fetchLatestWeightKg(user.id);

      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("sex, age, height_cm, weight_kg, activity_level, onboarding_completed")
          .eq("user_id", user.id)
          .maybeSingle();

        if (error) {
          console.warn("[profiles] fetch error", error);
          return {
            ...EMPTY_USER_PROFILE,
            weight_kg: latestWeight,
          };
        }

        if (!data) {
          return {
            ...EMPTY_USER_PROFILE,
            weight_kg: latestWeight,
          };
        }

        return {
          sex: data.sex === "male" || data.sex === "female" ? data.sex : null,
          age: typeof data.age === "number" ? data.age : null,
          height_cm: typeof data.height_cm === "number" ? data.height_cm : null,
          weight_kg:
            typeof data.weight_kg === "number"
              ? data.weight_kg
              : latestWeight,
          activity_level:
            data.activity_level && data.activity_level in ACTIVITY_LEVEL_OPTIONS
              ? (data.activity_level as ActivityLevel)
              : DEFAULT_ACTIVITY_LEVEL,
          onboarding_completed: data.onboarding_completed === true,
        };
      } catch (error) {
        console.warn("[profiles] fetch exception", error);
        return {
          ...EMPTY_USER_PROFILE,
          weight_kg: latestWeight,
        };
      }
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (profile: UserProfileInput) => {
      if (!user) throw new Error("Utilisateur non connecté");

      const { error } = await supabase
        .from("profiles")
        .upsert(
          {
            user_id: user.id,
            sex: profile.sex,
            age: profile.age,
            height_cm: profile.height_cm,
            activity_level: profile.activity_level,
            onboarding_completed: true,
          },
          { onConflict: "user_id" }
        );

      if (error) throw error;

      return profile;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user_profile"] });
    },
  });

  const profile = profileQuery.data ?? null;

  return {
    profile,
    isLoading: profileQuery.isLoading,
    isComplete: isUserProfileComplete(profile),
    missingProfileMessage: "Complète ton profil pour personnaliser tes objectifs",
    saveProfile: saveMutation.mutateAsync,
    isSaving: saveMutation.isPending,
    refetchProfile: profileQuery.refetch,
  };
}
