import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { siteUrl } from "@/lib/site";

// GET /api/auth/verify-email?token=… — confirm an email address, then redirect.
export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  let ok = false;
  if (token) {
    const parent = await prisma.parent.findFirst({
      where: { emailVerifyToken: token, emailVerifyTokenExpiry: { gt: new Date() } },
      select: { id: true },
    });
    if (parent) {
      await prisma.parent.update({
        where: { id: parent.id },
        data: { emailVerified: true, emailVerifyToken: null, emailVerifyTokenExpiry: null },
      });
      ok = true;
    }
  }
  return NextResponse.redirect(`${siteUrl()}/login?verified=${ok ? "1" : "0"}`);
}
