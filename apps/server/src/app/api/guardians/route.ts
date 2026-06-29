import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { json, readJson, apiError } from "@/lib/http";
import { requireParent, withGuard } from "@/lib/guard";
import { audit } from "@/lib/audit";

// GET — co-parents who can access MY owned children
export async function GET() {
  return withGuard(async () => {
    const parent = await requireParent();
    const myChildren = await prisma.child.findMany({
      where: { parentId: parent.id },
      select: { id: true },
    });
    const ids = myChildren.map((c) => c.id);
    const links = await prisma.guardianship.findMany({
      where: { childId: { in: ids } },
      include: { parent: { select: { id: true, name: true, email: true } }, child: { select: { name: true } } },
    });
    // group by guardian parent
    const byParent = new Map<string, { id: string; name: string; email: string; children: string[] }>();
    for (const l of links) {
      const g = byParent.get(l.parentId) ?? { id: l.parent.id, name: l.parent.name, email: l.parent.email, children: [] };
      g.children.push(l.child.name);
      byParent.set(l.parentId, g);
    }
    return json({ guardians: [...byParent.values()] });
  });
}

const addSchema = z.object({ email: z.string().email() });

// POST — grant a co-parent access to all my owned children
export async function POST(req: NextRequest) {
  return withGuard(async () => {
    const parent = await requireParent();
    const parsed = addSchema.safeParse(await readJson(req));
    if (!parsed.success) return apiError("Email invalide", 422);
    const email = parsed.data.email.toLowerCase();
    if (email === parent.email) return apiError("C'est votre propre compte", 400);

    const coParent = await prisma.parent.findUnique({ where: { email } });
    if (!coParent) return apiError("Aucun compte Kidora avec cet email. Demandez-lui de s'inscrire d'abord.", 404);

    const myChildren = await prisma.child.findMany({
      where: { parentId: parent.id },
      select: { id: true },
    });
    if (myChildren.length === 0) return apiError("Vous n'avez aucun enfant à partager", 400);

    for (const c of myChildren) {
      await prisma.guardianship.upsert({
        where: { parentId_childId: { parentId: coParent.id, childId: c.id } },
        create: { parentId: coParent.id, childId: c.id },
        update: {},
      });
    }
    await audit(parent.id, "guardian.add", email);
    return json({ ok: true, added: coParent.email, children: myChildren.length });
  });
}

// DELETE ?parentId= — revoke a co-parent's access to my owned children
export async function DELETE(req: NextRequest) {
  return withGuard(async () => {
    const parent = await requireParent();
    const coParentId = new URL(req.url).searchParams.get("parentId");
    if (!coParentId) return apiError("parentId requis", 400);
    const myChildren = await prisma.child.findMany({
      where: { parentId: parent.id },
      select: { id: true },
    });
    await prisma.guardianship.deleteMany({
      where: { parentId: coParentId, childId: { in: myChildren.map((c) => c.id) } },
    });
    await audit(parent.id, "guardian.remove", coParentId);
    return json({ ok: true });
  });
}
