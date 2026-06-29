import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { signSession, setSessionCookie } from "@/lib/auth";
import { apiError, json, readJson } from "@/lib/http";

const schema = z.object({
  name: z.string().min(1).max(80),
  email: z.string().email(),
  password: z.string().min(8).max(200),
});

export async function POST(req: NextRequest) {
  const body = await readJson(req);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return apiError("Données invalides", 422);

  const { name, email, password } = parsed.data;
  const existing = await prisma.parent.findUnique({
    where: { email: email.toLowerCase() },
  });
  if (existing) return apiError("Cet email est déjà utilisé", 409);

  const parent = await prisma.parent.create({
    data: {
      name,
      email: email.toLowerCase(),
      passwordHash: await hashPassword(password),
    },
  });

  const token = await signSession({ parentId: parent.id, email: parent.email });
  await setSessionCookie(token);

  return json({ id: parent.id, name: parent.name, email: parent.email });
}
