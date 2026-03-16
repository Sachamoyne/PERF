/**
 * HealthKit Bridge — @capgo/capacitor-health v8
 *
 * EXPORT RÉEL DU PLUGIN (node_modules/.../dist/esm/index.js) :
 *   export { Health };          ← nom = "Health"
 *   registerPlugin('Health')   ← nom natif = "Health"
 *
 * → import { CapacitorHealth } donne undefined  →  TypeError: e.isAvailable
 * → import { Health }          donne le Proxy   ✓
 */

// Import statique EXCLUSIF — pas de await import(), pas d'alias
import { Health } from "@capgo/capacitor-health";

// ─── Diagnostic immédiat au chargement du module ───────────────────────────
// Ce bloc s'exécute une seule fois quand le bundle est évalué.
// Il apparaîtra EN PREMIER dans la console Safari avant tout appel UI.
if (!Health) {
  // Ne devrait jamais arriver : registerPlugin() retourne toujours un Proxy
  // Mais si Vite tree-shake le module et résout Health = undefined :
  console.error(
    "[health] PLUGIN_NOT_FOUND — Health est falsy au chargement du module.\n" +
    "→ Vérifier que @capgo/capacitor-health est listé dans package.json et installé.\n" +
    "→ Relancer : npm install && npx cap sync && Clean Build Folder dans Xcode."
  );
} else {
  // Object.keys() sur un Proxy Capacitor retourne les clés énumérables.
  // En natif, le Proxy délègue à l'implémentation Swift → liste les méthodes bridgées.
  console.log("[health] ✓ Health plugin chargé");
  console.log("[health] Plugin Object Keys     :", Object.keys(Health));
  console.log("[health] Plugin prototype keys  :", Object.getOwnPropertyNames(Object.getPrototypeOf(Health)));
  console.log("[health] window.Capacitor.Plugins.Health :", (window as any).Capacitor?.Plugins?.Health ?? "(non encore injecté)");
}

// ─── Types locaux ──────────────────────────────────────────────────────────

export interface HealthSample {
  date: string;  // YYYY-MM-DD — correspond à la colonne `date` de health_metrics / body_metrics
  value: number;
  unit: string;
}

export interface HealthSnapshot {
  hrv:    HealthSample[]; // HRV-SDNN, unité : ms
  weight: HealthSample[]; // poids,    unité : kg
}

