import { requestHealthPermissions, fetchHealthData } from "./health";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";

export interface AppleHealthSyncResult {
  importedSamples: number; // total inséré/mis à jour (HRV + poids)
  importedHrv: number;
  importedWeight: number;
  lastSync: string;
}

/**
 * Regroupe les échantillons par jour et calcule la moyenne.
 * Garantit une seule ligne par jour → respecte la contrainte UNIQUE(user_id, metric_type, date).
 */
function groupByDayAverage(
  samples: { date: string; value: number; unit: string }[]
): { date: string; value: number; unit: string }[] {
  const map = new Map<string, { sum: number; count: number; unit: string }>();

  for (const s of samples) {
    const prev = map.get(s.date);
    if (prev) {
      prev.sum += s.value;
      prev.count += 1;
    } else {
      map.set(s.date, { sum: s.value, count: 1, unit: s.unit });
    }
  }

  return Array.from(map.entries()).map(([date, { sum, count, unit }]) => ({
    date,
    value: Math.round((sum / count) * 100) / 100,
    unit,
  }));
}

/**
 * Synchronise Apple Health → Supabase.
 *
 * Étape 1 : demande de permissions HealthKit
 * Étape 2 : récupération des 30 derniers jours (HRV + poids)
 * Étape 3 : nettoyage (NaN / null) + groupement par jour
 * Étape 4 : upsert Supabase
 *   - HRV → health_metrics (metric_type='hrv', unit='ms')
 *   - Poids → body_metrics  (weight_kg, source='apple_health')
 */
export async function syncAppleHealth(userId: string): Promise<AppleHealthSyncResult> {
  console.info("[appleHealth] Starting sync for user", userId);

  // ── Étape 1 : Permissions ──────────────────────────────────────────────────
  const permissions = await requestHealthPermissions();
  if (!permissions.ok) {
    throw new Error(
      permissions.reason ??
        "Autorisation HealthKit refusée. Vérifie Réglages > Santé > Accès des apps > Athletes Ascent."
    );
  }

  // ── Étape 2 : Récupération des données ────────────────────────────────────
  const snapshot = await fetchHealthData(30);
  console.info("[appleHealth] Raw samples fetched", {
    hrv: snapshot.hrv.length,
    weight: snapshot.weight.length,
  });

  // ── Étape 3 : Nettoyage + groupement par jour ─────────────────────────────
  const hrvByDay    = groupByDayAverage(snapshot.hrv);
  const weightByDay = groupByDayAverage(snapshot.weight);

  let importedHrv    = 0;
  let importedWeight = 0;

  // ── Étape 4a : HRV → health_metrics ───────────────────────────────────────
  if (hrvByDay.length > 0) {
    const hrvRows: TablesInsert<"health_metrics">[] = hrvByDay.map((s) => ({
      user_id:     userId,
      date:        s.date,       // YYYY-MM-DD
      metric_type: "hrv" as const,
      value:       s.value,      // number (forcé via Number() + isFinite dans health.ts)
      unit:        "ms",         // champ obligatoire dans health_metrics
    }));

    console.log("[appleHealth] Upserting HRV rows:", hrvRows.length);

    const { error: hrvError } = await supabase
      .from("health_metrics")
      .upsert(hrvRows, { onConflict: "user_id,metric_type,date" });

    if (hrvError) {
      console.error("[appleHealth] HRV upsert error:", hrvError);
      throw new Error(`HRV sync failed: ${hrvError.message}`);
    }

    importedHrv = hrvRows.length;
  }

  // ── Étape 4b : Poids → body_metrics ───────────────────────────────────────
  if (weightByDay.length > 0) {
    const weightRows: TablesInsert<"body_metrics">[] = weightByDay.map((s) => ({
      user_id:   userId,
      date:      s.date,    // YYYY-MM-DD
      weight_kg: s.value,   // kg (forcé via Number() + isFinite dans health.ts)
      source:    "apple_health",
    }));

    console.log("[appleHealth] Upserting weight rows:", weightRows.length);

    const { error: weightError } = await supabase
      .from("body_metrics")
      .upsert(weightRows, { onConflict: "user_id,date" });

    if (weightError) {
      // Si la contrainte (user_id,date) n'est pas déclarée → fallback insert avec ignoreDuplicates
      console.warn("[appleHealth] Weight upsert (user_id,date) failed, retrying with ignoreDuplicates:", weightError.message);
      const { error: fallbackError } = await supabase
        .from("body_metrics")
        .upsert(weightRows, { ignoreDuplicates: true });

      if (fallbackError) {
        console.error("[appleHealth] Weight insert fallback error:", fallbackError);
        throw new Error(`Weight sync failed: ${fallbackError.message}`);
      }
    }

    importedWeight = weightRows.length;
  }

  // ── Mise à jour last_sync dans le profil ──────────────────────────────────
  const lastSync = new Date().toISOString();

  await supabase
    .from("profiles")
    .update({ last_sync: lastSync })
    .eq("user_id", userId);

  const importedSamples = importedHrv + importedWeight;

  console.info("[appleHealth] Sync completed", { importedHrv, importedWeight, lastSync });

  return { importedSamples, importedHrv, importedWeight, lastSync };
}
