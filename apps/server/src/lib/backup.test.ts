import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { backupFileName, isBackupName, pruneBackups, runDatabaseBackup } from "./backup";

describe("backupFileName", () => {
  it("is sortable and matches the pattern", () => {
    const a = backupFileName(new Date(2026, 6, 2, 4, 5, 6));
    expect(a).toBe("kidora-20260702-040506.db");
    expect(isBackupName(a)).toBe(true);
    // chronological order == lexical order
    const b = backupFileName(new Date(2026, 6, 2, 4, 5, 7));
    expect([b, a].sort()).toEqual([a, b]);
  });
});

describe("pruneBackups", () => {
  it("keeps the newest N, deletes the rest, ignores foreign files", () => {
    const names = [
      "kidora-20260101-000000.db",
      "kidora-20260102-000000.db",
      "kidora-20260103-000000.db",
      "notes.txt", // not a backup → ignored
    ];
    const del = pruneBackups(names, 2);
    expect(del).toEqual(["kidora-20260101-000000.db"]); // oldest removed, newest 2 kept
  });
  it("deletes nothing when under the limit", () => {
    expect(pruneBackups(["kidora-20260101-000000.db"], 7)).toEqual([]);
  });
});

describe("runDatabaseBackup", () => {
  it("skips a non-SQLite database", async () => {
    const fakePrisma = { $executeRawUnsafe: async () => 0 };
    const res = await runDatabaseBackup(fakePrisma, { dir: "unused", databaseUrl: "postgres://x/y" });
    expect(res.skipped).toBe(true);
    expect(res.reason).toMatch(/Postgres/i);
  });

  let tmp = "";
  afterEach(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); });

  it("runs VACUUM INTO to a rotated file for SQLite and prunes", async () => {
    tmp = mkdtempSync(join(tmpdir(), "kidora-bk-"));
    let calledWith = "";
    const fakePrisma = { $executeRawUnsafe: async (sql: string) => { calledWith = sql; return 0; } };
    // Pre-seed old backups to exercise pruning.
    const seed = ["kidora-20200101-000000.db", "kidora-20200102-000000.db"];
    for (const s of seed) writeFileSync(join(tmp, s), "x");

    const res = await runDatabaseBackup(fakePrisma, { dir: tmp, keep: 1, databaseUrl: "file:./dev.db", now: new Date(2030, 0, 1, 0, 0, 0) });
    expect(res.skipped).toBe(false);
    expect(calledWith).toMatch(/^VACUUM INTO '/);
    expect(calledWith).toContain("kidora-20300101-000000.db");
    // keep:1 → only the newest (the seeds are older than the just-"made" one, but
    // the new file isn't physically created by the fake prisma). Pruning keeps 1
    // of the names it SEES (the 2 seeds), deleting the oldest.
    const remaining = readdirSync(tmp).filter(isBackupName);
    expect(remaining).not.toContain("kidora-20200101-000000.db"); // oldest pruned
    expect(existsSync(join(tmp, "kidora-20200102-000000.db"))).toBe(true);
  });
});
