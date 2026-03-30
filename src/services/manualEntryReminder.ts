import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";

export interface ManualEntryReminderSettings {
  enabled: boolean;
  time: string; // HH:mm
}
interface ReminderSyncOptions {
  requestPermissions?: boolean;
}

const SETTINGS_KEY = "manual_entry_reminder_settings_v1";
const OPEN_FLAG_KEY = "manual_entry_open_requested_v1";
const OPEN_EVENT = "manual-entry-open-requested";
const REMINDER_NOTIFICATION_ID = 81000;

let actionListenerRegistered = false;

export function getManualEntryReminderSettings(): ManualEntryReminderSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { enabled: true, time: "08:00" };
    const parsed = JSON.parse(raw) as Partial<ManualEntryReminderSettings>;
    const time = typeof parsed.time === "string" && /^\d{2}:\d{2}$/.test(parsed.time)
      ? parsed.time
      : "08:00";
    return {
      enabled: parsed.enabled !== false,
      time,
    };
  } catch {
    return { enabled: true, time: "08:00" };
  }
}

export function saveManualEntryReminderSettings(settings: ManualEntryReminderSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function parseHourMinute(time: string): { hour: number; minute: number } {
  const [h, m] = time.split(":").map(Number);
  return {
    hour: Number.isFinite(h) ? Math.max(0, Math.min(23, h)) : 8,
    minute: Number.isFinite(m) ? Math.max(0, Math.min(59, m)) : 0,
  };
}

async function getLocalNotificationsPlugin(): Promise<any | null> {
  if (!Capacitor.isNativePlatform()) return null;
  return LocalNotifications;
}

export async function syncManualEntryReminderSchedule(
  settings?: ManualEntryReminderSettings,
  options?: ReminderSyncOptions,
) {
  const plugin = await getLocalNotificationsPlugin();
  if (!plugin) return;

  const current = settings ?? getManualEntryReminderSettings();
  const shouldRequestPermissions = options?.requestPermissions === true;

  try {
    await plugin.cancel({ notifications: [{ id: REMINDER_NOTIFICATION_ID }] });

    if (!current.enabled) return;

    let permissions = await plugin.checkPermissions();
    if (permissions?.display !== "granted" && permissions?.receive !== "granted" && shouldRequestPermissions) {
      await plugin.requestPermissions();
      permissions = await plugin.checkPermissions();
    }
    if (permissions?.display !== "granted" && permissions?.receive !== "granted") return;

    const { hour, minute } = parseHourMinute(current.time);
    await plugin.schedule({
      notifications: [
        {
          id: REMINDER_NOTIFICATION_ID,
          title: "Mova",
          body: "C'est le moment de saisir tes données du jour 💪",
          schedule: {
            on: { hour, minute },
            repeats: true,
            allowWhileIdle: true,
          },
          extra: { openManualEntry: true },
        },
      ],
    });
  } catch (error) {
    console.warn("[reminder] impossible de planifier la notification locale:", error);
  }
}

export async function ensureManualEntryNotificationListener() {
  if (actionListenerRegistered) return;
  const plugin = await getLocalNotificationsPlugin();
  if (!plugin) return;

  actionListenerRegistered = true;
  await plugin.addListener("localNotificationActionPerformed", (event: any) => {
    const shouldOpen = !!event?.notification?.extra?.openManualEntry;
    if (!shouldOpen) return;
    localStorage.setItem(OPEN_FLAG_KEY, "1");
    window.dispatchEvent(new Event(OPEN_EVENT));
  });
}

export function consumeManualEntryOpenFlag(): boolean {
  const current = localStorage.getItem(OPEN_FLAG_KEY) === "1";
  if (current) localStorage.removeItem(OPEN_FLAG_KEY);
  return current;
}

export function getManualEntryOpenEventName() {
  return OPEN_EVENT;
}
