import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { siteUrl } from "@/lib/site";
import { audit } from "@/lib/audit";

// GET /api/auth/verify-email?token=… — confirm an email address, then redirect.
// Two cases share the token: verifying the CURRENT address (registration /
// resend), and confirming a pending email CHANGE — only then does `email`
// actually switch (double opt-in, see /api/account/email).
export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  let ok = false;
  if (token) {
    const parent = await prisma.parent.findFirst({
      where: { emailVerifyToken: token, emailVerifyTokenExpiry: { gt: new Date() } },
      select: { id: true, pendingEmail: true },
    });
    if (parent && parent.pendingEmail) {
      try {
        await prisma.parent.update({
          where: { id: parent.id },
          data: {
            email: parent.pendingEmail,
            emailVerified: true,
            pendingEmail: null,
            emailVerifyToken: null,
            emailVerifyTokenExpiry: null,
          },
        });
        await audit(parent.id, "account.email_change", parent.pendingEmail);
        ok = true;
      } catch {
        // The address was registered by someone else between request and
        // confirmation (unique constraint). Drop the pending change so the
        // account returns to a stable state on its still-active address.
        await prisma.parent.update({
          where: { id: parent.id },
          data: { pendingEmail: null, emailVerifyToken: null, emailVerifyTokenExpiry: null },
        });
      }
    } else if (parent) {
      await prisma.parent.update({
        where: { id: parent.id },
        data: { emailVerified: true, emailVerifyToken: null, emailVerifyTokenExpiry: null },
      });
      ok = true;
    }
  }
  return NextResponse.redirect(`${siteUrl()}/login?verified=${ok ? "1" : "0"}`);
}
