import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kidora — Contrôle parental",
    short_name: "Kidora",
    description:
      "Protégez vos enfants en ligne : temps d'écran, filtrage web, apps, localisation.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f6f7fb",
    theme_color: "#4f46e5",
    lang: "fr",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
