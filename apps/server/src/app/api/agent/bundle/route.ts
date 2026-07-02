import { NextRequest } from "next/server";
import { json, apiError, getDeviceFromRequest } from "@/lib/http";
import { AGENT_BUNDLE, AGENT_BUNDLE_VERSION } from "@/lib/agent-bundle.generated";
import { signAgentBundle } from "@/lib/policy-sign";

export const dynamic = "force-dynamic";

// GET /api/agent/bundle — the signed agent source for self-update. Device-auth'd
// (only enrolled agents pull updates). The agent verifies the Ed25519 signature
// and the content hash before staging anything (lib/updater.verifyBundle).
export async function GET(req: NextRequest) {
  const device = await getDeviceFromRequest(req);
  if (!device) return apiError("Appareil non authentifié", 401);

  const { signed, sig } = signAgentBundle(AGENT_BUNDLE, AGENT_BUNDLE_VERSION);
  return json({ version: AGENT_BUNDLE_VERSION, signed, sig, files: AGENT_BUNDLE });
}
