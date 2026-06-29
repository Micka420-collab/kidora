"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";

// Route-segment error boundary (App Router).
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Kidora error boundary:", error);
  }, [error]);

  return (
    <div className="grid min-h-[60vh] place-items-center p-6">
      <div className="card max-w-md p-8 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-amber-50 text-amber-500">
          <AlertTriangle size={24} />
        </div>
        <h1 className="mt-4 text-xl font-bold">Une erreur est survenue</h1>
        <p className="mt-2 text-sm text-muted">
          Quelque chose s&apos;est mal passé. Vous pouvez réessayer ; si le problème persiste, rechargez la page.
        </p>
        <button onClick={reset} className="btn btn-primary mx-auto mt-5">
          <RotateCw size={16} /> Réessayer
        </button>
      </div>
    </div>
  );
}
