import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentParent } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { accessibleChildWhere } from "@/lib/guard";
import { isDeviceOnline } from "@/lib/device-status";
import { isPausedNow } from "@/lib/pause";
import { ChildHeader } from "@/components/child-header";
import { ChildTabs } from "@/components/child-tabs";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ childId: string }>;
}): Promise<Metadata> {
  const parent = await getCurrentParent();
  if (!parent) return { title: "Kidora" };
  const { childId } = await params;
  const child = await prisma.child.findFirst({
    where: { id: childId, ...accessibleChildWhere(parent.id) },
    select: { name: true, avatar: true },
  });
  return { title: child ? `${child.avatar ?? "🧒"} ${child.name} · Kidora` : "Kidora" };
}

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
          paused: isPausedNow(child.paused, child.pausedUntil),
          pausedUntil: child.pausedUntil ? child.pausedUntil.toISOString() : null,
        }}
        devices={child.devices.map((d) => ({
          id: d.id,
          name: d.name,
          platform: d.platform,
          online: isDeviceOnline(d),
          battery: d.battery,
        }))}
      />
      <ChildTabs childId={child.id} />
      <div>{children}</div>
    </div>
  );
}
