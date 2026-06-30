import { CloudOff, RefreshCw } from "lucide-react";

/**
 * Honest load-failure state for dashboard tabs. A failed fetch should show this
 * (with a retry) instead of falling through to an "empty" state, which would
 * misleadingly imply there is simply no data.
 */
export function ErrorCard({
  onRetry,
  title = "Connexion impossible",
  message = "Impossible de charger les données. Vérifiez votre connexion, puis réessayez.",
}: {
  onRetry?: () => void;
  title?: string;
  message?: string;
}) {
  return (
    <div role="alert" className="card grid place-items-center gap-3 py-16 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-red-50 text-red-500">
        <CloudOff size={24} />
      </span>
      <div>
        <p className="font-semibold">{title}</p>
        <p className="mx-auto mt-1 max-w-xs text-sm text-muted">{message}</p>
      </div>
      {onRetry && (
        <button className="btn btn-outline" onClick={onRetry}>
          <RefreshCw size={16} /> Réessayer
        </button>
      )}
    </div>
  );
}
