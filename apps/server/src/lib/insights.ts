export type Insight =
  | { key: "screenTime"; seconds: number; deltaPct: number | null; direction: "up" | "down" | "flat" }
  | { key: "topCategory"; category: string; seconds: number }
  | { key: "busiestDay"; date: string; seconds: number }
  | { key: "alerts"; count: number };

export type InsightsInput = {
  thisWeekSeconds: number;
  lastWeekSeconds: number;
  topCategory: { category: string; seconds: number } | null;
  busiestDay: { date: string; seconds: number } | null;
  alertsThisWeek: number;
};

const FLAT_THRESHOLD_PCT = 3;
const DAY_MS = 86400_000;

/**
 * Date-string (UTC ymd) windows for the family "this week vs last week" insight.
 * Both windows span exactly 7 calendar dates so the delta is unbiased:
 *   current : date >= curFrom              → [now-6d … today]   (7 dates)
 *   previous: date >= prevFrom && < prevTo → [now-13d … now-7d] (7 dates)
 */
export function weekWindows(nowMs: number): { curFrom: string; prevFrom: string; prevTo: string } {
  const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return {
    curFrom: ymd(nowMs - 6 * DAY_MS),
    prevFrom: ymd(nowMs - 13 * DAY_MS),
    prevTo: ymd(nowMs - 6 * DAY_MS),
  };
}

/**
 * Family "this week" highlights. Pure & unit-tested; the dashboard supplies the
 * aggregates and renders/i18n-formats the structured result. Screen-time and
 * alerts always appear; category/day only when there is data.
 */
export function buildInsights(input: InsightsInput): Insight[] {
  const out: Insight[] = [];

  let deltaPct: number | null = null;
  let direction: "up" | "down" | "flat" = "flat";
  if (input.lastWeekSeconds > 0) {
    deltaPct = Math.round(((input.thisWeekSeconds - input.lastWeekSeconds) / input.lastWeekSeconds) * 100);
    direction = deltaPct > FLAT_THRESHOLD_PCT ? "up" : deltaPct < -FLAT_THRESHOLD_PCT ? "down" : "flat";
  }
  out.push({ key: "screenTime", seconds: input.thisWeekSeconds, deltaPct, direction });

  if (input.topCategory && input.topCategory.seconds > 0) {
    out.push({ key: "topCategory", category: input.topCategory.category, seconds: input.topCategory.seconds });
  }
  if (input.busiestDay && input.busiestDay.seconds > 0) {
    out.push({ key: "busiestDay", date: input.busiestDay.date, seconds: input.busiestDay.seconds });
  }

  out.push({ key: "alerts", count: input.alertsThisWeek });
  return out;
}
