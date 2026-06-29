import { describe, it, expect } from "vitest";
import { scanText } from "./keywords";

describe("scanText", () => {
  it("detects built-in critical self-harm terms", () => {
    const hits = scanText("comment me suicider ce soir");
    expect(hits.some((h) => h.severity === "critical" && h.category === "automutilation")).toBe(true);
  });

  it("is accent and case insensitive", () => {
    const hits = scanText("acheter de la COCAÏNE livraison");
    expect(hits.some((h) => h.category === "drogue")).toBe(true);
  });

  it("matches custom parent terms", () => {
    const hits = scanText("regarde ces FORTNITE skins gratuits", ["fortnite skins gratuits"]);
    expect(hits.some((h) => h.category === "personnalisé" && h.keyword === "fortnite skins gratuits")).toBe(true);
  });

  it("does not flag benign text", () => {
    expect(scanText("devoirs de mathématiques et recette de gâteau")).toHaveLength(0);
  });

  it("returns empty for empty input", () => {
    expect(scanText("")).toHaveLength(0);
  });

  it("does not duplicate the same keyword", () => {
    const hits = scanText("porn porn porn");
    const pornHits = hits.filter((h) => h.keyword === "porn");
    expect(pornHits).toHaveLength(1);
  });
});
