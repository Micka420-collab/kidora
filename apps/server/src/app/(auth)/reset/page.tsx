import type { Metadata } from "next";
import { ResetForm } from "../reset-form";

export const metadata: Metadata = {
  title: "Réinitialiser le mot de passe · Kidora",
  robots: { index: false },
};

export default function ResetPage() {
  return <ResetForm />;
}
