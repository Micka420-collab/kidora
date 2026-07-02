import { headers } from "next/headers";
import { json } from "@/lib/http";
import { collectDiagnostics } from "@/lib/diagnostics";

export const dynamic = "force-dynamic";

// GET /api/status — machine-readable install diagnostics (no secret values).
// Complements /api/health with a configuration-posture checklist for self-hosters.
export async function GET() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const report = await collectDiagnostics({ isHttps: proto === "https", host });
  return json(report, { status: report.overall === "fail" ? 503 : 200 });
}
