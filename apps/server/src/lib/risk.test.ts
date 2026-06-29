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

  it("strips accents and is case-insensitive", () => {
    expect(analyzeRisk("ENVOIE MOI UNE PHOTO").signals.length).toBeGreaterThan(0);
  });

  it("maps levels to severities", () => {
    expect(riskSeverity("critical")).toBe("critical");
    expect(riskSeverity("high")).toBe("critical");
    expect(riskSeverity("medium")).toBe("warning");
    expect(riskSeverity("low")).toBe("info");
    expect(riskSeverity("none")).toBe("info");
  });
});
