import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Landing } from "@/components/landing";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Kidora",
  applicationCategory: "SecurityApplication",
  operatingSystem: "Windows, Android, iOS",
  description:
    "Contrôle parental bienveillant : temps d'écran, filtrage web, contrôle des apps, localisation et détection de risque par IA, depuis un tableau de bord unique.",
  offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
  inLanguage: "fr",
};

export default async function Home() {
  const session = await getSession();
  if (session) redirect("/dashboard");
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Landing />
    </>
  );
}
