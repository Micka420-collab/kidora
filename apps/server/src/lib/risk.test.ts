import { describe, it, expect } from "vitest";
import { analyzeRisk, riskSeverity } from "./risk";

describe("analyzeRisk", () => {
  it("returns none for benign text", () => {
    const r = analyzeRisk("On se voit à l'école demain pour réviser le contrôle 📚");
    expect(r.level).toBe("none");
    expect(r.score).toBe(0);
  });

  it("flags self-harm as critical", () => {
    const r = analyzeRisk("je veux mourir, j'en peux plus");
    expect(r.topCategory).toBe("automutilation");
    expect(r.level === "high" || r.level === "critical").toBe(true);
  });

  it("escalates combined grooming signals to high/critical", () => {
    const one = analyzeRisk("tu as quel âge ?");
    const many = analyzeRisk("tu as quel âge ? n'en parle pas à tes parents, c'est notre secret, envoie-moi une photo");
    expect(many.score).toBeGreaterThan(one.score);
    expect(many.topCategory).toBe("grooming");
    expect(["high", "critical"]).toContain(many.level);
  });

  it("detects bullying / kys", () => {
    const r = analyzeRisk("kys, personne ne t'aime");
    expect(r.topCategory).toBe("harcelement");
    expect(r.score).toBeGreaterThanOrEqual(50);
  });

  it("is case-insensitive", () => {
    expect(analyzeRisk("ENVOIE MOI UNE PHOTO").signals.length).toBeGreaterThan(0);
  });

  it("strips accents so accented text still matches (âge → age)", () => {
    const r = analyzeRisk("tu as quel âge ?");
    expect(r.signals.length).toBeGreaterThan(0);
    expect(r.topCategory).toBe("grooming");
  });

  it("returns none/empty for empty input", () => {
    expect(analyzeRisk("")).toEqual({ score: 0, level: "none", signals: [], topCategory: null });
  });

  it("maps levels to severities", () => {
    expect(riskSeverity("critical")).toBe("critical");
    expect(riskSeverity("high")).toBe("critical");
    expect(riskSeverity("medium")).toBe("warning");
    expect(riskSeverity("low")).toBe("info");
    expect(riskSeverity("none")).toBe("info");
  });
});

describe("analyzeRisk — scoring mechanics", () => {
  it("applies the grooming combination boost (+25 for >=2 cues)", () => {
    // age (22) + flatterie (18) = 40 raw; two grooming cues → +25 = 65.
    const r = analyzeRisk("tu as quel age, tu es mature pour ton age");
    expect(r.signals.length).toBe(2);
    expect(r.score).toBe(65);
    expect(r.level).toBe("high");
    expect(r.topCategory).toBe("grooming");
  });

  it("caps the score at 100 when many strong signals stack", () => {
    const r = analyzeRisk("je veux mourir. kill yourself. fabriquer une bombe.");
    expect(r.score).toBe(100);
    expect(r.level).toBe("critical");
  });

  it("picks the heaviest category as topCategory across categories", () => {
    // self-harm (70) outweighs grooming (22).
    const r = analyzeRisk("je veux mourir, tu as quel age");
    expect(r.topCategory).toBe("automutilation");
    expect(r.score).toBe(92);
  });
});
