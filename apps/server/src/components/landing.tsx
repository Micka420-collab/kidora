"use client";

import Link from "next/link";
import Image from "next/image";
import { useRef, type MouseEvent } from "react";
import { motion, useScroll, useTransform, useSpring, useMotionValue, type Variants } from "framer-motion";
import {
  ShieldCheck, Clock, Globe, MapPin, AppWindow, BellRing,
  ShieldAlert, PlaySquare, KeyRound, ArrowRight, Lock, ExternalLink, Check,
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

const showcase = [
  {
    img: "/show-filter.jpg",
    eyebrow: "Filtrage & sécurité",
    title: "Un web filtré, sans angle mort",
    desc: "La mascotte fait barrage : le bon contenu passe, les menaces sont bloquées avant même d'arriver.",
    points: [
      "Blocage par catégorie : adulte, violence, jeux d'argent…",
      "SafeSearch forcé sur Google, Bing & YouTube",
      "Listes blanche et noire personnalisées par enfant",
    ],
  },
  {
    img: "/show-location.jpg",
    eyebrow: "Localisation & zones",
    title: "Toujours savoir qu'ils sont bien arrivés",
    desc: "Position en temps réel et zones de sécurité : une alerte dès qu'un enfant entre ou quitte un lieu défini.",
    points: [
      "Carte en direct + historique des déplacements",
      "Géofences (maison, école…) avec alertes entrée/sortie",
      "Bouton SOS côté enfant pour les urgences",
    ],
  },
  {
    img: "/show-screentime.jpg",
    eyebrow: "Équilibre & sommeil",
    title: "Du temps d'écran sain, des nuits paisibles",
    desc: "Des limites douces et une heure du coucher qui met les appareils en veille, sans bras de fer quotidien.",
    points: [
      "Limites quotidiennes par jour de la semaine",
      "Heure du coucher : mise en pause automatique la nuit",
      "Bonus de temps accordé d'un geste depuis le mobile",
    ],
  },
];
type ShowItem = (typeof showcase)[number];

const reveal: Variants = {
  hidden: { opacity: 0, y: 48, rotateX: -10 },
  show: (i: number = 0) => ({
    opacity: 1, y: 0, rotateX: 0,
    transition: { duration: 0.6, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] },
  }),
};

