import { redirect } from "next/navigation";
import { getCurrentParent } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { accessibleChildWhere } from "@/lib/guard";
import { getLocale, getDict } from "@/lib/i18n";
import { DashboardShell } from "@/components/dashboard-shell";
import { I18nProvider } from "@/components/i18n-provider";

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
    where: { parentId: parent.id, read: false },
  });

  const locale = await getLocale();
  const dict = getDict(locale);

  return (
    <I18nProvider dict={dict} locale={locale}>
      <DashboardShell
        parent={{ name: parent.name, email: parent.email }}
        kids={kids}
        unread={unread}
      >
        {children}
      </DashboardShell>
    </I18nProvider>
  );
}
