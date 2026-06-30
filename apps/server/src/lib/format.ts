export function formatDuration(seconds: number): string {
  if (!seconds || seconds < 0) return "0 min";
  // Round to whole minutes first, then split — rounding the minute part on its
  // own could yield 60 (e.g. 7199s → "1 h 60 min", 3599s → "60 min").
  const totalMin = Math.round(seconds / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h && m) return `${h} h ${m} min`;
  if (h) return `${h} h`;
  return `${m} min`;
}

export function formatMinutes(minutes: number): string {
  return formatDuration(minutes * 60);
}

export function relativeTime(iso: string | Date | null): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "à l'instant";
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`;
  if (diff < 604800) return `il y a ${Math.floor(diff / 86400)} j`;
  return d.toLocaleDateString("fr-FR");
}

export function formatDate(iso: string | Date | null): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const WEEKDAYS: { key: string; label: string }[] = [
  { key: "mon", label: "Lun" },
  { key: "tue", label: "Mar" },
  { key: "wed", label: "Mer" },
  { key: "thu", label: "Jeu" },
  { key: "fri", label: "Ven" },
  { key: "sat", label: "Sam" },
  { key: "sun", label: "Dim" },
];
