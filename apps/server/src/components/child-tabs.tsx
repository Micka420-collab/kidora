"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  AppWindow,
  Globe,
  Clock,
  MapPin,
  Activity,
  Smartphone,
  FileText,
} from "lucide-react";

export function ChildTabs({ childId }: { childId: string }) {
  const pathname = usePathname();
  const base = `/dashboard/children/${childId}`;
  const tabs = [
    { href: base, label: "Vue d'ensemble", icon: BarChart3 },
    { href: `${base}/apps`, label: "Applications", icon: AppWindow },
    { href: `${base}/web`, label: "Web", icon: Globe },
    { href: `${base}/screentime`, label: "Temps d'écran", icon: Clock },
    { href: `${base}/location`, label: "Localisation", icon: MapPin },
    { href: `${base}/activity`, label: "Activité", icon: Activity },
    { href: `${base}/reports`, label: "Rapports", icon: FileText },
    { href: `${base}/devices`, label: "Appareils", icon: Smartphone },
  ];

  return (
    <div className="flex gap-1 overflow-x-auto border-b pb-px">
      {tabs.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition ${
              active
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <t.icon size={16} /> {t.label}
          </Link>
        );
      })}
    </div>
  );
}
