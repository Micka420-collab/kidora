import Link from "next/link";

// Branded 404 page.
export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center p-6">
      <div className="text-center">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl bg-brand-600 text-2xl font-extrabold text-white">
          K
        </div>
        <div className="text-6xl font-extrabold text-brand-600">404</div>
        <h1 className="mt-2 text-xl font-bold">Page introuvable</h1>
        <p className="mt-1 text-sm text-muted">Cette page n&apos;existe pas ou a été déplacée.</p>
        <Link href="/dashboard" className="btn btn-primary mx-auto mt-5">
          Retour au tableau de bord
        </Link>
      </div>
    </div>
  );
}
