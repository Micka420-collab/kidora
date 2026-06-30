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
