import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "./prisma";

const COOKIE = "kidora_session";
const ALG = "HS256";

const DEV_SECRET = "dev-insecure-secret-change-me-in-production-kidora";

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET || DEV_SECRET;
  if (process.env.NODE_ENV === "production" && s === DEV_SECRET) {
    throw new Error(
      "AUTH_SECRET must be set to a strong value in production (the dev fallback is forbidden).",
    );
  }
  return new TextEncoder().encode(s);
}

export type SessionPayload = { parentId: string; email: string; tokenVersion?: number };

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload, tokenVersion: payload.tokenVersion ?? 0 })
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

/**
 * Whether a session token is still valid for the account's current version.
 * Tokens issued before tokenVersion existed carry no version → treated as 0, so
 * they keep working until the account's version is first bumped (no mass logout
 * on deploy). Pure & unit-tested.
 */
export function sessionVersionValid(sessionVersion: number | undefined, parentVersion: number): boolean {
  return (sessionVersion ?? 0) === parentVersion;
}

export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return {
      parentId: payload.parentId as string,
      email: payload.email as string,
      tokenVersion: typeof payload.tokenVersion === "number" ? payload.tokenVersion : 0,
    };
  } catch {
    return null;
  }
}

/** Returns the authenticated parent or null (also rejects revoked sessions). */
export async function getCurrentParent() {
  const session = await getSession();
  if (!session) return null;
  const parent = await prisma.parent.findUnique({ where: { id: session.parentId } });
  if (!parent) return null;
  // Session was invalidated (password reset/change) → treat as logged out.
  if (!sessionVersionValid(session.tokenVersion, parent.tokenVersion)) return null;
  return parent;
}
