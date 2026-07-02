import { requireOptionalNativeModule } from "expo";

// Native app-blocking via an Android AccessibilityService. Only present in a
// dev/production build (not Expo Go) and only on Android. On iOS / Expo Go every
// call is a safe no-op and `isAvailable` is false.
const Native = requireOptionalNativeModule("AppBlocker");

/** Whether the native blocker is available (dev build, Android). */
export const isAvailable = !!Native;

/**
 * Is the Kidora accessibility service currently enabled by the user? App blocking
 * only works once the parent grants it in Android's Accessibility settings.
 */
export async function isEnabled(): Promise<boolean> {
  if (!Native?.isEnabled) return false;
  return Native.isEnabled();
}

/** Open the system Accessibility settings so the user can enable the service. */
export function openSettings(): void {
  Native?.openSettings?.();
}

/**
 * Set the list of blocked app package names (e.g. "com.zhiliaoapp.musically").
 * The service reads this list on every foreground-app change; an app in the list
 * is immediately sent to the background. Persisted natively so it survives the
 * service being restarted by the OS.
 */
export function setBlockedPackages(packages: string[]): void {
  Native?.setBlockedPackages?.(packages ?? []);
}

/**
 * When paused, EVERY app except Kidora Kids and the launcher is blocked (a
 * parent-initiated "take a break"). Overrides the per-app block list.
 */
export function setPaused(paused: boolean): void {
  Native?.setPaused?.(!!paused);
}
