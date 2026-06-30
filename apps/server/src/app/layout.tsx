import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { cookies } from "next/headers";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

const description =
  "Kidora — protégez vos enfants en ligne. Temps d'écran, filtrage web, apps, localisation et détection de risque par IA. Windows, Android, iPhone.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Kidora — Contrôle parental",
  description,
  applicationName: "Kidora",
  keywords: ["contrôle parental", "temps d'écran", "filtrage web", "localisation enfant", "sécurité en ligne", "Kidora"],
  openGraph: {
    type: "website",
    locale: "fr_FR",
    url: "/",
    siteName: "Kidora",
    title: "Kidora — Contrôle parental bienveillant",
    description,
    images: [{ url: "/hero.jpg", width: 1280, height: 714, alt: "Kidora — la mascotte veille sur les appareils de la famille" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Kidora — Contrôle parental bienveillant",
    description,
    images: ["/hero.jpg"],
  },
};

export const viewport: Viewport = {
  themeColor: "#0b1020",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const jar = await cookies();
  const dark = jar.get("kidora_theme")?.value === "dark";
  const localeCookie = jar.get(LOCALE_COOKIE)?.value;
  const lang = isLocale(localeCookie) ? localeCookie : "fr";
  return (
    <html
      lang={lang}
      className={`${geistSans.variable} h-full antialiased motion-safe:scroll-smooth${dark ? " dark" : ""}`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
