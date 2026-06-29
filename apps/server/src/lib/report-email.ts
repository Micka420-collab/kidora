import { formatDuration } from "./format";
import type { ChildReport } from "./report";

// Pure rendering of the weekly summary email — no DB / SMTP imports, so it is
// unit-testable in isolation. Sending lives in report-mailer.ts.

const BRAND = "#4f46e5";
const MUTED = "#64748b";

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export type ReportItem = { childName: string; report: ChildReport };

/** True when the child had any activity worth reporting in the window. */
export function hasActivity(r: ChildReport): boolean {
  return r.totalSeconds > 0 || r.web.totalVisits > 0 || r.alerts.total > 0;
}

function childBlock(item: ReportItem): string {
  const { childName, report: r } = item;
  const topApps = r.topApps.slice(0, 3);
  const appsRows = topApps.length
    ? topApps
        .map(
          (a) =>
            `<tr><td style="padding:4px 0;color:#0f172a">${esc(a.appName)}</td>` +
            `<td style="padding:4px 0;text-align:right;color:${MUTED}">${formatDuration(a.seconds)}</td></tr>`,
        )
        .join("")
    : `<tr><td colspan="2" style="padding:4px 0;color:${MUTED}">Aucune app enregistrée</td></tr>`;

  return `
    <div style="border:1px solid #e2e8f0;border-radius:12px;padding:16px 18px;margin:0 0 14px">
      <div style="font-size:16px;font-weight:700;color:#0f172a;margin-bottom:10px">${esc(childName)}</div>
      <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">
        <tr>
          <td style="padding:2px 0;color:${MUTED}">Temps d'écran (total)</td>
          <td style="padding:2px 0;text-align:right;font-weight:600;color:#0f172a">${formatDuration(r.totalSeconds)}</td>
        </tr>
        <tr>
          <td style="padding:2px 0;color:${MUTED}">Moyenne / jour</td>
          <td style="padding:2px 0;text-align:right;color:#0f172a">${formatDuration(r.avgPerDaySeconds)}</td>
        </tr>
        <tr>
          <td style="padding:2px 0;color:${MUTED}">Visites web (bloquées)</td>
          <td style="padding:2px 0;text-align:right;color:#0f172a">${r.web.totalVisits} (${r.web.blockedVisits})</td>
        </tr>
        <tr>
          <td style="padding:2px 0;color:${MUTED}">Alertes</td>
          <td style="padding:2px 0;text-align:right;color:${r.alerts.total ? "#dc2626" : "#0f172a"}">${r.alerts.total}</td>
        </tr>
      </table>
      <div style="font-size:12px;font-weight:600;color:${MUTED};text-transform:uppercase;letter-spacing:.04em;margin:12px 0 4px">Top applications</div>
      <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">${appsRows}</table>
    </div>`;
}

export function renderWeeklyEmail(parentName: string, items: ReportItem[], days: number): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `Kidora — résumé hebdomadaire (${days} derniers jours)`;
  const blocks = items.map(childBlock).join("");
  const appUrl = process.env.APP_URL || "";
  const cta = appUrl
    ? `<a href="${esc(appUrl)}/dashboard" style="display:inline-block;background:${BRAND};color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:600;font-size:14px">Ouvrir le tableau de bord</a>`
    : "";

  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
    <div style="max-width:560px;margin:0 auto;padding:24px 16px">
      <div style="text-align:center;margin-bottom:18px">
        <div style="font-size:22px;font-weight:800;color:${BRAND}">Kidora</div>
        <div style="font-size:13px;color:${MUTED}">Résumé des ${days} derniers jours</div>
      </div>
      <div style="background:#fff;border-radius:16px;padding:20px">
        <p style="font-size:15px;color:#0f172a;margin:0 0 14px">Bonjour ${esc(parentName)}, voici l'activité de votre famille.</p>
        ${blocks}
        ${cta ? `<div style="text-align:center;margin-top:6px">${cta}</div>` : ""}
      </div>
      <p style="font-size:12px;color:${MUTED};text-align:center;margin:16px 0 0">
        Vous recevez cet email car les résumés hebdomadaires sont activés.<br>
        Désactivez-les dans Paramètres &rsaquo; Notifications du tableau de bord Kidora.
      </p>
    </div>
  </body></html>`;

  const text = [
    `Kidora — résumé des ${days} derniers jours`,
    `Bonjour ${parentName},`,
    "",
    ...items.map((it) => {
      const r = it.report;
      return [
        `# ${it.childName}`,
        `  Temps d'écran : ${formatDuration(r.totalSeconds)} (moy. ${formatDuration(r.avgPerDaySeconds)}/j)`,
        `  Visites web : ${r.web.totalVisits} (${r.web.blockedVisits} bloquées)`,
        `  Alertes : ${r.alerts.total}`,
        `  Top apps : ${r.topApps.slice(0, 3).map((a) => `${a.appName} (${formatDuration(a.seconds)})`).join(", ") || "—"}`,
      ].join("\n");
    }),
    "",
    "Désactivez les résumés dans Paramètres › Notifications.",
  ].join("\n");

  return { subject, html, text };
}
