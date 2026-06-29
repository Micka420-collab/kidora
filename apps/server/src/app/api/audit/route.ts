import { prisma } from "@/lib/prisma";
import { json } from "@/lib/http";
import { requireParent, withGuard } from "@/lib/guard";

export async function GET() {
  return withGuard(async () => {
    const parent = await requireParent();
    const logs = await prisma.auditLog.findMany({
      where: { parentId: parent.id },
      orderBy: { ts: "desc" },
      take: 50,
    });
    return json({ logs });
  });
}
