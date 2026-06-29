import { NextRequest } from "next/server";
import { prisma } from "./prisma";

export function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

export function apiError(message: string, status = 400): Response {
  return Response.json({ error: message }, { status });
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
