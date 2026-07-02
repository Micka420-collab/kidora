import { json } from "@/lib/http";
import { AGENT_BUNDLE_VERSION } from "@/lib/agent-bundle.generated";

export const dynamic = "force-dynamic";

// GET /api/agent/version — the agent version this server can hand out for
// self-update. Public and tiny.
export async function GET() {
  return json({ version: AGENT_BUNDLE_VERSION });
}
