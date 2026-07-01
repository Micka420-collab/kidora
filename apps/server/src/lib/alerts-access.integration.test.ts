import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

// Integration test: proves the alert access predicate works against a REAL DB
// (relation filter through guardianships) and preserves family isolation — the
// unit test only checks the query object's shape.
const TEST_DB = "file:./test-alerts-access.db";

/* eslint-disable @typescript-eslint/no-explicit-any */
let prisma: any;
let accessibleAlertWhere: (parentId: string) => any;
let ownerId: string, guardianId: string, strangerId: string, alertId: string;

beforeAll(async () => {
  process.env.DATABASE_URL = TEST_DB;
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: TEST_DB },
    stdio: "ignore",
  });
  ({ prisma } = await import("./prisma"));
  ({ accessibleAlertWhere } = await import("./guard"));

  const owner = await prisma.parent.create({ data: { name: "Owner", email: "owner@int.dev", passwordHash: "x" } });
  const guardian = await prisma.parent.create({ data: { name: "Guardian", email: "guardian@int.dev", passwordHash: "x" } });
  const stranger = await prisma.parent.create({ data: { name: "Stranger", email: "stranger@int.dev", passwordHash: "x" } });
  const child = await prisma.child.create({ data: { parentId: owner.id, name: "Kid" } });
  await prisma.guardianship.create({ data: { parentId: guardian.id, childId: child.id } });
  // Alert row is addressed to the OWNER (as the sync route creates it).
  const alert = await prisma.alert.create({
    data: { parentId: owner.id, childId: child.id, type: "panic", severity: "critical", message: "🆘 SOS" },
  });
  ownerId = owner.id;
  guardianId = guardian.id;
  strangerId = stranger.id;
  alertId = alert.id;
}, 60_000);

afterAll(async () => {
  await prisma?.$disconnect();
  rmSync("test-alerts-access.db", { force: true });
});

describe("accessibleAlertWhere (integration — real DB relation filter)", () => {
  const seenIds = async (parentId: string): Promise<string[]> =>
    (await prisma.alert.findMany({ where: accessibleAlertWhere(parentId) })).map((a: any) => a.id);

  it("the owning parent sees the child's alert", async () => {
    expect(await seenIds(ownerId)).toContain(alertId);
  });

  it("a co-guardian sees the child's alert even though it's addressed to the owner", async () => {
    expect(await seenIds(guardianId)).toContain(alertId);
  });

  it("an unrelated parent sees nothing (family isolation preserved)", async () => {
    const ids = await seenIds(strangerId);
    expect(ids).not.toContain(alertId);
    expect(ids).toHaveLength(0);
  });
});
