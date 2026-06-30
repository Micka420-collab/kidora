import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireParent, requireOwnedChild, withGuard } from "@/lib/guard";
import { toCsv, csvWithBom, type CsvColumn } from "@/lib/csv";

type Ctx = { params: Promise<{ childId: string }> };

const MAX_ROWS = 1000;

// GET /api/children/:id/export?type=videos|messages|web
// Streams the child's activity as a CSV download (UTF-8 BOM for Excel).
export async function GET(req: NextRequest, ctx: Ctx) {
  return withGuard(async () => {
    const parent = await requireParent();
    const { childId } = await ctx.params;
    await requireOwnedChild(parent.id, childId);

    const type = (new URL(req.url).searchParams.get("type") ?? "videos").toLowerCase();

    let csv: string;
    let slug: string;

    if (type === "messages") {
      const rows = await prisma.message.findMany({ where: { childId }, orderBy: { ts: "desc" }, take: MAX_ROWS });
      const cols: CsvColumn<(typeof rows)[number]>[] = [
        { key: "ts", header: "Date", value: (r) => r.ts },
        { key: "direction", header: "Sens", value: (r) => (r.direction === "out" ? "envoyé" : "reçu") },
        { key: "app", header: "App", value: (r) => r.app },
        { key: "contact", header: "Contact", value: (r) => r.contact },
        { key: "body", header: "Message", value: (r) => r.body },
      ];
      csv = toCsv(rows, cols);
      slug = "messages";
    } else if (type === "web") {
      const rows = await prisma.webVisit.findMany({ where: { childId }, orderBy: { ts: "desc" }, take: MAX_ROWS });
      const cols: CsvColumn<(typeof rows)[number]>[] = [
        { key: "ts", header: "Date", value: (r) => r.ts },
        { key: "domain", header: "Domaine", value: (r) => r.domain },
        { key: "url", header: "URL", value: (r) => r.url },
        { key: "category", header: "Catégorie", value: (r) => r.category },
        { key: "blocked", header: "Bloqué", value: (r) => (r.blocked ? "oui" : "non") },
      ];
      csv = toCsv(rows, cols);
      slug = "navigation-web";
    } else {
      const rows = await prisma.watchedVideo.findMany({ where: { childId }, orderBy: { ts: "desc" }, take: MAX_ROWS });
      const cols: CsvColumn<(typeof rows)[number]>[] = [
        { key: "ts", header: "Date", value: (r) => r.ts },
        { key: "title", header: "Titre", value: (r) => r.title },
        { key: "channel", header: "Chaîne", value: (r) => r.channel },
        { key: "platform", header: "Appareil", value: (r) => (r.platform === "phone" ? "Téléphone" : "PC") },
        { key: "url", header: "URL", value: (r) => r.url },
      ];
      csv = toCsv(rows, cols);
      slug = "videos";
    }

    return new Response(csvWithBom(csv), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="kidora-${slug}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  });
}
