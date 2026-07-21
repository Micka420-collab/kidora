import { NextRequest } from "next/server";
import { prisma } from "./prisma";
import { isEnrollTokenExpired } from "./enroll-token";

export function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

export function apiError(message: string, status = 400): Response {
  return Response.json({ error: message }, { status });
}

/**
 * Safely parse a `limit`/`take` query value into a clamped integer. Guards
 * against missing, non-numeric, negative and oversized values (an unguarded
 * `take: NaN`/negative would crash the Prisma query).
 */
export function clampLimit(
  raw: string | null | undefined,
  def: number,
  max: number,
  min = 1,
): number {
  if (raw == null || raw === "") return def;
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n)) return def;
  return Math.min(Math.max(n, min), max);
}

/** Authenticate a device agent via Bearer enrollToken. */
export async function getDeviceFromRequest(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const headerToken = req.headers.get("x-device-token") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : headerToken.trim();
  if (!token) return null;
  const device = await prisma.device.findUnique({
    where: { enrollToken: token },
    include: { child: true },
  });
  // A never-enrolled token past its deadline is dead everywhere, not just on
  // /enroll — otherwise a leaked unused token could still reach sync directly.
  if (device && isEnrollTokenExpired(device)) return null;
  return device;
}

export async function readJson<T = Record<string, unknown>>(
  req: NextRequest,
): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}
