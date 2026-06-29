import webpush from "web-push";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "./prisma";

const VAPID_FILE = join(process.cwd(), ".vapid.json");

type Vapid = { publicKey: string; privateKey: string };

let cached: Vapid | null = null;

function loadVapid(): Vapid {
  if (cached) return cached;
  let v: Vapid;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    v = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  } else if (existsSync(VAPID_FILE)) {
    v = JSON.parse(readFileSync(VAPID_FILE, "utf8")) as Vapid;
  } else {
    const keys = webpush.generateVAPIDKeys();
    v = { publicKey: keys.publicKey, privateKey: keys.privateKey };
    try { writeFileSync(VAPID_FILE, JSON.stringify(v), "utf8"); } catch { /* read-only fs (prod): rely on env */ }
  }
  cached = v;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:contact@kidora.app",
    v.publicKey,
    v.privateKey,
  );
  return v;
}

export function getVapidPublicKey(): string {
  return loadVapid().publicKey;
}

export type PushPayload = { title: string; body: string; url?: string };

/** Send a push to all of a parent's subscriptions; prune dead ones. */
export async function sendPushToParent(parentId: string, payload: PushPayload): Promise<number> {
  loadVapid();
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
