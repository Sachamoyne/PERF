import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import { useAuth } from "./useAuth";

export type WorkoutSetRow = Tables<"workout_sets">;
export type WorkoutSessionRow = Tables<"workout_sessions"> & {
  workout_sets?: WorkoutSetRow[];
};

export function useWorkoutSessions() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["workout_sessions", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [] as WorkoutSessionRow[];
      const { data, error } = await supabase
        .from("workout_sessions")
        .select("*, workout_sets(*)")
        .eq("user_id", user.id)
        .order("date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as WorkoutSessionRow[];
    },
  });
}

interface CreateWorkoutSessionInput {
  date: string;
  name?: string | null;
  notes?: string | null;
}

export function useCreateWorkoutSession() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (values: CreateWorkoutSessionInput) => {
      if (!user) throw new Error("Not authenticated");
      const payload: TablesInsert<"workout_sessions"> = {
        user_id: user.id,
        date: values.date,
        name: values.name?.trim() || null,
        notes: values.notes?.trim() || null,
      };
      const { data, error } = await supabase
        .from("workout_sessions")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workout_sessions"] });
    },
  });
}

export function useDeleteWorkoutSession() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (sessionId: string) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("workout_sessions")
        .delete()
        .eq("id", sessionId)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workout_sessions"] });
    },
  });
}

interface AddWorkoutSetInput {
  session_id: string;
  exercise_name: string;
  set_number: number;
  reps: number;
  weight_kg: number;
  notes?: string | null;
}

export function useAddWorkoutSet() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (values: AddWorkoutSetInput) => {
      if (!user) throw new Error("Not authenticated");
      const payload: TablesInsert<"workout_sets"> = {
        user_id: user.id,
        session_id: values.session_id,
        exercise_name: values.exercise_name,
        set_number: values.set_number,
        reps: values.reps,
        weight_kg: values.weight_kg,
        notes: values.notes?.trim() || null,
      };
      const { error } = await supabase
        .from("workout_sets")
        .insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workout_sessions"] });
    },
  });
}

export function useDeleteWorkoutSet() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (setId: string) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("workout_sets")
        .delete()
        .eq("id", setId)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workout_sessions"] });
    },
  });
}

export function useLastPerformance(exerciseName: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["last_performance", user?.id, exerciseName],
    enabled: !!user && !!exerciseName,
    queryFn: async () => {
      if (!user) return [] as any[];
      const { data, error } = await supabase
        .from("workout_sets")
        .select("*, workout_sessions(date)")
        .eq("user_id", user.id)
        .eq("exercise_name", exerciseName)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
  });
}
