import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentParent } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { accessibleChildWhere, accessibleAlertWhere } from "@/lib/guard";
import { getLocale, getDict } from "@/lib/i18n";
import { DashboardShell } from "@/components/dashboard-shell";
import { VerifyEmailBanner } from "@/components/verify-email-banner";
import { OfflineBanner } from "@/components/offline-banner";
import { ServiceWorkerRegister } from "@/components/sw-register";
import { I18nProvider } from "@/components/i18n-provider";
import { ToastProvider } from "@/components/toast";

// Private area — keep it out of search indexes (defense-in-depth alongside
// robots.txt, which only asks crawlers not to fetch).
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const parent = await getCurrentParent();
  if (!parent) redirect("/login");

  const kids = await prisma.child.findMany({
    where: accessibleChildWhere(parent.id),
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, avatar: true },
  });
  const unread = await prisma.alert.count({
    where: { ...accessibleAlertWhere(parent.id), read: false },
  });

  const locale = await getLocale();
  const dict = getDict(locale);

  return (
    <I18nProvider dict={dict} locale={locale}>
      <ToastProvider>
        <DashboardShell
          parent={{ name: parent.name, email: parent.email }}
          kids={kids}
          unread={unread}
        >
          <ServiceWorkerRegister />
          <OfflineBanner />
          {!parent.emailVerified && <VerifyEmailBanner />}
          {children}
        </DashboardShell>
      </ToastProvider>
    </I18nProvider>
  );
}
