import { describe, it, expect } from "vitest";
import { pricePer1M, RECOMMENDED_MODELS, combinedRisk } from "./openrouter";

describe("pricePer1M", () => {
  it("converts a per-token price string to $/1M tokens", () => {
    expect(pricePer1M("0.00000014")).toBe(0.14); // DeepSeek-ish
    expect(pricePer1M("0.0000025")).toBe(2.5); // gpt-4o-ish
    expect(pricePer1M("0")).toBe(0); // free model
  });
  it("accepts numbers as well as strings", () => {
    expect(pricePer1M(0.0000006)).toBe(0.6);
  });
  it("defaults junk / missing to 0", () => {
    expect(pricePer1M(undefined)).toBe(0);
    expect(pricePer1M(null)).toBe(0);
    expect(pricePer1M("n/a")).toBe(0);
  });
});

describe("RECOMMENDED_MODELS", () => {
  it("includes a cheap, capable default set", () => {
    expect(RECOMMENDED_MODELS.has("deepseek/deepseek-chat")).toBe(true);
    expect(RECOMMENDED_MODELS.has("openai/gpt-4o-mini")).toBe(true);
    expect(RECOMMENDED_MODELS.size).toBeGreaterThanOrEqual(4);
  });
});

describe("combinedRisk (budget/deadline guards, no network)", () => {
  it("falls back to the heuristic with no AI context", async () => {
    const r = await combinedRisk("je veux mourir", null);
    expect(["high", "critical"]).toContain(r.level); // heuristic still flags self-harm
  });

  it("does not spend budget on blank/whitespace text (never calls the LLM)", async () => {
    const ctx = { apiKey: "k", model: "m", budget: { n: 5 } };
    const r = await combinedRisk("   ", ctx);
    expect(r.score).toBe(0);
    expect(ctx.budget.n).toBe(5); // untouched → no wasted LLM call
  });

  it("skips the LLM once the shared deadline has passed (no budget spent)", async () => {
    const ctx = { apiKey: "k", model: "m", budget: { n: 5 }, deadline: 1 }; // long past
    const r = await combinedRisk("je veux mourir", ctx);
    expect(ctx.budget.n).toBe(5); // deadline passed → heuristic only, no LLM call
    expect(["high", "critical"]).toContain(r.level); // heuristic result still returned
  });

  it("respects an exhausted budget (heuristic only)", async () => {
    const ctx = { apiKey: "k", model: "m", budget: { n: 0 } };
    const r = await combinedRisk("kill yourself", ctx);
    expect(ctx.budget.n).toBe(0);
    expect(["high", "critical"]).toContain(r.level);
  });
});
