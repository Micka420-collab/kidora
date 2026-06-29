import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import {
  ShieldCheck, Clock, Globe, MapPin, AppWindow, BellRing,
  ShieldAlert, PlaySquare, KeyRound, ArrowRight, Lock, ExternalLink,
} from "lucide-react";

const features = [
  { icon: Clock, title: "Temps d'écran", desc: "Limites quotidiennes, routines horaires et heure du coucher, par appareil et par app." },
  { icon: Globe, title: "Filtrage web par catégorie", desc: "Bloquez adulte, violence, jeux d'argent… SafeSearch forcé, listes blanche/noire." },
  { icon: ShieldAlert, title: "Détection de risque (IA)", desc: "Analyse des messages & recherches : repère grooming, harcèlement et auto-mutilation.", badge: "Nouveau" },
  { icon: PlaySquare, title: "Vidéos & messages", desc: "Vidéos YouTube regardées (avec miniatures) et SMS reçus/envoyés sur le téléphone.", badge: "Nouveau" },
  { icon: AppWindow, title: "Contrôle des apps", desc: "Autorisez, bloquez ou limitez chaque application, détection des nouvelles apps." },
  { icon: MapPin, title: "Localisation & zones", desc: "Position en temps réel, historique et zones de sécurité (géofences) avec alertes." },
  { icon: BellRing, title: "Alertes & SOS", desc: "Notifications web push pour les alertes critiques, bouton SOS côté enfant." },
  { icon: KeyRound, title: "Sécurité du compte", desc: "2FA (TOTP), mot de passe vérifié contre les fuites, RGPD : export & suppression." },
];

const steps = [
  { n: "1", title: "Créez votre compte", desc: "En quelques secondes, gratuitement. Ajoutez vos enfants." },
  { n: "2", title: "Installez l'agent", desc: "Sur le PC (MSI) ou le téléphone (app Kids), avec un simple jeton." },
  { n: "3", title: "Veillez sereinement", desc: "Tableau de bord unique : règles, activité en direct, alertes." },
];

export default async function Home() {
  const session = await getSession();
  if (session) redirect("/dashboard");

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2 text-xl font-extrabold">
          <Image src="/kidora-mark.svg" alt="" width={34} height={34} priority unoptimized />
          Kidora
        </div>
        <div className="flex items-center gap-2">
          <Link href="/login" className="btn btn-ghost">Se connecter</Link>
          <Link href="/register" className="btn btn-primary">Commencer</Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-brand-50 to-transparent dark:from-brand-700/10" />
        <div className="mx-auto max-w-6xl px-6 pt-14 pb-20 text-center">
          <div className="badge mx-auto bg-brand-100 text-brand-700">
            🛡️ Contrôle parental puissant & bienveillant
          </div>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            Gardez vos enfants{" "}
            <span className="bg-gradient-to-r from-brand-500 to-brand-700 bg-clip-text text-transparent">en sécurité</span>{" "}
            dans le monde numérique
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted">
            Temps d'écran, filtrage web, contrôle des apps, localisation, vidéos &
            messages, et une <strong>détection de risque par IA</strong> — sur tous
            les appareils de la famille, depuis un seul tableau de bord.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/register" className="btn btn-primary px-6 py-3 text-base">
              Créer un compte gratuit <ArrowRight size={18} />
            </Link>
            <Link href="/login" className="btn btn-outline px-6 py-3 text-base">
              J'ai déjà un compte
            </Link>
          </div>
          <p className="mt-3 text-sm text-muted">
            Démo : <code className="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-800">demo@kidora.app</code> /{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-800">kidora1234</code>
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted">
            <span>🪟 Windows</span><span>🤖 Android</span><span>📱 iPhone</span>
            <span className="inline-flex items-center gap-1"><Lock size={14} /> Chiffré · RGPD</span>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-6 pb-20">
        <h2 className="mb-2 text-center text-2xl font-bold">Tout pour protéger, sans surveiller à l'excès</h2>
        <p className="mx-auto mb-10 max-w-2xl text-center text-muted">Des outils complets, pensés pour respecter l'autonomie grandissante de l'enfant.</p>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div key={f.title} className="card group p-6 transition hover:-translate-y-1 hover:shadow-lg">
              <div className="flex items-center justify-between">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-600 transition group-hover:bg-brand-600 group-hover:text-white dark:bg-brand-700/20">
                  <f.icon size={22} />
                </div>
                {f.badge && <span className="badge bg-emerald-100 text-emerald-700">{f.badge}</span>}
              </div>
              <h3 className="mt-4 text-base font-bold">{f.title}</h3>
              <p className="mt-1.5 text-sm text-muted">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-5xl px-6 pb-20">
        <h2 className="mb-10 text-center text-2xl font-bold">En 3 étapes</h2>
        <div className="grid gap-6 sm:grid-cols-3">
          {steps.map((s) => (
            <div key={s.n} className="text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand-600 text-lg font-extrabold text-white">{s.n}</div>
              <h3 className="mt-4 font-bold">{s.title}</h3>
              <p className="mt-1 text-sm text-muted">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Security band */}
      <section className="mx-auto max-w-6xl px-6 pb-20">
        <div className="card flex flex-col items-center gap-4 p-8 text-center sm:flex-row sm:text-left">
          <ShieldCheck size={40} className="shrink-0 text-brand-600" />
          <div className="flex-1">
            <h3 className="text-lg font-bold">Sécurité de niveau pro, par conception</h3>
            <p className="mt-1 text-sm text-muted">
              2FA/TOTP, mots de passe vérifiés contre les fuites (HIBP), protection anti-brute-force,
              Content-Security-Policy stricte, chiffrement des données sensibles au repos, et conformité RGPD
              (export & suppression). Vos données restent sur <strong>votre</strong> serveur.
            </p>
          </div>
          <Link href="/register" className="btn btn-primary shrink-0">Commencer</Link>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-brand-500 via-brand-600 to-brand-700 px-8 py-14 text-center text-white">
          <h2 className="text-3xl font-extrabold">Prêt à protéger votre famille ?</h2>
          <p className="mx-auto mt-3 max-w-xl text-white/85">Gratuit, sans carte bancaire. Quelques minutes pour tout configurer.</p>
          <Link href="/register" className="btn mt-7 inline-flex bg-white px-7 py-3 text-base font-bold text-brand-700 hover:bg-white/90">
            Créer mon compte <ArrowRight size={18} />
          </Link>
        </div>
      </section>

      <footer className="border-t py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 text-sm text-muted sm:flex-row">
          <span>Kidora — Conçu pour les familles. 🛡️</span>
          <a href="https://github.com/Micka420-collab/kidora" className="inline-flex items-center gap-1.5 hover:text-brand-600" target="_blank" rel="noreferrer">
            <ExternalLink size={15} /> Open source
          </a>
        </div>
      </footer>
    </div>
  );
}
