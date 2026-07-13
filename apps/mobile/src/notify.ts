// Thin wrapper around local (on-device) notifications. Used to tell the child
// they entered/left a safe zone; a no-op if permission is denied. Push alerts to
// the PARENT are handled server-side (web-push) — this is purely local.
import * as Notifications from "expo-notifications";

let configured = false;

/** Ask for notification permission once; returns whether it is granted. */
export async function ensureNotifPermission(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync();
    let status = current.status;
    if (status !== "granted") {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status === "granted" && !configured) {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: false,
          shouldSetBadge: false,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
      configured = true;
    }
    return status === "granted";
  } catch {
    return false;
  }
}

/** Fire a local notification now (best-effort; silently ignored if unavailable). */
export async function notifyLocal(title: string, body: string): Promise<void> {
  try {
    const ok = await ensureNotifPermission();
    if (!ok) return;
    await Notifications.scheduleNotificationAsync({
      content: { title, body },
      trigger: null, // immediately
    });
  } catch {
    /* notifications unavailable (Expo Go on some platforms) → ignore */
  }
}
