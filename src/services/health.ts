/**
 * HealthKit Bridge for Capacitor iOS
 *
 * - Browser: returns demo data
 * - iOS (Capacitor): calls real HealthKit APIs via @capacitor-community/apple-health
 *
 * Usage:
 *   import { requestHealthPermissions, fetchHealthData } from "@/services/health";
 *   await requestHealthPermissions();
 *   const data = await fetchHealthData();
 */

// ---------- platform detection ----------

function isNativePlatform(): boolean {
  try {
    // Capacitor injects this global when running inside native shell
    const cap = (window as any).Capacitor;
    return cap?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

function getPlatform(): "ios" | "android" | "web" {
  try {
    const cap = (window as any).Capacitor;
    return cap?.getPlatform?.() ?? "web";
  } catch {
    return "web";
  }
}

// ---------- types ----------

export interface HealthSample {
  date: string; // ISO date YYYY-MM-DD
  value: number;
}

export interface HealthSnapshot {
  weight: HealthSample[]; // kg
  bodyFat: HealthSample[]; // %
  hrv: HealthSample[]; // ms
}

// ---------- permissions ----------

export async function requestHealthPermissions(): Promise<boolean> {
  if (getPlatform() !== "ios") {
    console.info("[health] Running in browser — using demo data");
    return true;
  }

  try {
    const { CapacitorHealthkit } = await import(
      /* @vite-ignore */ "@nicklassvendsrud/capacitor-healthkit"
    );

    await CapacitorHealthkit.requestAuthorization({
      all: [],
      read: [
        "HKQuantityTypeIdentifierBodyMass",
        "HKQuantityTypeIdentifierBodyFatPercentage",
        "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
      ],
      write: [],
    });

    return true;
  } catch (err) {
    console.error("[health] HealthKit auth failed:", err);
    return false;
  }
}

// ---------- data fetching ----------

async function fetchNativeHealthData(days: number): Promise<HealthSnapshot> {
  const { CapacitorHealthkit } = await import(
    /* @vite-ignore */ "@nicklassvendsrud/capacitor-healthkit"
  );

  const endDate = new Date().toISOString();
  const startDate = new Date(Date.now() - days * 86_400_000).toISOString();

  const [weight, bodyFat, hrv] = await Promise.all([
    CapacitorHealthkit.queryHKitSampleType({
      sampleName: "HKQuantityTypeIdentifierBodyMass",
      startDate,
      endDate,
      limit: 0,
    }),
    CapacitorHealthkit.queryHKitSampleType({
      sampleName: "HKQuantityTypeIdentifierBodyFatPercentage",
      startDate,
      endDate,
      limit: 0,
    }),
    CapacitorHealthkit.queryHKitSampleType({
      sampleName: "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
      startDate,
      endDate,
      limit: 0,
    }),
  ]);

  const toSamples = (result: any): HealthSample[] =>
    (result?.resultData ?? []).map((s: any) => ({
      date: new Date(s.startDate).toISOString().split("T")[0],
      value: Number(s.value),
    }));

  return {
    weight: toSamples(weight),
    bodyFat: toSamples(bodyFat),
    hrv: toSamples(hrv),
  };
}

function generateDemoData(days: number): HealthSnapshot {
  const samples = (base: number, variance: number): HealthSample[] =>
    Array.from({ length: days }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (days - 1 - i));
      return {
        date: d.toISOString().split("T")[0],
        value: Math.round((base + (Math.random() - 0.5) * variance) * 10) / 10,
      };
    });

  return {
    weight: samples(75, 2),
    bodyFat: samples(18, 1.5),
    hrv: samples(55, 12),
  };
}

export async function fetchHealthData(days = 30): Promise<HealthSnapshot> {
  if (getPlatform() === "ios") {
    return fetchNativeHealthData(days);
  }
  return generateDemoData(days);
}

// ---------- Info.plist keys (for reference during Xcode setup) ----------
// Add to ios/App/App/Info.plist:
//
// <key>NSHealthShareUsageDescription</key>
// <string>Athlete's Ascent a besoin de vos données de santé pour synchroniser votre progression physique et vos records.</string>
// <key>NSHealthUpdateUsageDescription</key>
// <string>Athlete's Ascent peut enregistrer vos entraînements dans Apple Santé.</string>
