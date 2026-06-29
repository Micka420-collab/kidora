"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/components/i18n-provider";
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
  const { t } = useT();
  const base = `/dashboard/children/${childId}`;
  const tabs = [
    { href: base, label: t.tabs.overview, icon: BarChart3 },
    { href: `${base}/apps`, label: t.tabs.apps, icon: AppWindow },
    { href: `${base}/web`, label: t.tabs.web, icon: Globe },
    { href: `${base}/screentime`, label: t.tabs.screenTime, icon: Clock },
    { href: `${base}/location`, label: t.tabs.location, icon: MapPin },
    { href: `${base}/activity`, label: t.tabs.activity, icon: Activity },
    { href: `${base}/reports`, label: t.tabs.reports, icon: FileText },
    { href: `${base}/devices`, label: t.tabs.devices, icon: Smartphone },
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
