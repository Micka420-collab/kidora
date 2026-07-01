import { describe, it, expect } from "vitest";
import { pricePer1M, RECOMMENDED_MODELS } from "./openrouter";

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
