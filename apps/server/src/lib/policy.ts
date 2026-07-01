import { prisma } from "./prisma";
import { DEFAULT_BLOCKLIST } from "./categories";
import { isBedtimeNow, isBedtimeNowTz, todayWeekday, localWeekday } from "./schedule";
import { isPausedNow } from "./pause";
import { localDateString } from "./localdate";

// Re-exported for existing importers.
export { isBedtimeNow, isBedtimeNowTz, todayWeekday, localWeekday };

export type EffectivePolicy = {
  childId: string;
  childName: string;
  paused: boolean;
  generatedAt: string;
  screenTime: {
    enabled: boolean;
    dailyLimits: Record<string, number>; // weekday -> minutes
    bedtimes: { days: string[]; start: string; end: string }[];
    bonusMinutesToday: number; // extra minutes granted for today
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
  activeRoutines: string[];
};

function safeParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export type ScreenTimeToday = {
  enabled: boolean;
  limitMinutes: number; // today's base daily limit (0 = no limit set)
  bonusMinutes: number; // extra minutes granted for today
  totalMinutes: number; // limit + bonus (0 when there is no base limit)
};

/**
 * Pure: today's screen-time allowance from the raw ScreenTime row and the
 * already-summed bonus minutes. With no base limit the day is "free time", so
 * totalMinutes stays 0 even if bonus was granted.
 */
export function computeScreenTimeToday(
  screenTime: { enabled: boolean; dailyLimits: string } | null | undefined,
  bonusMinutes: number,
  weekday: string = todayWeekday(),
): ScreenTimeToday {
  const enabled = screenTime?.enabled ?? false;
  const limits = safeParse<Record<string, number>>(screenTime?.dailyLimits, {});
  const limitMinutes = enabled ? Math.max(0, limits[weekday] ?? 0) : 0;
  const bonus = enabled ? Math.max(0, bonusMinutes) : 0;
  return {
    enabled,
    limitMinutes,
    bonusMinutes: bonus,
    totalMinutes: limitMinutes > 0 ? limitMinutes + bonus : 0,
  };
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
      routines: true,
    },
  });
  if (!child) throw new Error("child not found");

  // "Today" in the family's local timezone (offset reported by the agent), so
  // the daily limit/bonus roll over at local midnight, not the server's UTC.
  const today = localDateString(Date.now(), child.tzOffsetMinutes);
  const grants = await prisma.timeGrant.findMany({ where: { childId, date: today } });
  const bonusMinutesToday = grants.reduce((a, g) => a + g.minutes, 0);

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

  // Build app rules, then overlay active routines (block selected apps now).
  const appRuleMap = new Map(
    child.appRules.map((r) => [
      r.appId,
      {
        appId: r.appId,
        appName: r.appName,
        action: r.action as "allow" | "block" | "limit",
        dailyLimitMinutes: r.dailyLimitMinutes,
      },
    ]),
  );
  const activeRoutines: string[] = [];
  for (const routine of child.routines) {
    if (!routine.enabled) continue;
    const days = safeParse<string[]>(routine.days, []);
    // Routines (e.g. "block games 08:00–16:00") are resolved server-side, so they
    // MUST use the family's local clock — not the server's UTC — or they fire at
    // the wrong hour for any non-UTC family.
    if (!isBedtimeNowTz([{ days, start: routine.start, end: routine.end }], child.tzOffsetMinutes)) continue;
    activeRoutines.push(routine.name);
    for (const appId of safeParse<string[]>(routine.blockedAppIds, [])) {
      const existing = appRuleMap.get(appId);
      appRuleMap.set(appId, {
        appId,
        appName: existing?.appName ?? appId,
        action: "block",
        dailyLimitMinutes: null,
      });
    }
  }

  return {
    childId: child.id,
    childName: child.name,
    paused: isPausedNow(child.paused, child.pausedUntil),
    generatedAt: new Date().toISOString(),
    screenTime: {
      enabled: child.screenTime?.enabled ?? false,
      dailyLimits: safeParse(child.screenTime?.dailyLimits, {}),
      bedtimes: safeParse(child.screenTime?.bedtimes, []),
      bonusMinutesToday,
    },
    webFilter: {
      safeSearch: child.webFilter?.safeSearch ?? true,
      blockUnknown: child.webFilter?.blockUnknown ?? false,
      blockedCategories,
    },
    blockedDomains: [...blockedDomains],
    allowedDomains: [...allowedDomains],
    appRules: [...appRuleMap.values()],
    activeRoutines,
  };
}
