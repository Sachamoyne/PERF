import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface JournalEntry {
  id: string;
  user_id: string;
  date: string;
  mood: string | null;
  mood_tags: string[] | null;
  mood_intensity: number | null;
  free_text: string | null;
  gratitude_1: string | null;
  gratitude_2: string | null;
  gratitude_3: string | null;
  created_at: string;
  updated_at: string;
}

// Entrée du jour ou d'une date précise
export function useJournalEntry(date: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["journal_entry", date, user?.id],
    enabled: !!user,
    staleTime: 0,
    gcTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("journal_entries")
        .select("*")
        .eq("user_id", user!.id)
        .eq("date", date)
        .maybeSingle();
      return data as JournalEntry | null;
    },
  });
}

// Historique des 90 derniers jours
export function useJournalHistory(days = 90) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["journal_history", days, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - days);
      const { data } = await supabase
        .from("journal_entries")
        .select("*")
        .eq("user_id", user!.id)
        .gte("date", since.toISOString().split("T")[0])
        .order("date", { ascending: false });
      return (data ?? []) as JournalEntry[];
    },
  });
}

// Upsert (créer ou mettre à jour)
export function useUpsertJournal() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (values: Partial<JournalEntry> & { date: string }) => {
      if (!user) throw new Error("Non authentifié");
      const { error } = await supabase
        .from("journal_entries")
        .upsert({ ...values, user_id: user.id }, { onConflict: "user_id,date" });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["journal_entry", vars.date] });
      qc.invalidateQueries({ queryKey: ["journal_history"] });
    },
  });
}
