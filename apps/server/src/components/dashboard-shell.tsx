"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { useT } from "@/components/i18n-provider";
import {
  LayoutDashboard,
  BellRing,
  Settings,
  LogOut,
  Plus,
  Menu,
  X,
  Smartphone,
  Sun,
  Moon,
} from "lucide-react";

type Kid = { id: string; name: string; avatar: string | null };

export function DashboardShell({
  parent,
  kids,
  unread,
  children,
}: {
  parent: { name: string; email: string };
  kids: Kid[];
  unread: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { t, locale } = useT();
  const [open, setOpen] = useState(false);

  async function logout() {
    await api.post("/api/auth/logout");
    router.push("/login");
    router.refresh();
  }

  function setLocale(l: "fr" | "en") {
    document.cookie = `kidora_locale=${l}; path=/; max-age=31536000`;
    router.refresh();
  }

  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);
  function toggleTheme() {
    const isDark = document.documentElement.classList.toggle("dark");
    setDark(isDark);
    document.cookie = `kidora_theme=${isDark ? "dark" : "light"}; path=/; max-age=31536000`;
  }

  const navItem = (href: string, label: string, Icon: typeof LayoutDashboard, badge?: number) => {
    const active = pathname === href;
    return (
      <Link
        key={href}
        href={href}
        onClick={() => setOpen(false)}
        className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition ${
          active ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100"
        }`}
      >
        <span className="flex items-center gap-2.5">
          <Icon size={18} /> {label}
        </span>
        {badge ? (
          <span className={`badge ${active ? "bg-white/25 text-white" : "bg-red-100 text-red-600"}`}>
            {badge}
          </span>
        ) : null}
      </Link>
    );
  };

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 transform border-r bg-white p-4 transition-transform md:static md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-6 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2 text-lg font-extrabold">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white">K</span>
            Kidora
          </Link>
          <button className="md:hidden" onClick={() => setOpen(false)} aria-label="Fermer le menu"><X size={20} /></button>
        </div>

        <nav className="space-y-1">
          {navItem("/dashboard", t.nav.overview, LayoutDashboard)}
          {navItem("/dashboard/alerts", t.nav.alerts, BellRing, unread)}
          {navItem("/dashboard/devices", t.nav.devices, Smartphone)}
          {navItem("/dashboard/settings", t.nav.settings, Settings)}
        </nav>

        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between px-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">{t.nav.myChildren}</span>
            <Link href="/dashboard/children/new" className="text-brand-600 hover:text-brand-700" title={t.nav.addChild}><Plus size={16} /></Link>
          </div>
          <div className="space-y-1">
            {kids.map((k) => {
              const href = `/dashboard/children/${k.id}`;
              const active = pathname.startsWith(href);
              return (
                <Link
                  key={k.id}
                  href={href}
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                    active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <span className="text-lg leading-none">{k.avatar ?? "🧒"}</span>
                  {k.name}
                </Link>
              );
            })}
            {kids.length === 0 && (
              <Link href="/dashboard/children/new" className="block rounded-lg border border-dashed px-3 py-2 text-center text-sm text-muted hover:border-brand-300">
                + {t.nav.addChild}
              </Link>
            )}
          </div>
        </div>

        <div className="absolute inset-x-4 bottom-4">
          <div className="mb-2 rounded-lg bg-slate-50 px-3 py-2">
            <div className="truncate text-sm font-semibold">{parent.name}</div>
            <div className="truncate text-xs text-muted">{parent.email}</div>
          </div>
          <div className="mb-2 flex gap-2">
            <div className="flex flex-1 overflow-hidden rounded-lg border text-xs">
              <button onClick={() => setLocale("fr")} className={`flex-1 py-1.5 font-semibold ${locale === "fr" ? "bg-brand-600 text-white" : "bg-white text-slate-500"}`}>FR</button>
              <button onClick={() => setLocale("en")} className={`flex-1 py-1.5 font-semibold ${locale === "en" ? "bg-brand-600 text-white" : "bg-white text-slate-500"}`}>EN</button>
            </div>
            <button
              onClick={toggleTheme}
              aria-label={dark ? "Mode clair" : "Mode sombre"}
              className="grid w-10 place-items-center rounded-lg border bg-white text-slate-500 hover:text-brand-600"
            >
              {dark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
          <button onClick={logout} className="btn btn-outline w-full">
            <LogOut size={16} /> {t.nav.logout}
          </button>
        </div>
      </aside>

      {open && (
        <div className="fixed inset-0 z-30 bg-black/30 md:hidden" onClick={() => setOpen(false)} />
      )}

      {/* Main */}
      <div className="flex-1 md:ml-0">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b bg-white/80 px-5 py-3 backdrop-blur md:hidden">
          <button onClick={() => setOpen(true)} aria-label="Ouvrir le menu"><Menu size={22} /></button>
          <span className="font-extrabold">Kidora</span>
        </header>
        <main className="mx-auto max-w-6xl p-5 md:p-8">{children}</main>
      </div>
    </div>
  );
}
