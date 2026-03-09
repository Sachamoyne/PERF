import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface SyncStatus {
  lastSync: Date | null;
  isRecent: boolean;   // < 24h
  isStale: boolean;    // > 48h
  label: string;
}

export function useSyncStatus() {
  const { user } = useAuth();

  return useQuery<SyncStatus>({
    queryKey: ["sync_status", user?.id],
    enabled: !!user,
    refetchInterval: 60_000, // refresh every minute
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("last_sync")
        .eq("user_id", user!.id)
        .single();

      const lastSync = data?.last_sync ? new Date(data.last_sync) : null;

      if (!lastSync) {
        return { lastSync: null, isRecent: false, isStale: true, label: "Jamais synchronisé" };
      }

      const hoursAgo = (Date.now() - lastSync.getTime()) / (1000 * 60 * 60);
      return {
        lastSync,
        isRecent: hoursAgo < 24,
        isStale: hoursAgo > 48,
        label: hoursAgo < 1
          ? "Synchronisé à l'instant"
          : hoursAgo < 24
          ? `Synchronisé il y a ${Math.round(hoursAgo)}h`
          : `Dernière sync: ${lastSync.toLocaleDateString("fr-FR")}`,
      };
    },
  });
}
