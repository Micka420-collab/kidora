import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { signSession, setSessionCookie } from "@/lib/auth";
import { apiError, json, readJson } from "@/lib/http";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const body = await readJson(req);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return apiError("Données invalides", 422);

  const { email, password } = parsed.data;
  const parent = await prisma.parent.findUnique({
    where: { email: email.toLowerCase() },
  });
  if (!parent) return apiError("Email ou mot de passe incorrect", 401);

  const ok = await verifyPassword(password, parent.passwordHash);
  if (!ok) return apiError("Email ou mot de passe incorrect", 401);

  const token = await signSession({ parentId: parent.id, email: parent.email });
  await setSessionCookie(token);

  return json({ id: parent.id, name: parent.name, email: parent.email });
}
