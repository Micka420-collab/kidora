import { headers } from "next/headers";
import { collectDiagnostics, type DiagStatus } from "@/lib/diagnostics";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "État de l'installation · Kidora",
  robots: { index: false, follow: false },
};

const BADGE: Record<DiagStatus, { icon: string; cls: string }> = {
  ok: { icon: "✓", cls: "bg-emerald-100 text-emerald-700" },
  warn: { icon: "!", cls: "bg-amber-100 text-amber-700" },
  fail: { icon: "✗", cls: "bg-red-100 text-red-700" },
};

const SUMMARY: Record<DiagStatus, { title: string; cls: string }> = {
  ok: { title: "Tout est correctement configuré.", cls: "text-emerald-700" },
  warn: { title: "Fonctionnel — quelques options ne sont pas configurées.", cls: "text-amber-700" },
  fail: { title: "Configuration incomplète : une vérification bloquante a échoué.", cls: "text-red-700" },
};

export default async function StatusPage() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const { overall, checks } = await collectDiagnostics({ isHttps: proto === "https", host });
  const summary = SUMMARY[overall];

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-bold">État de l&apos;installation Kidora</h1>
      <p className="mt-1 text-sm text-slate-500">
        Vérification de la configuration de ce serveur. Aucune valeur secrète n&apos;est affichée.
      </p>

      <p className={`mt-6 text-lg font-semibold ${summary.cls}`}>{summary.title}</p>

      <ul className="mt-4 divide-y rounded-xl border bg-white">
        {checks.map((chk) => {
          const b = BADGE[chk.status];
          return (
            <li key={chk.id} className="flex items-start gap-3 p-4">
              <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-sm font-bold ${b.cls}`}>
                {b.icon}
              </span>
              <div className="min-w-0">
                <p className="font-medium text-slate-900">{chk.label}</p>
                <p className="text-sm text-slate-500">{chk.detail}</p>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="mt-6 text-xs text-slate-400">
        Version JSON : <code>/api/status</code> · Sonde de disponibilité : <code>/api/health</code>
      </p>
    </main>
  );
}
