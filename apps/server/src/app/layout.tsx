import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { cookies } from "next/headers";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Kidora — Contrôle parental",
  description:
    "Kidora — protégez vos enfants en ligne. Temps d'écran, filtrage web, apps, localisation. Windows, Android, iPhone.",
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
      className={`${geistSans.variable} h-full antialiased${dark ? " dark" : ""}`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
