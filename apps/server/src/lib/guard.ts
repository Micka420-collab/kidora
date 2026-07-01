import { getCurrentParent } from "./auth";
import { prisma } from "./prisma";

/** Resolve the current parent or throw a 401 Response. */
export async function requireParent() {
  const parent = await getCurrentParent();
  if (!parent) {
    throw Response.json({ error: "Non authentifié" }, { status: 401 });
  }
  return parent;
}

/** Prisma `where` matching every child a parent may access (owner or co-guardian). */
export function accessibleChildWhere(parentId: string) {
  return {
    OR: [{ parentId }, { guardianships: { some: { parentId } } }],
  };
}

/**
 * Prisma `where` matching every alert a parent may SEE — any alert on a child
 * they can access (owner or co-guardian), regardless of which parent the alert
 * row was originally addressed to. Without this a co-guardian's alert feed is
 * empty even though they can access the child and issue commands.
 */
export function accessibleAlertWhere(parentId: string) {
  return { child: accessibleChildWhere(parentId) };
}

/** Ensure a parent can access a child (as owner or co-guardian), else 403/404. */
export async function requireOwnedChild(parentId: string, childId: string) {
  const child = await prisma.child.findUnique({ where: { id: childId } });
  if (!child) throw Response.json({ error: "Enfant introuvable" }, { status: 404 });
  if (child.parentId === parentId) return child;
  const guardian = await prisma.guardianship.findUnique({
    where: { parentId_childId: { parentId, childId } },
  });
  if (!guardian) throw Response.json({ error: "Accès refusé" }, { status: 403 });
  return child;
}

/** Wrap a handler so thrown Responses are returned directly. */
export async function withGuard(
  fn: () => Promise<Response>,
): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(
      JSON.stringify({
        level: "error",
        msg: "unhandled_api_error",
        error: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack : undefined,
        ts: new Date().toISOString(),
      }),
    );
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
