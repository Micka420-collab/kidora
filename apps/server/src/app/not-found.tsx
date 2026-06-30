import Link from "next/link";
import Image from "next/image";

// Branded 404, matching the dark marketing aesthetic.
export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center overflow-hidden bg-[#0b1020] p-6 text-white">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -left-32 -top-32 h-[32rem] w-[32rem] rounded-full bg-brand-600/25 blur-[120px]" />
        <div className="absolute -bottom-32 -right-32 h-[30rem] w-[30rem] rounded-full bg-fuchsia-600/20 blur-[120px]" />
      </div>
      <div className="text-center">
        <Image src="/mascot.png" alt="" width={96} height={96} unoptimized className="mx-auto drop-shadow-2xl" />
        <div className="mt-4 bg-gradient-to-r from-brand-300 via-fuchsia-300 to-amber-200 bg-clip-text text-7xl font-extrabold tracking-tight text-transparent">404</div>
        <h1 className="mt-2 text-xl font-bold">Page introuvable</h1>
        <p className="mt-2 text-sm text-white/60">Cette page n&apos;existe pas ou a été déplacée.</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link href="/" className="rounded-xl bg-white px-6 py-3 font-bold text-brand-700 transition hover:scale-105">Retour à l&apos;accueil</Link>
          <Link href="/login" className="rounded-xl border border-white/20 bg-white/5 px-6 py-3 font-semibold transition hover:bg-white/10">Se connecter</Link>
        </div>
      </div>
    </div>
  );
}