export function Landing() {
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.3 });

  // Hero parallax driven by scroll.
  const { scrollY } = useScroll();
  const heroImgY = useTransform(scrollY, [0, 700], [0, -90]);
  const heroImgScale = useTransform(scrollY, [0, 700], [1, 1.08]);
  const heroTextY = useTransform(scrollY, [0, 600], [0, 80]);
  const heroOpacity = useTransform(scrollY, [0, 500], [1, 0]);
  const mascotY = useTransform(scrollY, [0, 1200], [0, -160]);

  // Interactive 3D tilt on the hero card (mouse-follow, spring-smoothed).
  const tiltXRaw = useMotionValue(0);
  const tiltYRaw = useMotionValue(0);
  const tiltX = useSpring(tiltXRaw, { stiffness: 150, damping: 18, mass: 0.4 });
  const tiltY = useSpring(tiltYRaw, { stiffness: 150, damping: 18, mass: 0.4 });
  function onHeroMove(e: MouseEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    tiltYRaw.set(((e.clientX - r.left) / r.width - 0.5) * 14);
    tiltXRaw.set(((e.clientY - r.top) / r.height - 0.5) * -14);
  }
  function onHeroLeave() {
    tiltXRaw.set(0);
    tiltYRaw.set(0);
  }

  return (
    <div className="relative min-h-screen overflow-x-clip bg-[#0b1020] text-white">
      {/* scroll progress */}
      <motion.div style={{ scaleX: progress }} className="fixed inset-x-0 top-0 z-50 h-1 origin-left bg-gradient-to-r from-brand-400 via-fuchsia-400 to-amber-300" />

      {/* animated aurora background */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <motion.div
          className="absolute -left-40 -top-40 h-[40rem] w-[40rem] rounded-full bg-brand-600/30 blur-[120px]"
          animate={{ x: [0, 80, 0], y: [0, 60, 0], scale: [1, 1.15, 1] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute right-[-12rem] top-1/3 h-[36rem] w-[36rem] rounded-full bg-fuchsia-600/25 blur-[130px]"
          animate={{ x: [0, -70, 0], y: [0, 90, 0], scale: [1, 1.2, 1] }}
          transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute bottom-[-10rem] left-1/3 h-[34rem] w-[34rem] rounded-full bg-amber-500/15 blur-[130px]"
          animate={{ x: [0, 50, 0], y: [0, -60, 0], scale: [1, 1.1, 1] }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      {/* header */}
      <header className="sticky top-0 z-40 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2 text-xl font-extrabold">
            <Image src="/kidora-mark.svg" alt="" width={32} height={32} priority unoptimized />
            Kidora
          </div>
          <div className="flex items-center gap-2">
            <Link href="/login" className="rounded-lg px-4 py-2 text-sm font-semibold text-white/80 transition hover:text-white">Se connecter</Link>
            <Link href="/register" className="rounded-lg bg-white px-4 py-2 text-sm font-bold text-brand-700 transition hover:scale-105 hover:bg-white/90">Commencer</Link>
          </div>
        </div>
      </header>

      {/* hero */}
      <section ref={heroRef} className="relative mx-auto max-w-6xl px-6 pt-12 pb-24 text-center [perspective:1200px]">
        <motion.div style={{ y: heroTextY, opacity: heroOpacity }}>
          <motion.div
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
            className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-sm font-medium text-white/80"
          >
            🛡️ Contrôle parental puissant & bienveillant
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.08 }}
            className="mx-auto mt-6 max-w-3xl text-5xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl"
          >
            Gardez vos enfants{" "}
            <span className="bg-gradient-to-r from-brand-300 via-fuchsia-300 to-amber-200 bg-clip-text text-transparent">en sécurité</span>{" "}
            dans le monde numérique
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.16 }}
            className="mx-auto mt-6 max-w-2xl text-lg text-white/70"
          >
            Temps d'écran, filtrage web, contrôle des apps, localisation, vidéos &
            messages, et une <strong className="text-white">détection de risque par IA</strong> — sur tous
            les appareils de la famille, depuis un seul tableau de bord.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.24 }}
            className="mt-9 flex flex-wrap justify-center gap-3"
          >
            <Link href="/register" className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-fuchsia-500 px-7 py-3.5 text-base font-bold shadow-lg shadow-brand-900/40 transition hover:scale-105">
              Créer un compte gratuit <ArrowRight size={18} className="transition group-hover:translate-x-1" />
            </Link>
            <Link href="/login" className="inline-flex items-center rounded-xl border border-white/20 bg-white/5 px-7 py-3.5 text-base font-semibold transition hover:bg-white/10">
              J'ai déjà un compte
            </Link>
          </motion.div>
          <motion.p
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.7, delay: 0.32 }}
            className="mt-4 text-sm text-white/50"
          >
            Démo : <code className="rounded bg-white/10 px-1.5 py-0.5">demo@kidora.app</code> / <code className="rounded bg-white/10 px-1.5 py-0.5">kidora1234</code>
          </motion.p>
        </motion.div>

        {/* hero illustration — scroll parallax + interactive mouse-follow 3D tilt */}
        <motion.div
          style={{ y: heroImgY, scale: heroImgScale }}
          initial={{ opacity: 0, y: 60, rotateX: 18 }}
          animate={{ opacity: 1, y: 0, rotateX: 0 }}
          transition={{ duration: 1, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto mt-14 max-w-4xl [perspective:1400px]"
        >
          <motion.div
            onMouseMove={onHeroMove}
            onMouseLeave={onHeroLeave}
            style={{ rotateX: tiltX, rotateY: tiltY }}
            className="relative [transform-style:preserve-3d]"
          >
            <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-tr from-brand-500/40 to-fuchsia-500/30 blur-2xl" />
            <Image
              src="/hero.jpg" alt="Kidora — la mascotte veille sur les appareils de la famille"
              width={1280} height={714} priority
              className="w-full rounded-[1.6rem] border border-white/10 shadow-2xl shadow-black/50"
            />
            {/* floating glass chips at different depths → real 3D parallax on tilt */}
            <motion.div
              style={{ translateZ: 70 }}
              className="absolute -left-4 top-8 hidden rounded-2xl border border-white/15 bg-white/10 px-3.5 py-2 text-sm font-semibold shadow-xl backdrop-blur-md sm:flex sm:items-center sm:gap-2"
            >
              <ShieldCheck size={16} className="text-emerald-300" /> 0 menace aujourd'hui
            </motion.div>
            <motion.div
              style={{ translateZ: 110 }}
              className="absolute -right-3 bottom-10 hidden rounded-2xl border border-white/15 bg-white/10 px-3.5 py-2 text-sm font-semibold shadow-xl backdrop-blur-md sm:flex sm:items-center sm:gap-2"
            >
              <Clock size={16} className="text-amber-300" /> Coucher · 21:00
            </motion.div>
          </motion.div>
        </motion.div>

        {/* floating mascot */}
        <motion.div style={{ y: mascotY }} className="pointer-events-none absolute right-2 top-8 hidden sm:block lg:right-10">
          <motion.div animate={{ y: [0, -14, 0] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}>
            <Image src="/mascot.png" alt="" width={96} height={96} unoptimized className="drop-shadow-2xl" />
          </motion.div>
        </motion.div>
      </section>

      {/* features */}
      <section className="mx-auto max-w-6xl px-6 py-16 [perspective:1400px]">
        <SectionTitle
          eyebrow="Tout-en-un"
          title="Tout pour protéger, sans surveiller à l'excès"
          subtitle="Des outils complets, pensés pour respecter l'autonomie grandissante de l'enfant."
        />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              custom={i}
              variants={reveal}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: "-60px" }}
              whileHover={{ y: -8, rotateX: 6, rotateY: -6, transition: { duration: 0.25 } }}
              className="group relative rounded-2xl border border-white/10 bg-white/[0.04] p-6 [transform-style:preserve-3d] hover:bg-white/[0.07]"
            >
              <div className="flex items-center justify-between">
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-brand-500/30 to-fuchsia-500/20 text-brand-200 transition group-hover:from-brand-500 group-hover:to-fuchsia-500 group-hover:text-white">
                  <f.icon size={22} />
                </div>
                {f.badge && <span className="rounded-full bg-amber-400/20 px-2.5 py-1 text-xs font-bold text-amber-200">{f.badge}</span>}
              </div>
              <h3 className="mt-4 text-base font-bold">{f.title}</h3>
              <p className="mt-1.5 text-sm text-white/60">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* showcase — scrollytelling */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <SectionTitle
          eyebrow="En profondeur"
          title="Pensé pour le quotidien des familles"
          subtitle="Faites défiler : chaque pilier de Kidora, illustré et expliqué."
        />
        <div className="mt-6">
          {showcase.map((item, i) => (
            <ShowcaseRow key={item.title} item={item} flip={i % 2 === 1} />
          ))}
        </div>
      </section>

      {/* how it works */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <SectionTitle eyebrow="Simple" title="En 3 étapes" />
        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          {steps.map((s, i) => (
            <motion.div
              key={s.n}
              custom={i}
              variants={reveal}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: "-60px" }}
              className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-center"
            >
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-fuchsia-500 text-lg font-extrabold">{s.n}</div>
              <h3 className="mt-4 font-bold">{s.title}</h3>
              <p className="mt-1 text-sm text-white/60">{s.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* security band */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <motion.div
          variants={reveal} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-80px" }}
          className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-brand-600/20 to-fuchsia-600/10 p-8 sm:p-10"
        >
          <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:text-left">
            <ShieldCheck size={48} className="shrink-0 text-brand-200" />
            <div className="flex-1">
              <h3 className="text-xl font-bold">Sécurité de niveau pro, par conception</h3>
              <p className="mt-2 text-sm text-white/70">
                2FA/TOTP, mots de passe vérifiés contre les fuites (HIBP), protection anti-brute-force,
                Content-Security-Policy stricte, chiffrement des données sensibles au repos, et conformité RGPD
                (export & suppression). Vos données restent sur <strong className="text-white">votre</strong> serveur.
              </p>
            </div>
            <Link href="/register" className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-white px-6 py-3 font-bold text-brand-700 transition hover:scale-105">Commencer</Link>
          </div>
        </motion.div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-6 pb-24 pt-6">
        <motion.div
          variants={reveal} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-80px" }}
          className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-500 via-fuchsia-600 to-brand-700 px-8 py-16 text-center"
        >
          <motion.div animate={{ y: [0, -12, 0] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }} className="mx-auto mb-6 w-fit">
            <Image src="/mascot.png" alt="" width={84} height={84} unoptimized className="drop-shadow-xl" />
          </motion.div>
          <h2 className="text-3xl font-extrabold sm:text-4xl">Prêt à protéger votre famille ?</h2>
          <p className="mx-auto mt-3 max-w-xl text-white/85">Gratuit, sans carte bancaire. Quelques minutes pour tout configurer.</p>
          <Link href="/register" className="mt-8 inline-flex items-center gap-2 rounded-xl bg-white px-8 py-3.5 text-base font-bold text-brand-700 transition hover:scale-105">
            Créer mon compte <ArrowRight size={18} />
          </Link>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-white/80">
            <span>🪟 Windows</span><span>🤖 Android</span><span>📱 iPhone</span>
            <span className="inline-flex items-center gap-1"><Lock size={14} /> Chiffré · RGPD</span>
          </div>
        </motion.div>
      </section>

      <footer className="border-t border-white/10 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 text-sm text-white/50 sm:flex-row">
          <span>Kidora — Conçu pour les familles. 🛡️</span>
          <a href="https://github.com/Micka420-collab/kidora" className="inline-flex items-center gap-1.5 transition hover:text-white" target="_blank" rel="noreferrer">
            <ExternalLink size={15} /> Open source
          </a>
        </div>
      </footer>
    </div>
  );
}

function ShowcaseRow({ item, flip }: { item: ShowItem; flip: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [70, -70]);
  const rotateY = useTransform(scrollYProgress, [0, 1], flip ? [8, -8] : [-8, 8]);

  return (
    <div ref={ref} className="grid items-center gap-8 py-10 lg:grid-cols-2 lg:gap-14">
      <div className={`[perspective:1300px] ${flip ? "lg:order-2" : ""}`}>
        <motion.div style={{ y, rotateY }} className="relative [transform-style:preserve-3d]">
          <div className="absolute -inset-5 -z-10 rounded-[2rem] bg-gradient-to-tr from-brand-500/30 to-fuchsia-500/20 blur-2xl" />
          <Image
            src={item.img} alt={item.title} width={900} height={604}
            className="w-full rounded-2xl border border-white/10 shadow-2xl shadow-black/50"
          />
        </motion.div>
      </div>
      <motion.div
        variants={reveal} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-80px" }}
        className={flip ? "lg:order-1" : ""}
      >
        <div className="mb-3 w-fit rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-bold uppercase tracking-wider text-brand-200">{item.eyebrow}</div>
        <h3 className="text-2xl font-bold leading-tight sm:text-3xl">{item.title}</h3>
        <p className="mt-3 text-white/70">{item.desc}</p>
        <ul className="mt-5 space-y-2.5">
          {item.points.map((p) => (
            <li key={p} className="flex items-start gap-2.5 text-sm text-white/85">
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-500/25 text-brand-200"><Check size={13} strokeWidth={3} /></span>
              {p}
            </li>
          ))}
        </ul>
      </motion.div>
    </div>
  );
}

function SectionTitle({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle?: string }) {
  return (
    <motion.div
      variants={reveal} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }}
      className="text-center"
    >
      <div className="mx-auto mb-3 w-fit rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-bold uppercase tracking-wider text-brand-200">{eyebrow}</div>
      <h2 className="text-3xl font-bold sm:text-4xl">{title}</h2>
      {subtitle && <p className="mx-auto mt-3 max-w-2xl text-white/60">{subtitle}</p>}
    </motion.div>
  );
}
