"use client";

import { useState } from "react";
import Link from "next/link";
import { formatDuration } from "@/lib/format";
import { ArrowRight, Clock, Circle, Search } from "lucide-react";

export type ChildCardData = {
  id: string;
  name: string;
  avatar: string | null;
  paused: boolean;
  deviceCount: number;
  onlineCount: number;
  secondsToday: number;
};

/**
 * Children cards for the overview, with a client-side name filter that only
 * appears once there are enough children to make searching worthwhile.
 */
export function ChildrenGrid({
  items,
  searchPlaceholder,
  noMatch,
}: {
  items: ChildCardData[];
  searchPlaceholder: string;
  noMatch: string;
}) {
  const [q, setQ] = useState("");
  const showSearch = items.length > 3;
  const term = q.trim().toLowerCase();
  const filtered = term ? items.filter((c) => c.name.toLowerCase().includes(term)) : items;

  return (
    <div className="space-y-3">
      {showSearch && (
        <div className="relative max-w-xs">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            className="input pl-9"
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="text-sm text-muted">{noMatch}</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((k) => (
            <Link key={k.id} href={`/dashboard/children/${k.id}`} className="card group p-5 transition hover:shadow-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-2xl">{k.avatar ?? "🧒"}</span>
                  <div>
                    <div className="flex items-center gap-2 font-bold">
                      {k.name}
                      {k.paused && <span className="badge bg-amber-100 text-amber-700">⏸ En pause</span>}
                    </div>
                    <div className="text-xs text-muted">{k.deviceCount} appareil(s) · {k.onlineCount} en ligne</div>
                  </div>
                </div>
                <ArrowRight size={18} className="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-500" />
              </div>
              <div className="mt-4 flex items-center gap-4 text-sm">
                <div className="flex items-center gap-1.5 text-muted">
                  <Clock size={15} /> {formatDuration(k.secondsToday)} aujourd'hui
                </div>
                <div className="flex items-center gap-1.5 text-muted">
                  <Circle size={9} className={k.onlineCount ? "fill-emerald-500 text-emerald-500" : "fill-slate-300 text-slate-300"} />
                  {k.onlineCount ? "Actif" : "Hors ligne"}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
