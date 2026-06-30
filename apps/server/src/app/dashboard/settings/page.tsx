import { getCurrentParent } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { relativeTime } from "@/lib/format";
import { getLocale, getDict } from "@/lib/i18n";
import { User, Shield, Smartphone, ScrollText } from "lucide-react";
import { GuardiansCard } from "@/components/guardians-card";
import { AccountDataCard } from "@/components/account-data-card";
import { PushToggle } from "@/components/push-toggle";
import { WeeklyReportToggle } from "@/components/weekly-report-toggle";
import { NotificationPrefsCard } from "@/components/notification-prefs-card";
import { parseMutedTypes } from "@/lib/alert-prefs";
import { TwoFactorCard } from "@/components/two-factor-card";
import { ChangePasswordCard } from "@/components/change-password-card";
import { ChangeEmailCard } from "@/components/change-email-card";

const ACTION_LABELS: Record<string, string> = {
  login: "Connexion",
  "child.create": "Enfant ajouté",
  "child.delete": "Enfant supprimé",
  "time.grant": "Temps bonus accordé",
  command: "Commande envoyée",
  "rule.change": "Règle modifiée",
  "account.password_change": "Mot de passe modifié",
  "account.email_change": "Adresse email modifiée",
};

export default async function SettingsPage() {
  const parent = (await getCurrentParent())!;
  const childCount = await prisma.child.count({ where: { parentId: parent.id } });
  const deviceCount = await prisma.device.count({
    where: { child: { parentId: parent.id } },
  });
  const auditLogs = await prisma.auditLog.findMany({
    where: { parentId: parent.id },
    orderBy: { ts: "desc" },
    take: 15,
  });
  const locale = await getLocale();
  const t = getDict(locale).settings;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t.title}</h1>
        <p className="text-sm text-muted">{t.subtitle}</p>
      </div>

      <div className="card p-6">
        <h2 className="mb-4 flex items-center gap-2 text-base font-semibold"><User size={18} /> {t.account}</h2>
        <dl className="grid gap-3 sm:grid-cols-2">
          <Field label={t.name} value={parent.name} />
          <Field label={t.email} value={parent.email} />
          <Field label={t.role} value={parent.role === "owner" ? t.owner : t.guardian} />
          <Field label={t.memberSince} value={parent.createdAt.toLocaleDateString(locale === "en" ? "en-US" : "fr-FR")} />
        </dl>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card flex items-center gap-4 p-5">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-600"><Shield size={20} /></span>
          <div>
            <div className="text-2xl font-bold">{childCount}</div>
            <div className="text-xs text-muted">{t.childrenProtected}</div>
          </div>
        </div>
        <div className="card flex items-center gap-4 p-5">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-emerald-600"><Smartphone size={20} /></span>
          <div>
            <div className="text-2xl font-bold">{deviceCount}</div>
            <div className="text-xs text-muted">{t.devicesMonitored}</div>
          </div>
        </div>
      </div>

      <ChangeEmailCard current={parent.email} />

      <TwoFactorCard />

      <ChangePasswordCard />

      <PushToggle />

      <WeeklyReportToggle
        initial={parent.weeklyReportEmail}
        label={t.weeklyReport}
        desc={t.weeklyReportDesc}
      />

      <NotificationPrefsCard
        initialMuted={parseMutedTypes(parent.alertPrefs)}
        labels={{
          title: t.notifTitle,
          desc: t.notifDesc,
          safetyNote: t.notifSafetyNote,
          types: {
            new_app: t.nt_new_app,
            limit_reached: t.nt_limit_reached,
            blocked_attempt: t.nt_blocked_attempt,
            geofence: t.nt_geofence,
            keyword: t.nt_keyword,
          },
        }}
      />

      <GuardiansCard />

      <div className="card p-6">
        <h2 className="mb-4 flex items-center gap-2 text-base font-semibold"><ScrollText size={18} /> {t.journal}</h2>
        {auditLogs.length === 0 ? (
          <p className="text-sm text-muted">Aucune action enregistrée pour l'instant.</p>
        ) : (
          <ul className="divide-y">
            {auditLogs.map((l) => (
              <li key={l.id} className="flex items-center justify-between py-2.5 text-sm">
                <span>
                  <span className="font-medium">{ACTION_LABELS[l.action] ?? l.action}</span>
                  {l.detail && <span className="text-muted"> · {l.detail}</span>}
                </span>
                <span className="text-xs text-muted">{relativeTime(l.ts)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <AccountDataCard />

      <div className="card p-6">
        <h2 className="mb-2 text-base font-semibold">{t.about}</h2>
        <p className="text-sm text-muted">
          Kidora protège votre famille sur Windows, Android et iPhone. Temps d'écran,
          filtrage web, contrôle des applications, localisation et alertes — depuis un
          tableau de bord unique. Version 1.0.0.
        </p>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-4 py-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
