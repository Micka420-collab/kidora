import type { Metadata } from "next";
import { ForgotForm } from "../forgot-form";

export const metadata: Metadata = {
  title: "Mot de passe oublié · Kidora",
  robots: { index: false },
};

export default function ForgotPage() {
  return <ForgotForm />;
}
