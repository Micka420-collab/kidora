import webpush from "web-push";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "./prisma";

const VAPID_FILE = join(process.cwd(), ".vapid.json");

type Vapid = { publicKey: string; privateKey: string };

/**
 * In production we must NOT fall back to generating an ephemeral VAPID keypair:
 * each serverless instance would generate a different pair, so the browser
 * (which subscribed with one instance's public key) would receive pushes signed
 * by another instance's private key → the push service rejects them and all
 * notifications (including critical SOS/risk alerts) silently fail. Treat push
 * as unconfigured instead. Dev keeps the generate-and-persist convenience.
 */
export function vapidMisconfiguredInProd(env: {
  NODE_ENV?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
}): boolean {
  return env.NODE_ENV === "production" && !(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
}

let cached: Vapid | null = null;
let warnedMissing = false;

function loadVapid(): Vapid | null {
  if (cached) return cached;
  let v: Vapid;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    v = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  } else if (vapidMisconfiguredInProd(process.env)) {
    if (!warnedMissing) {
      console.warn("[push] VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY unset in production — web push disabled (would otherwise use per-instance ephemeral keys).");
      warnedMissing = true;
    }
    return null;
  } else if (existsSync(VAPID_FILE)) {
    v = JSON.parse(readFileSync(VAPID_FILE, "utf8")) as Vapid;
  } else {
    const keys = webpush.generateVAPIDKeys();
    v = { publicKey: keys.publicKey, privateKey: keys.privateKey };
    try { writeFileSync(VAPID_FILE, JSON.stringify(v), "utf8"); } catch { /* read-only fs: rely on env */ }
  }
  cached = v;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:contact@kidora.app",
    v.publicKey,
    v.privateKey,
  );
  return v;
}

export function getVapidPublicKey(): string | null {
  return loadVapid()?.publicKey ?? null;
}

export type PushPayload = { title: string; body: string; url?: string };

/** Send a push to all of a parent's subscriptions; prune dead ones. */
export async function sendPushToParent(parentId: string, payload: PushPayload): Promise<number> {
  if (!loadVapid()) return 0; // push not configured (e.g. missing VAPID env in prod)
  const subs = await prisma.pushSub.findMany({ where: { parentId } });
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
        );
        sent++;
      } catch (e: unknown) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          await prisma.pushSub.delete({ where: { id: s.id } }).catch(() => {});
        }
      }
    }),
  );
  return sent;
}
