import { describe, it, expect } from "vitest";
import { evaluateEnvConfig, overallStatus } from "./diagnostics";

const base = { NODE_ENV: "production" } as NodeJS.ProcessEnv;

function ids(checks: { id: string }[]) {
  return checks.map((c) => c.id);
}
function byId(checks: { id: string; status: string }[], id: string) {
  return checks.find((c) => c.id === id)!;
}

describe("evaluateEnvConfig", () => {
  it("returns all expected checks", () => {
    const checks = evaluateEnvConfig(base, { host: "example.com", isHttps: true });
    expect(ids(checks)).toEqual(["auth", "enc", "sign", "push", "smtp", "cron", "https"]);
  });

  it("flags a missing AUTH_SECRET as fail in production", () => {
    const checks = evaluateEnvConfig({ NODE_ENV: "production" } as NodeJS.ProcessEnv, { isHttps: true, host: "x.com" });
    expect(byId(checks, "auth").status).toBe("fail");
  });

  it("passes a strong AUTH_SECRET and warns on a short one", () => {
    const strong = evaluateEnvConfig({ ...base, AUTH_SECRET: "a".repeat(48) } as NodeJS.ProcessEnv, { isHttps: true, host: "x" });
    expect(byId(strong, "auth").status).toBe("ok");
    const short = evaluateEnvConfig({ ...base, AUTH_SECRET: "abc" } as NodeJS.ProcessEnv, { isHttps: true, host: "x" });
    expect(byId(short, "auth").status).toBe("warn");
  });

  it("recognizes a valid 32-byte DATA_ENC_KEY (base64)", () => {
    const key = Buffer.alloc(32, 7).toString("base64");
    const checks = evaluateEnvConfig({ ...base, DATA_ENC_KEY: key } as NodeJS.ProcessEnv, { isHttps: true, host: "x" });
    expect(byId(checks, "enc").status).toBe("ok");
    const weak = evaluateEnvConfig({ ...base, DATA_ENC_KEY: "short" } as NodeJS.ProcessEnv, { isHttps: true, host: "x" });
    expect(byId(weak, "enc").status).toBe("warn");
  });

  it("policy signing is ok when AUTH_SECRET or POLICY_SIGNING_SEED is present", () => {
    expect(byId(evaluateEnvConfig({ ...base, AUTH_SECRET: "x".repeat(40) } as NodeJS.ProcessEnv, { isHttps: true, host: "x" }), "sign").status).toBe("ok");
    expect(byId(evaluateEnvConfig({ NODE_ENV: "production" } as NodeJS.ProcessEnv, { isHttps: true, host: "x" }), "sign").status).toBe("warn");
  });

  it("HTTPS check: ok on https, ok on localhost, warn on plain http remote", () => {
    expect(byId(evaluateEnvConfig(base, { isHttps: true, host: "kidora.fr" }), "https").status).toBe("ok");
    expect(byId(evaluateEnvConfig(base, { isHttps: false, host: "localhost:3000" }), "https").status).toBe("ok");
    expect(byId(evaluateEnvConfig(base, { isHttps: false, host: "192.168.1.5:3000" }), "https").status).toBe("warn");
  });

  it("push/smtp/cron warn when unset, ok when set", () => {
    const set = evaluateEnvConfig(
      { ...base, VAPID_PUBLIC_KEY: "a", VAPID_PRIVATE_KEY: "b", SMTP_HOST: "h", SMTP_PORT: "587", CRON_SECRET: "s" } as NodeJS.ProcessEnv,
      { isHttps: true, host: "x" },
    );
    expect(byId(set, "push").status).toBe("ok");
    expect(byId(set, "smtp").status).toBe("ok");
    expect(byId(set, "cron").status).toBe("ok");
    const unset = evaluateEnvConfig(base, { isHttps: true, host: "x" });
    expect(byId(unset, "push").status).toBe("warn");
    expect(byId(unset, "smtp").status).toBe("warn");
    expect(byId(unset, "cron").status).toBe("warn");
  });
});

describe("overallStatus", () => {
  it("is the worst of the checks", () => {
    expect(overallStatus([{ id: "a", label: "", status: "ok", detail: "" }, { id: "b", label: "", status: "warn", detail: "" }])).toBe("warn");
    expect(overallStatus([{ id: "a", label: "", status: "warn", detail: "" }, { id: "b", label: "", status: "fail", detail: "" }])).toBe("fail");
    expect(overallStatus([{ id: "a", label: "", status: "ok", detail: "" }])).toBe("ok");
  });
});
