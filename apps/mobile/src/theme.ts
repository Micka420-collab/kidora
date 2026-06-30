import { useColorScheme } from "react-native";

// ── Palette ──────────────────────────────────────────────────────────────
const brand = {
  primary: "#6366f1",
  primaryDark: "#4f46e5",
  primaryDeep: "#4338ca",
  primarySoft: "#818cf8",
};

const light = {
  ...brand,
  bg: "#f4f5fb",
  surface: "#ffffff",
  surfaceAlt: "#f1f5f9",
  card: "#ffffff",
  border: "#e7e9f3",
  text: "#0f172a",
  textMuted: "#64748b",
  textFaint: "#94a3b8",
  tint: "#eef2ff", // indigo-50
  onPrimary: "#ffffff",
  success: "#10b981",
  successSoft: "#d1fae5",
  warn: "#f59e0b",
  warnSoft: "#fef3c7",
  danger: "#ef4444",
  dangerSoft: "#fee2e2",
  info: "#3b82f6",
  shadow: "#1e293b",
};

const dark: typeof light = {
  ...brand,
  primary: "#818cf8",
  bg: "#0a0e1a",
  surface: "#141a2b",
  surfaceAlt: "#1c2438",
  card: "#141a2b",
  border: "#27314a",
  text: "#f1f5f9",
  textMuted: "#94a3b8",
  textFaint: "#64748b",
  tint: "#1e293b",
  onPrimary: "#ffffff",
  success: "#34d399",
  successSoft: "#0f2e25",
  warn: "#fbbf24",
  warnSoft: "#3a2e10",
  danger: "#f87171",
  dangerSoft: "#3a1717",
  info: "#60a5fa",
  shadow: "#000000",
};

export type Palette = typeof light;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, xxxl: 40 };
export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 };
export const brandGradient = ["#818cf8", "#6366f1", "#4338ca"] as const;

export function useTheme() {
  const scheme = useColorScheme();
  const isDark = scheme === "dark";
  const c = isDark ? dark : light;
  return {
    c,
    isDark,
    space,
    radius,
    gradient: brandGradient,
    shadow: (elevation = 1) => ({
      shadowColor: c.shadow,
      shadowOpacity: isDark ? 0.4 : 0.08 + elevation * 0.02,
      shadowRadius: 6 + elevation * 4,
      shadowOffset: { width: 0, height: 2 + elevation * 2 },
      elevation: elevation * 2,
    }),
  };
}

// ── Formatting helpers ──────────────────────────────────────────────────
export function formatDuration(seconds: number): string {
  if (!seconds || seconds < 0) return "0 min";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h && m) return `${h} h ${m}`;
  if (h) return `${h} h`;
  return `${m} min`;
}

export function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "à l'instant";
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`;
  return `il y a ${Math.floor(diff / 86400)} j`;
}

/** YouTube thumbnail URL from a watch/share url, or null. */
export function youtubeThumb(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/(?:v=|youtu\.be\/|\/shorts\/|\/embed\/)([A-Za-z0-9_-]{11})/);
  return m ? `https://img.youtube.com/vi/${m[1]}/mqdefault.jpg` : null;
}

// Category → label + icon (Ionicons name) + accent color.
export function categoryMeta(cat: string | null | undefined): { label: string; icon: string; color: string } {
  const map: Record<string, { label: string; icon: string; color: string }> = {
    social: { label: "Réseaux sociaux", icon: "chatbubbles", color: "#ec4899" },
    video: { label: "Vidéo", icon: "play-circle", color: "#ef4444" },
    streaming: { label: "Streaming", icon: "film", color: "#f43f5e" },
    music: { label: "Musique", icon: "musical-notes", color: "#22c55e" },
    games: { label: "Jeux", icon: "game-controller", color: "#8b5cf6" },
    communication: { label: "Communication", icon: "mail", color: "#0ea5e9" },
    education: { label: "Éducation", icon: "school", color: "#14b8a6" },
    browser: { label: "Navigateur", icon: "globe", color: "#3b82f6" },
    productivity: { label: "Productivité", icon: "briefcase", color: "#64748b" },
    developer: { label: "Développement", icon: "code-slash", color: "#475569" },
    system: { label: "Système", icon: "settings", color: "#94a3b8" },
  };
  return map[cat ?? ""] ?? { label: cat ?? "Autre", icon: "apps", color: "#6366f1" };
}

// Alert type → icon + tone.
export function alertMeta(type: string): { icon: string; tone: "danger" | "warn" | "info" } {
  if (type === "sos" || type === "panic") return { icon: "alert-circle", tone: "danger" };
  if (type.includes("risk")) return { icon: "shield-half", tone: "danger" };
  if (type.includes("geofence")) return { icon: "location", tone: "warn" };
  if (type.includes("keyword")) return { icon: "search", tone: "warn" };
  if (type === "device_offline") return { icon: "cloud-offline", tone: "warn" };
  if (type === "time_request") return { icon: "hourglass", tone: "info" };
  if (type.includes("limit")) return { icon: "time", tone: "info" };
  return { icon: "notifications", tone: "info" };
}
