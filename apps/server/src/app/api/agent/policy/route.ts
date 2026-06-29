import { NextRequest } from "next/server";
import { json, apiError, getDeviceFromRequest } from "@/lib/http";
import { buildPolicy } from "@/lib/policy";

// GET /api/agent/policy — device polls its current policy (Bearer enrollToken)
export async function GET(req: NextRequest) {
  const device = await getDeviceFromRequest(req);
  if (!device) return apiError("Appareil non authentifié", 401);
  const policy = await buildPolicy(device.childId);
  return json({ policy });
}
