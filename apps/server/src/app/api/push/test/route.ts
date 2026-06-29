import { json } from "@/lib/http";
import { requireParent, withGuard } from "@/lib/guard";
import { sendPushToParent } from "@/lib/push";

// POST /api/push/test — send a test notification to the current parent's devices
export async function POST() {
  return withGuard(async () => {
    const parent = await requireParent();
    const sent = await sendPushToParent(parent.id, {
      title: "Kidora",
      body: "Les notifications sont activées ✅",
      url: "/dashboard",
    });
    return json({ ok: true, sent });
  });
}
