/**
 * Utilitaires de transformation des données Garmin
 */

/** Convertit des mètres en kilomètres (2 décimales) */
export function metersToKm(meters: number): number {
  return Math.round((meters / 1000) * 100) / 100;
}

/** Calcule l'allure (pace) en format MM:SS à partir de durée (sec) et distance (m) */
export function computePace(durationSec: number, distanceMeters: number): string {
  if (!distanceMeters || distanceMeters === 0) return "—";
  const paceMinPerKm = (durationSec / 60) / (distanceMeters / 1000);
  const minutes = Math.floor(paceMinPerKm);
  const seconds = Math.round((paceMinPerKm - minutes) * 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/** Calcule la charge d'entraînement simplifiée : Durée(min) × FC Moyenne / 100 */
export function computeTrainingLoad(durationSec: number, avgHr: number | null): number | null {
  if (!avgHr) return null;
  return Math.round((durationSec / 60) * avgHr) / 100;
}

/** Formate une activité Garmin brute vers un format lisible */
export function formatGarminData(activity: {
  duration_sec: number;
  distance_meters: number | null;
  avg_hr: number | null;
}) {
  return {
    distanceKm: activity.distance_meters ? metersToKm(activity.distance_meters) : null,
    pace: activity.distance_meters
      ? computePace(activity.duration_sec, activity.distance_meters)
      : null,
    trainingLoad: computeTrainingLoad(activity.duration_sec, activity.avg_hr),
  };
}
