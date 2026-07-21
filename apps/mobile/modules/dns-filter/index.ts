import { requireOptionalNativeModule } from "expo";
import { webFilterConfigFromPolicy, webFilterNeeded, type NativeWebFilterConfig } from "./webfilter";

// On-device web filtering via an Android VpnService that inspects DNS queries and
// blocks/redirects them by category (mirroring the desktop agent's DNS proxy).
// Only present in a dev/production build (not Expo Go) and only on Android; on
// iOS / Expo Go every call is a safe no-op and `isAvailable` is false.
const Native = requireOptionalNativeModule("DnsFilter");

export { webFilterConfigFromPolicy, webFilterNeeded } from "./webfilter";
export type { NativeWebFilterConfig } from "./webfilter";

/** Whether the native DNS filter is available (dev build, Android). */
export const isAvailable = !!Native;

/**
 * Is the VPN-based filter currently running? Filtering only works once the user
 * has granted the one-time VPN consent (Android shows a system dialog) and the
 * service is up.
 */
export async function isRunning(): Promise<boolean> {
  if (!Native?.isRunning) return false;
  return Native.isRunning();
}

/**
 * Does starting the filter still need the one-time VPN consent? If so, calling
 * `start()` will surface Android's VpnService consent dialog. Returns false when
 * consent was already granted (start is silent) or the module is unavailable.
 */
export async function needsConsent(): Promise<boolean> {
  if (!Native?.needsConsent) return false;
  return Native.needsConsent();
}

/**
 * Push the current web-filter policy to the native service (persisted; the
 * VpnService reads it per DNS query). Safe no-op off Android / Expo Go.
 */
export function setPolicy(cfg: NativeWebFilterConfig): void {
  Native?.setPolicy?.(cfg);
}

/**
 * Start the DNS-filter VPN. Triggers Android's one-time consent dialog if needed
 * (resolves false if the user declines). No-op (resolves false) off Android.
 */
export async function start(): Promise<boolean> {
  if (!Native?.start) return false;
  return Native.start();
}

/** Stop the DNS-filter VPN. Safe no-op off Android / Expo Go. */
export function stop(): void {
  Native?.stop?.();
}

/**
 * Reconcile the native filter with the effective policy: push the config, then
 * start the VPN when filtering is required (and consent is already granted) or
 * stop it when nothing needs filtering. Never forces the consent dialog — that
 * is triggered explicitly from a user tap (see child-mode's "enable" button).
 */
export async function apply(policy: unknown): Promise<void> {
  if (!isAvailable) return;
  const cfg = webFilterConfigFromPolicy(policy as Parameters<typeof webFilterConfigFromPolicy>[0]);
  setPolicy(cfg);
  const needed = webFilterNeeded(cfg);
  const running = await isRunning();
  if (needed && !running) {
    // Only auto-start when we won't have to prompt; otherwise leave it to the
    // explicit "activer le filtrage" button so the consent dialog is user-driven.
    if (!(await needsConsent())) await start();
  } else if (!needed && running) {
    stop();
  }
}
