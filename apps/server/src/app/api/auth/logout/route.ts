import { prisma } from "@/lib/prisma";
import { clearSessionCookie, getSession } from "@/lib/auth";
import { json } from "@/lib/http";

// POST /api/auth/logout — clear the cookie AND revoke the session server-side.
// The JWT is stateless and issued for 30 days (and handed to mobile clients in
// cleartext), so clearing the cookie alone left a leaked token fully valid until
// expiry. Bumping tokenVersion invalidates every outstanding token for this
// account (log out on all devices) — the only real revocation for a stateless
// JWT, and consistent with password-change/reset which already do this.
export async function POST() {
  const session = await getSession();
  if (session) {
    await prisma.parent
      .update({ where: { id: session.parentId }, data: { tokenVersion: { increment: 1 } } })
      .catch(() => {}); // already-invalid session → nothing to revoke
  }
  await clearSessionCookie();
  return json({ ok: true });
}
