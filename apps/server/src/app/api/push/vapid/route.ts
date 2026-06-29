import { json } from "@/lib/http";
import { getVapidPublicKey } from "@/lib/push";

export async function GET() {
  return json({ publicKey: getVapidPublicKey() });
}
