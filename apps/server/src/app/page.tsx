import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import {
  ShieldCheck,
  Clock,
  Globe,
  MapPin,
  AppWindow,
  BellRing,
} from "lucide-react";

const features = [
  { icon: Clock, title: "Temps d'écran", desc: "Limites quotidiennes, horaires et heure du coucher par appareil." },
  { icon: Globe, title: "Filtrage web", desc: "Bloquez les contenus inappropriés par catégorie et SafeSearch." },
  { icon: AppWindow, title: "Contrôle des apps", desc: "Autorisez, bloquez ou limitez chaque application." },
  { icon: MapPin, title: "Localisation", desc: "Position en temps réel et zones de sécurité (géofences)." },
  { icon: BellRing, title: "Alertes intelligentes", desc: "Soyez prévenu en cas de tentative bloquée ou de dépassement." },
  { icon: ShieldCheck, title: "Multi-plateforme", desc: "Windows, Android et iPhone depuis un seul tableau de bord." },
];

export default async function Home() {
  const session = await getSession();
  if (session) redirect("/dashboard");

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2 text-xl font-extrabold">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 text-white">K</span>
          Kidora
        </div>
        <div className="flex items-center gap-2">
          <Link href="/login" className="btn btn-ghost">Se connecter</Link>
          <Link href="/register" className="btn btn-primary">Commencer</Link>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 pt-14 pb-20 text-center">
        <div className="badge mx-auto bg-brand-100 text-brand-700">
          🛡️ Contrôle parental puissant & bienveillant
        </div>
        <h1 className="mx-auto mt-6 max-w-3xl text-5xl font-extrabold leading-tight tracking-tight">
          Gardez vos enfants{" "}
          <span className="text-brand-600">en sécurité</span> dans le monde numérique
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-muted">
          Kidora vous donne une vision claire et le contrôle du temps d'écran, des
          applications, des sites web et de la localisation — sur tous les appareils
          de la famille.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/register" className="btn btn-primary px-6 py-3 text-base">
            Créer un compte gratuit
          </Link>
          <Link href="/login" className="btn btn-outline px-6 py-3 text-base">
            J'ai déjà un compte
          </Link>
        </div>
        <p className="mt-3 text-sm text-muted">
          Démo : <code className="rounded bg-slate-100 px-1.5 py-0.5">demo@kidora.app</code> /{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5">kidora1234</code>
        </p>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="card p-6">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-600">
                <f.icon size={22} />
              </div>
              <h3 className="mt-4 text-lg font-bold">{f.title}</h3>
              <p className="mt-1.5 text-sm text-muted">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t py-8 text-center text-sm text-muted">
        Kidora — Conçu pour les familles.
      </footer>
    </div>
  );
}
