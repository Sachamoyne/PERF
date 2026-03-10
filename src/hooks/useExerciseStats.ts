import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface ExerciseStatRow {
  id: string;
  user_id: string;
  exercise_name: string;
  weight_kg: number;
  reps: number;
  sets: number;
  created_at: string;
}

export interface PRCard {
  exercise_name: string;
  current_weight: number;
  previous_weight: number | null;
  gain: number;
  date: string;
}

const DEFAULT_EXERCISES = [
  "Développé Couché",
  "Squat",
  "Tirage Dos",
  "Soulevé de Terre",
  "Développé Épaules",
  "Curl Biceps",
];

export function useExerciseStats() {
  return useQuery({
    queryKey: ["exercise_stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exercise_stats")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ExerciseStatRow[];
    },
  });
}

export function usePRCards() {
  const { data: stats = [] } = useExerciseStats();

  const prMap = new Map<string, ExerciseStatRow[]>();
  for (const s of stats) {
    const list = prMap.get(s.exercise_name) || [];
    list.push(s);
    prMap.set(s.exercise_name, list);
  }

  const cards: PRCard[] = [];

  // Include default exercises even if no data
  const allExercises = new Set([...DEFAULT_EXERCISES, ...prMap.keys()]);

  for (const name of allExercises) {
    const entries = prMap.get(name) || [];
    // Already sorted desc by created_at
    const current = entries[0];
    const previous = entries[1] || null;

    cards.push({
      exercise_name: name,
      current_weight: current?.weight_kg ?? 0,
      previous_weight: previous?.weight_kg ?? null,
      gain: current && previous ? current.weight_kg - previous.weight_kg : 0,
      date: current?.created_at ?? "",
    });
  }

  return cards;
}

export function useInsertExerciseStat() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (values: { exercise_name: string; weight_kg: number; reps?: number; sets?: number }) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("exercise_stats").insert({
        user_id: user.id,
        ...values,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["exercise_stats"] });
    },
  });
}
