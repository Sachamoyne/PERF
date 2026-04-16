import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import { useAuth } from "./useAuth";

export type WorkoutSetRow = Tables<"workout_sets">;
export type WorkoutSessionRow = Tables<"workout_sessions"> & {
  activity_id?: string | null;
  workout_sets?: WorkoutSetRow[];
};

export function useWorkoutSessions() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["workout_sessions", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [] as WorkoutSessionRow[];
      console.log("[logbook] début fetch, workout_id:", null);
      const { data, error } = await supabase
        .from("workout_sessions")
        .select("id,user_id,date,name,notes,created_at,activity_id, workout_sets!workout_sets_session_id_fkey(*)")
        .eq("user_id", user.id)
        .order("date", { ascending: false });
      console.log("[logbook] résultat:", data, "erreur:", error);
      if (error) throw error;
      return (data ?? []) as WorkoutSessionRow[];
    },
  });
}

export function useWorkoutSetsBySession(sessionId: string | null) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["workout_sets", "session", user?.id, sessionId],
    enabled: !!user && !!sessionId,
    queryFn: async () => {
      if (!user || !sessionId) return [] as WorkoutSetRow[];
      console.log("[logbook] fetch sets by session_id:", sessionId);
      const { data, error } = await supabase
        .from("workout_sets")
        .select("id,user_id,session_id,exercise_name,set_number,reps,weight_kg,notes,created_at,workout_sessions!inner(user_id)")
        .eq("user_id", user.id)
        .eq("session_id", sessionId)
        .eq("workout_sessions.user_id", user.id)
        .order("set_number", { ascending: true })
        .order("created_at", { ascending: true });
      console.log("[logbook] sets résultat:", {
        session_id: sessionId,
        count: data?.length ?? 0,
        first_set: data?.[0] ?? null,
        error,
      });
      if (error) throw error;
      const safeData = (data ?? []).filter((set) => set.session_id === sessionId && set.user_id === user.id);
      return safeData as WorkoutSetRow[];
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

export function useGetOrCreateSessionForActivity() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (activityId: string) => {
      if (!user) throw new Error("Not authenticated");

      const { data: existing, error: existingError } = await supabase
        .from("workout_sessions")
        .select("id")
        .eq("user_id", user.id)
        .eq("activity_id", activityId)
        .maybeSingle();

      if (existingError) throw existingError;
      if (existing?.id) return existing.id;

      const { data: activity, error: activityError } = await supabase
        .from("activities")
        .select("start_time")
        .eq("id", activityId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (activityError) throw activityError;
      if (!activity) throw new Error("Activité introuvable");

      const date = activity.start_time.split("T")[0];
      const payload: TablesInsert<"workout_sessions"> = {
        user_id: user.id,
        activity_id: activityId,
        date,
      };

      const { data: created, error: createError } = await supabase
        .from("workout_sessions")
        .insert(payload)
        .select("id")
        .single();
      if (createError) throw createError;
      return created.id;
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
