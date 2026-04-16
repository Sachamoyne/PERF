export type AppPlatform = "ios" | "android" | "web";

export function getAppPlatform(): AppPlatform {
  try {
    const platform = (window as { Capacitor?: { getPlatform?: () => AppPlatform } }).Capacitor?.getPlatform?.();
    return platform ?? "web";
  } catch {
    return "web";
  }
}

export function isIphoneSourceDevice(): boolean {
  if (getAppPlatform() !== "ios") return false;

  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";

  // On force le mode source HealthKit sur iPhone uniquement.
  return /iPhone/i.test(ua);
}

