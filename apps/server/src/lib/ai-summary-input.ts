import type { ChildReport } from "./report";
import { RISK_CATEGORY_LABELS } from "./risk";

// Builds the AGGREGATE-ONLY payload handed to the LLM for a weekly summary — no
// message/search content, no domains, only counts and minutes. Shared by the
// on-demand summary route and the weekly email so both send the exact same
// privacy-safe shape.

const ALERT_LABELS: Record<string, string> = {
  blocked_attempt: "tentatives bloquées",
  new_app: "nouvelles apps",
  limit_reached: "limites atteintes",
  geofence: "zones",
  keyword: "mots-clés sensibles",
  risk: "risques détectés",
  panic: "SOS",
  device_offline: "appareil hors-ligne",
  time_request: "demandes de temps",
};

const mins = (seconds: number) => Math.round(seconds / 60);

export function buildAiSummaryInput(childName: string, report: ChildReport, days = 7) {
  return {
    enfant: childName,
    periode: `${days} derniers jours`,
    tempsEcran: { totalMin: mins(report.totalSeconds), moyenneParJourMin: mins(report.avgPerDaySeconds) },
    topApps: report.topApps.slice(0, 5).map((a) => ({ app: a.appName, minutes: mins(a.seconds) })),
    topCategories: report.byCategory.slice(0, 5).map((c) => ({ categorie: c.category, minutes: mins(c.seconds) })),
    web: { visites: report.web.totalVisits, bloquees: report.web.blockedVisits },
    alertes: {
      total: report.alerts.total,
      parType: report.alerts.byType.map((b) => ({ type: ALERT_LABELS[b.type] ?? b.type, nombre: b.count })),
    },
    categoriesRisque: Object.values(RISK_CATEGORY_LABELS),
  };
}
