import { notFound, redirect } from "next/navigation";
import { getCurrentParent } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { accessibleChildWhere } from "@/lib/guard";
import { ChildHeader } from "@/components/child-header";
import { ChildTabs } from "@/components/child-tabs";

export default async function ChildLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ childId: string }>;
}) {
  const parent = await getCurrentParent();
  if (!parent) redirect("/login");
  const { childId } = await params;

  const child = await prisma.child.findFirst({
    where: { id: childId, ...accessibleChildWhere(parent.id) },
    include: { devices: true },
  });
  if (!child) notFound();

  return (
    <div className="space-y-6">
      <ChildHeader
        child={{
          id: child.id,
          name: child.name,
          avatar: child.avatar,
          paused: child.paused,
        }}
        devices={child.devices.map((d) => ({
          id: d.id,
          name: d.name,
          platform: d.platform,
          online: d.online,
          battery: d.battery,
        }))}
      />
      <ChildTabs childId={child.id} />
      <div>{children}</div>
    </div>
  );
}
