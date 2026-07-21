import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireParent, requireOwnedChild, withGuard } from "@/lib/guard";
import { apiError } from "@/lib/http";
import { makeZip, type ZipEntry } from "@/lib/zip";
import { AGENT_BUNDLE } from "@/lib/agent-bundle.generated";
import { randomToken } from "@/lib/password";
import { isEnrollTokenExpired, newEnrollTokenExpiry } from "@/lib/enroll-token";

type Ctx = { params: Promise<{ childId: string }> };

const README = `Kidora — installation de l'agent (PC de l'enfant)

1. Decompressez ce dossier ENTIER quelque part sur le PC de l'enfant.
2. Double-cliquez "Installer-Kidora.cmd".
3. C'est tout : l'installateur fait le reste (il installe Node.js si besoin,
   se configure tout seul grace au fichier kidora-config.txt inclus, et
   demarre la surveillance). Aucun code a taper.

Pour desinstaller plus tard : ouvrez PowerShell en administrateur dans ce
dossier et lancez :  powershell -ExecutionPolicy Bypass -File install-agent.ps1 -Uninstall
`;

// GET /api/children/:id/agent-package?deviceId=<id>
// Streams a ready-to-run Windows agent ZIP with the enroll token + server URL
// pre-embedded (kidora-config.txt), so the parent double-clicks and types nothing.
export async function GET(req: NextRequest, ctx: Ctx) {
  return withGuard(async () => {
    const parent = await requireParent();
    const { childId } = await ctx.params;
    await requireOwnedChild(parent.id, childId);

    const deviceId = new URL(req.url).searchParams.get("deviceId");
    if (!deviceId) return apiError("Paramètre deviceId requis", 422);

    let device = await prisma.device.findFirst({
      where: { id: deviceId, childId },
      select: { id: true, enrollToken: true, enrolled: true, enrollTokenExpiresAt: true },
    });
    if (!device) return apiError("Appareil introuvable", 404);

    // Expired unused token: this authenticated parent action re-arms enrollment
    // with a FRESH token (not a revived one — an old leaked ZIP must stay dead).
    // The ZIP built below embeds the new token, so the download always works.
    if (isEnrollTokenExpired(device)) {
      device = await prisma.device.update({
        where: { id: device.id },
        data: { enrollToken: randomToken(24), enrollTokenExpiresAt: newEnrollTokenExpiry() },
        select: { id: true, enrollToken: true, enrolled: true, enrollTokenExpiresAt: true },
      });
    }

    // The origin the parent is using is exactly what the agent should call home to.
    const origin = new URL(req.url).origin;
    const config = `# Configuration Kidora (genere par le tableau de bord) — ne pas partager.\r\nSERVER=${origin}\r\nTOKEN=${device.enrollToken}\r\n`;

    const entries: ZipEntry[] = [
      { name: "kidora-config.txt", data: config },
      { name: "Lisez-moi.txt", data: README },
    ];
    for (const [name, b64] of Object.entries(AGENT_BUNDLE)) {
      entries.push({ name, data: Buffer.from(b64, "base64") });
    }

    const zip = makeZip(entries);
    // Copy into a plain Uint8Array — a clean BodyInit (Buffer's typed .buffer is
    // a union with SharedArrayBuffer that Response's types reject).
    const body = new Uint8Array(zip);
    return new Response(body, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="kidora-agent.zip"`,
        "Content-Length": String(body.byteLength),
        "Cache-Control": "no-store",
      },
    });
  });
}
