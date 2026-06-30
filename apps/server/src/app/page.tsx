import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Landing } from "@/components/landing";

export default async function Home() {
  const session = await getSession();
  if (session) redirect("/dashboard");
  return <Landing />;
}
