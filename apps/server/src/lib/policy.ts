import { prisma } from "./prisma";
import { DEFAULT_BLOCKLIST } from "./categories";

export type EffectivePolicy = {
  childId: string;
  childName: string;
  paused: boolean;
  generatedAt: string;
  screenTime: {
    enabled: boolean;
    dailyLimits: Record<string, number>; // weekday -> minutes
    bedtimes: { days: string[]; start: string; end: string }[];
  };
  webFilter: {
    safeSearch: boolean;
    blockUnknown: boolean;
    blockedCategories: string[];
  };
  blockedDomains: string[];
  allowedDomains: string[];
  appRules: {
    appId: string;
    appName: string;
    action: "allow" | "block" | "limit";
    dailyLimitMinutes: number | null;
  }[];
};

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function safeParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Build the full enforcement policy a device agent should apply. */
export async function buildPolicy(childId: string): Promise<EffectivePolicy> {
  const child = await prisma.child.findUnique({
    where: { id: childId },
    include: {
      screenTime: true,
      webFilter: true,
      appRules: true,
      webRules: true,
    },
  });
  if (!child) throw new Error("child not found");

  const blockedDomains = new Set<string>(DEFAULT_BLOCKLIST);
  const allowedDomains = new Set<string>();
  const blockedCategories = safeParse<string[]>(
    child.webFilter?.blockedCategories,
    [],
  );

  for (const r of child.webRules) {
    if (r.kind === "domain") {
      if (r.action === "block") blockedDomains.add(r.value);
      else allowedDomains.add(r.value);
    }
  }
  // explicit allow wins over default blocklist
  for (const a of allowedDomains) blockedDomains.delete(a);

  return {
    childId: child.id,
    childName: child.name,
    paused: child.paused,
    generatedAt: new Date().toISOString(),
    screenTime: {
      enabled: child.screenTime?.enabled ?? false,
      dailyLimits: safeParse(child.screenTime?.dailyLimits, {}),
      bedtimes: safeParse(child.screenTime?.bedtimes, []),
    },
    webFilter: {
      safeSearch: child.webFilter?.safeSearch ?? true,
      blockUnknown: child.webFilter?.blockUnknown ?? false,
      blockedCategories,
    },
    blockedDomains: [...blockedDomains],
    allowedDomains: [...allowedDomains],
    appRules: child.appRules.map((r) => ({
      appId: r.appId,
      appName: r.appName,
      action: r.action as "allow" | "block" | "limit",
      dailyLimitMinutes: r.dailyLimitMinutes,
    })),
  };
}

/** Today's weekday key (server-local). */
export function todayWeekday(d = new Date()): string {
  return WEEKDAYS[d.getDay()];
}

/** Is the given time within any bedtime window? Handles overnight ranges. */
export function isBedtimeNow(
  bedtimes: { days: string[]; start: string; end: string }[],
  now = new Date(),
): boolean {
  const wd = todayWeekday(now);
  const mins = now.getHours() * 60 + now.getMinutes();
  for (const b of bedtimes) {
    if (b.days.length && !b.days.includes(wd)) continue;
    const [sh, sm] = b.start.split(":").map(Number);
    const [eh, em] = b.end.split(":").map(Number);
    const s = sh * 60 + sm;
    const e = eh * 60 + em;
    if (s <= e) {
      if (mins >= s && mins < e) return true;
    } else {
      // overnight, e.g. 21:00 → 07:00
      if (mins >= s || mins < e) return true;
    }
  }
  return false;
}
