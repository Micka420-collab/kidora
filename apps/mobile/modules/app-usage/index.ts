import { requireOptionalNativeModule } from "expo";

// Native module is only present in a dev/production build (not Expo Go).
const Native = requireOptionalNativeModule("AppUsage");

export type AppUsageEntry = { packageName: string; appName: string; totalSeconds: number };

/** Whether the native usage module is available (dev build, Android). */
export const isAvailable = !!Native;

/** Android: has the user granted "Usage access" (PACKAGE_USAGE_STATS)? */
export async function hasPermission(): Promise<boolean> {
  if (!Native?.hasPermission) return false;
  return Native.hasPermission();
}

/** Open the system "Usage access" settings screen so the user can grant it. */
export function openSettings(): void {
  Native?.openSettings?.();
}

/** Per-app foreground time today (Android). Empty array where unsupported (iOS / Expo Go). */
export async function getUsageToday(): Promise<AppUsageEntry[]> {
  if (!Native?.getUsageToday) return [];
  return Native.getUsageToday();
}
