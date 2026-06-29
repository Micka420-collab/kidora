import { getCurrentParent } from "@/lib/auth";
import { apiError, json } from "@/lib/http";

export async function GET() {
  const parent = await getCurrentParent();
  if (!parent) return apiError("Non authentifié", 401);
  return json({ id: parent.id, name: parent.name, email: parent.email });
}
