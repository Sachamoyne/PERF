export const SYNC_CONSENT_KEY = "mova_sync_consent";

export type SyncConsentState = "granted" | "denied" | "unknown";

export function getSyncConsent(): SyncConsentState {
  if (typeof window === "undefined") return "unknown";
  const raw = localStorage.getItem(SYNC_CONSENT_KEY);
  if (raw === "true") return "granted";
  if (raw === "false") return "denied";
  return "unknown";
}

export function setSyncConsent(granted: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SYNC_CONSENT_KEY, granted ? "true" : "false");
}

export function hasSyncConsent(): boolean {
  return getSyncConsent() === "granted";
}

export function isSyncUploadAllowed(): boolean {
  return getSyncConsent() !== "denied";
}

export function isSyncExplicitlyDenied(): boolean {
  return getSyncConsent() === "denied";
}
