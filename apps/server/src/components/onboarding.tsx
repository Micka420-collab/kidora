import Link from "next/link";
import { Plus, Smartphone, SlidersHorizontal } from "lucide-react";
import type { Dict } from "@/lib/i18n";

export function Onboarding({ t }: { t: Dict["onboarding"] }) {
  const steps = [
    { n: 1, icon: Plus, title: t.step1Title, desc: t.step1Desc, cta: { href: "/dashboard/children/new", label: t.step1Cta } },
    { n: 2, icon: Smartphone, title: t.step2Title, desc: t.step2Desc },
    { n: 3, icon: SlidersHorizontal, title: t.step3Title, desc: t.step3Desc },
  ];

  return (
    <div className="card overflow-hidden">
      <div className="bg-gradient-to-br from-brand-600 to-brand-800 p-8 text-center text-white">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-white/15 text-3xl">🛡️</div>
        <h2 className="mt-4 text-2xl font-extrabold">{t.title}</h2>
        <p className="mt-1 text-brand-100">{t.subtitle}</p>
      </div>
      <div className="grid gap-4 p-6 sm:grid-cols-3">
        {steps.map((s) => (
          <div key={s.n} className="rounded-xl border p-5">
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-600 text-sm font-bold text-white">{s.n}</span>
              <s.icon size={18} className="text-brand-600" />
            </div>
            <h3 className="mt-3 font-semibold">{s.title}</h3>
            <p className="mt-1 text-sm text-muted">{s.desc}</p>
            {s.cta && (
              <Link href={s.cta.href} className="btn btn-primary mt-4 w-full">
                <Plus size={16} /> {s.cta.label}
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
