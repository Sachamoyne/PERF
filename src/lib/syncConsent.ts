export const SYNC_CONSENT_KEY = "mova_data_consent";
export const SYNC_CONSENT_DATE_KEY = "mova_data_consent_date";

export type SyncConsentState = "accepted" | "refused" | "unknown";

export function getSyncConsent(): SyncConsentState {
  if (typeof window === "undefined") return "unknown";
  const raw = localStorage.getItem(SYNC_CONSENT_KEY);
  if (raw === "accepted") return "accepted";
  if (raw === "refused") return "refused";
  return "unknown";
}

export function setSyncConsent(granted: boolean) {
  if (typeof window === "undefined") return;
  if (granted) {
    localStorage.setItem(SYNC_CONSENT_KEY, "accepted");
    localStorage.setItem(SYNC_CONSENT_DATE_KEY, new Date().toISOString());
    return;
  }
  localStorage.setItem(SYNC_CONSENT_KEY, "refused");
  localStorage.removeItem(SYNC_CONSENT_DATE_KEY);
}

export function hasSyncConsent(): boolean {
  return getSyncConsent() === "accepted";
}

export function isSyncUploadAllowed(): boolean {
  return getSyncConsent() === "accepted";
}

export function isSyncExplicitlyDenied(): boolean {
  return getSyncConsent() === "refused";
}
