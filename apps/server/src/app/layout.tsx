import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { cookies } from "next/headers";
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
  const theme = (await cookies()).get("kidora_theme")?.value;
  const dark = theme === "dark";
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} h-full antialiased${dark ? " dark" : ""}`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
