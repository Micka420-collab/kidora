import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isMailConfigured, mailFrom } from "./mailer";

const KEYS = ["SMTP_HOST", "MAIL_FROM", "SMTP_USER"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("isMailConfigured", () => {
  it("is false without SMTP_HOST and true with it", () => {
    expect(isMailConfigured()).toBe(false);
    process.env.SMTP_HOST = "smtp.example.com";
    expect(isMailConfigured()).toBe(true);
  });
});

describe("mailFrom", () => {
  it("prefers MAIL_FROM, then SMTP_USER, then a sane default", () => {
    expect(mailFrom()).toBe("Kidora <no-reply@kidora.app>");

    process.env.SMTP_USER = "bot@kidora.app";
    expect(mailFrom()).toBe("bot@kidora.app");

    process.env.MAIL_FROM = "Kidora <hello@kidora.app>";
    expect(mailFrom()).toBe("Kidora <hello@kidora.app>");
  });
});
