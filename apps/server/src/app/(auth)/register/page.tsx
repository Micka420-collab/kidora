import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = {
  title: "Inscription · Kidora",
  description: "Créez votre compte Kidora gratuitement et protégez vos enfants en quelques minutes.",
};

export default async function RegisterPage() {
  if (await getSession()) redirect("/dashboard");
  return <AuthForm mode="register" />;
}
