import Link from "next/link";
import { getCurrentParent } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { accessibleChildWhere } from "@/lib/guard";
import { relativeTime } from "@/lib/format";
import { isDeviceOnline } from "@/lib/device-status";
import { Monitor, Smartphone, Circle, Battery, ArrowRight } from "lucide-react";

export default async function AllDevicesPage() {
  const parent = (await getCurrentParent())!;
  const kids = await prisma.child.findMany({
    where: accessibleChildWhere(parent.id),
    orderBy: { createdAt: "asc" },
    include: { devices: { orderBy: { createdAt: "asc" } } },
  });

  const allDevices = kids.flatMap((k) => k.devices);
  const online = allDevices.filter((d) => isDeviceOnline(d)).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Appareils</h1>
        <p className="text-sm text-muted">
          {allDevices.length} appareil(s) · {online} en ligne — tous les appareils de la famille.
        </p>
      </div>

      {allDevices.length === 0 ? (
        <div className="card p-10 text-center text-muted">
          Aucun appareil. Ajoutez-en un depuis la fiche d'un enfant.
        </div>
      ) : (
        kids
          .filter((k) => k.devices.length > 0)
          .map((k) => (
            <div key={k.id}>
              <div className="mb-2 flex items-center gap-2">
                <span className="text-xl">{k.avatar ?? "🧒"}</span>
                <h2 className="font-semibold">{k.name}</h2>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {k.devices.map((d) => (
                  <Link
                    key={d.id}
                    href={`/dashboard/children/${k.id}/devices`}
                    className="card group flex items-center gap-3 p-4 transition hover:shadow-md"
                  >
                    <span className="grid h-11 w-11 place-items-center rounded-xl bg-slate-50 text-slate-500">
                      {d.platform === "windows" || d.platform === "macos" ? <Monitor size={20} /> : <Smartphone size={20} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 font-medium">
                        {d.name}
                        <Circle size={8} className={isDeviceOnline(d) ? "fill-emerald-500 text-emerald-500" : "fill-slate-300 text-slate-300"} />
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted">
                        <span className="capitalize">{d.platform}</span>
                        {d.battery != null && <span className="flex items-center gap-0.5"><Battery size={11} />{d.battery}%</span>}
                        <span>· {relativeTime(d.lastSeen)}</span>
                      </div>
                    </div>
                    <ArrowRight size={16} className="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-500" />
                  </Link>
                ))}
              </div>
            </div>
          ))
      )}
    </div>
  );
}