export interface HealthPermissionResult {
  ok: boolean;
  reason?: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function getPlatform(): "ios" | "android" | "web" {
  try {
    return (window as any).Capacitor?.getPlatform?.() ?? "web";
  } catch {
    return "web";
  }
}

/** Renvoie une plage ISO 8601 pour les N derniers jours */
function isoRange(days: number): { startDate: string; endDate: string } {
  return {
    startDate: new Date(Date.now() - days * 86_400_000).toISOString(),
    endDate:   new Date().toISOString(),
  };
}

// ─── ÉTAPE 1 : Permissions ────────────────────────────────────────────────

export async function requestHealthPermissions(): Promise<HealthPermissionResult> {
  console.group("[health] ── ÉTAPE 1 : Permissions ──");

  // Garde : jamais d'appel natif sur browser
  if (getPlatform() !== "ios") {
    console.info("[health] Plateforme non-iOS → skip (données démo actives)");
    console.groupEnd();
    return { ok: true };
  }

  // Garde : plugin introuvable
  if (!Health) {
    console.error("[health] PLUGIN_NOT_FOUND — impossible de demander les permissions");
    console.groupEnd();
    return {
      ok: false,
      reason:
        "Le plugin Apple Health n'est pas chargé dans l'app iOS. Lance `npm install`, `npx cap sync ios`, puis rebuild dans Xcode.",
    };
  }

  try {
    // ── isAvailable ──────────────────────────────────────────────────────
    console.log("[health] → Health.isAvailable()...");
    const availability = await Health.isAvailable();
    console.log("[health] ← isAvailable :", JSON.stringify(availability));

    if (!availability.available) {
      const ua = (typeof navigator !== "undefined" ? navigator.userAgent : "").toLowerCase();
      const looksLikeSimulator = ua.includes("simulator");
      const unavailableReason = looksLikeSimulator
        ? "Apple Santé n'est pas disponible sur le simulateur iOS. Lance l'app sur un iPhone physique, puis accepte les permissions dans Santé."
        : "Apple Santé n'est pas disponible sur cet appareil. Vérifie que tu es sur un iPhone compatible et que Santé est activé.";
      console.error(
        "[health] HealthKit indisponible — raison :", availability.reason ?? availability.platform,
        "\n→ HealthKit ne fonctionne que sur iPhone physique (pas simulateur)."
      );
      console.groupEnd();
      return { ok: false, reason: unavailableReason };
    }

    // ── requestAuthorization ─────────────────────────────────────────────
    // Types corrects : 'heartRateVariability' et 'weight'
    // PAS les identifiers HealthKit bruts (HKQuantityTypeIdentifier...)
    console.log("[health] → Health.requestAuthorization({ read: ['heartRateVariability', 'weight'] })...");
    const status = await Health.requestAuthorization({
      read:  ["heartRateVariability", "weight"],
      write: [],
    });
    console.log("[health] ← requestAuthorization :", JSON.stringify(status));

    const granted = status.readAuthorized ?? [];
    if (granted.length === 0) {
      const deniedReason =
        "Accès Apple Santé non accordé. Ouvre iOS Réglages > Santé > Accès des apps > Athletes Ascent, puis active HRV et Poids.";
      console.warn(
        "[health] Aucun type autorisé.\n" +
        "→ Aller dans Réglages > Santé > Accès des apps > Athletes Ascent\n" +
        "→ Activer HRV et Poids"
      );
      console.groupEnd();
      return { ok: false, reason: deniedReason };
    }

    console.log("[health] ✓ Types autorisés :", granted.join(", "));
    console.groupEnd();
    return { ok: true };

  } catch (err) {
    console.error("[health] Exception requestHealthPermissions :", err);
    console.groupEnd();
    return {
      ok: false,
      reason: "Impossible de demander l'autorisation Apple Santé. Vérifie la config iOS et relance l'app sur iPhone.",
    };
  }
}

// ─── ÉTAPE 2 : Fetch données HealthKit ────────────────────────────────────

async function fetchNativeHrv(days: number): Promise<HealthSample[]> {
  const { startDate, endDate } = isoRange(days);
  console.log("[health] → readSamples(heartRateVariability)", { startDate, endDate });

  try {
    const result = await Health.readSamples({
      dataType:  "heartRateVariability",
      startDate,
      endDate,
      limit:     500,
      ascending: true,
    });
    console.log("[health] ← HRV bruts :", result.samples?.length ?? 0, "échantillons");

    return (result.samples ?? [])
      .map((s) => ({
        date:  new Date(s.startDate).toISOString().split("T")[0], // YYYY-MM-DD
        value: Number(s.value),
        unit:  s.unit ?? "millisecond",
      }))
      .filter((s) => {
        const ok = Number.isFinite(s.value) && s.value > 0;
        if (!ok) console.warn("[health] HRV ignoré (invalide) :", s);
        return ok;
      });

  } catch (err) {
    console.error("[health] ÉCHEC readSamples(heartRateVariability) :", err);
    return [];
  }
}

async function fetchNativeWeight(days: number): Promise<HealthSample[]> {
  const { startDate, endDate } = isoRange(days);
  console.log("[health] → readSamples(weight)", { startDate, endDate });

  try {
    const result = await Health.readSamples({
      dataType:  "weight",
      startDate,
      endDate,
      limit:     500,
      ascending: true,
    });
    console.log("[health] ← Poids bruts :", result.samples?.length ?? 0, "échantillons");

    return (result.samples ?? [])
      .map((s) => ({
        date:  new Date(s.startDate).toISOString().split("T")[0], // YYYY-MM-DD
        value: Number(s.value),
        unit:  s.unit ?? "kilogram",
      }))
      .filter((s) => {
        const ok = Number.isFinite(s.value) && s.value > 0;
        if (!ok) console.warn("[health] Poids ignoré (invalide) :", s);
        return ok;
      });

  } catch (err) {
    console.error("[health] ÉCHEC readSamples(weight) :", err);
    return [];
  }
}

async function fetchNativeHealthData(days: number): Promise<HealthSnapshot> {
  console.group("[health] ── ÉTAPE 2 : Fetch données natives ──");

  const [hrvResult, weightResult] = await Promise.allSettled([
    fetchNativeHrv(days),
    fetchNativeWeight(days),
  ]);

  const snapshot: HealthSnapshot = {
    hrv:    hrvResult.status    === "fulfilled" ? hrvResult.value    : [],
    weight: weightResult.status === "fulfilled" ? weightResult.value : [],
  };

  if (hrvResult.status    === "rejected") console.error("[health] HRV Promise rejetée :",    hrvResult.reason);
  if (weightResult.status === "rejected") console.error("[health] Weight Promise rejetée :", weightResult.reason);

  console.log("[health] ✓ Snapshot :", { hrv: snapshot.hrv.length, weight: snapshot.weight.length });
  console.groupEnd();
  return snapshot;
}

// ─── Données démo (browser uniquement) ────────────────────────────────────

function generateDemoData(days: number): HealthSnapshot {
  const samples = (base: number, variance: number, unit: string): HealthSample[] =>
    Array.from({ length: days }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (days - 1 - i));
      return {
        date:  d.toISOString().split("T")[0],
        value: Math.round((base + (Math.random() - 0.5) * variance) * 10) / 10,
        unit,
      };
    });
  return {
    hrv:    samples(55, 12, "millisecond"),
    weight: samples(75, 2,  "kilogram"),
  };
}

// ─── API publique ──────────────────────────────────────────────────────────

export async function fetchHealthData(days = 30): Promise<HealthSnapshot> {
  if (getPlatform() === "ios") {
    return fetchNativeHealthData(days);
  }
  console.info("[health] Browser → données démo (", days, "j)");
  return generateDemoData(days);
}
