import { prisma } from "./prisma";

/** Record a sensitive account action. Never throws (best-effort). */
export async function audit(
  parentId: string,
  action: string,
  detail?: string,
  ip?: string,
): Promise<void> {
  try {
    await prisma.auditLog.create({ data: { parentId, action, detail, ip } });
  } catch {
    /* logging must not break the request */
  }
}
