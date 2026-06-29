import { redirect } from "next/navigation";
import { getCurrentParent } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DashboardShell } from "@/components/dashboard-shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const parent = await getCurrentParent();
  if (!parent) redirect("/login");

  const kids = await prisma.child.findMany({
    where: { parentId: parent.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, avatar: true },
  });
  const unread = await prisma.alert.count({
    where: { parentId: parent.id, read: false },
  });

  return (
    <DashboardShell
      parent={{ name: parent.name, email: parent.email }}
      kids={kids}
      unread={unread}
    >
      {children}
    </DashboardShell>
  );
}
