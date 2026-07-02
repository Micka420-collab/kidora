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

/** Send a push to every guardian of a child (owner + co-guardians), so a
 *  critical alert reaches BOTH parents, not just the owning one. */
export async function sendPushToChildGuardians(childId: string, payload: PushPayload): Promise<number> {
  const child = await prisma.child.findUnique({
    where: { id: childId },
    select: { parentId: true, guardianships: { select: { parentId: true } } },
  });
  if (!child) return 0;
  const ids = new Set<string>([child.parentId, ...child.guardianships.map((g) => g.parentId)]);
  let sent = 0;
  for (const id of ids) sent += await sendPushToParent(id, payload);
  return sent;
}

/**
 * What to do about a web-push send error, by HTTP status:
 *  - 404/410 → the subscription is gone; delete it, don't retry.
 *  - 429 / 5xx / network error (no status) → transient; retry.
 *  - any other 4xx (400/401/413…) → permanent client error; give up.
 * Pure so it's unit-testable.
 */
export function pushErrorAction(code: number | undefined): "expired" | "retry" | "fail" {
  if (code === 404 || code === 410) return "expired";
  if (code === undefined) return "retry"; // network/DNS error — worth another try
  if (code === 429 || (code >= 500 && code < 600)) return "retry";
  return "fail";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Send a push to all of a parent's subscriptions, retrying transient failures a
 *  few times (so a network blip doesn't drop a critical SOS/risk alert) and
 *  pruning expired subscriptions. */
export async function sendPushToParent(parentId: string, payload: PushPayload, attempts = 3): Promise<number> {
  if (!loadVapid()) return 0; // push not configured (e.g. missing VAPID env in prod)
  const subs = await prisma.pushSub.findMany({ where: { parentId } });
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      for (let i = 0; i < attempts; i++) {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            JSON.stringify(payload),
          );
          sent++;
          return;
        } catch (e: unknown) {
          const action = pushErrorAction((e as { statusCode?: number }).statusCode);
          if (action === "expired") {
            await prisma.pushSub.delete({ where: { id: s.id } }).catch(() => {});
            return;
          }
          if (action === "fail" || i === attempts - 1) return;
          await sleep(200 * (i + 1)); // 200ms, 400ms backoff before the next try
        }
      }
    }),
  );
  return sent;
}
