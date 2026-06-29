import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "./prisma";

const COOKIE = "kidora_session";
const ALG = "HS256";

function secret(): Uint8Array {
  const s =
    process.env.AUTH_SECRET ||
    "dev-insecure-secret-change-me-in-production-kidora";
  return new TextEncoder().encode(s);
}

export type SessionPayload = { parentId: string; email: string };

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret());
}

export async function setSessionCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return { parentId: payload.parentId as string, email: payload.email as string };
  } catch {
    return null;
  }
}

/** Returns the authenticated parent or null. */
export async function getCurrentParent() {
  const session = await getSession();
  if (!session) return null;
  return prisma.parent.findUnique({ where: { id: session.parentId } });
}
