import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

// Integration test: exercises the policy engine against a real (temporary) DB.
const TEST_DB = "file:./test-policy.db";

/* eslint-disable @typescript-eslint/no-explicit-any */
let prisma: any;
let buildPolicy: any;
let childId: string;

beforeAll(async () => {
  process.env.DATABASE_URL = TEST_DB;
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: TEST_DB },
    stdio: "ignore",
  });
  ({ prisma } = await import("./prisma"));
  ({ buildPolicy } = await import("./policy"));

  const parent = await prisma.parent.create({
    data: { name: "Test", email: "int@test.dev", passwordHash: "x" },
  });
  const child = await prisma.child.create({
    data: {
      parentId: parent.id,
      name: "Kid",
      screenTime: { create: { enabled: true, dailyLimits: JSON.stringify({ mon: 90 }), bedtimes: "[]" } },
      webFilter: { create: { safeSearch: true, blockedCategories: JSON.stringify(["adult"]) } },
      appRules: { create: [{ appId: "valorant.exe", appName: "Valorant", action: "block" }] },
      webRules: {
        create: [
          { kind: "domain", value: "evil.com", action: "block" },
          { kind: "domain", value: "github.com", action: "allow" },
        ],
      },
    },
  });
  childId = child.id;
}, 60_000);

afterAll(async () => {
  await prisma?.$disconnect();
  rmSync("test-policy.db", { force: true });
});

describe("buildPolicy (integration)", () => {
  it("includes default + custom blocked domains and respects allow", async () => {
    const p = await buildPolicy(childId);
    expect(p.blockedDomains).toContain("pornhub.com"); // default blocklist
    expect(p.blockedDomains).toContain("evil.com"); // custom block
    expect(p.allowedDomains).toContain("github.com");
  });

  it("reflects app rules and screen time", async () => {
    const p = await buildPolicy(childId);
    const valorant = p.appRules.find((r: any) => r.appId === "valorant.exe");
    expect(valorant?.action).toBe("block");
    expect(p.screenTime.enabled).toBe(true);
    expect(p.screenTime.dailyLimits.mon).toBe(90);
    expect(p.webFilter.blockedCategories).toContain("adult");
  });

  it("reflects a timed pause as the effective paused state", async () => {
    expect((await buildPolicy(childId)).paused).toBe(false);

    await prisma.child.update({ where: { id: childId }, data: { pausedUntil: new Date(Date.now() + 60_000) } });
    expect((await buildPolicy(childId)).paused).toBe(true); // future → paused

    await prisma.child.update({ where: { id: childId }, data: { pausedUntil: new Date(Date.now() - 60_000) } });
    expect((await buildPolicy(childId)).paused).toBe(false); // expired → not paused

    await prisma.child.update({ where: { id: childId }, data: { pausedUntil: null } });
  });
});
