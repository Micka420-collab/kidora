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

  it("matches a multi-word term across a non-breaking / doubled space", () => {
    // Regression: normalize() didn't collapse Unicode whitespace, so a page
    // title using U+00A0 (nbsp, everywhere in web typography) slipped past the
    // critical self-harm term.   = nbsp,   = narrow nbsp.
    for (const sep of [" ", " ", "  ", "\t"]) {
      const hits = scanText(`comment${sep}me${sep}suicider ce soir`);
      expect(hits.some((h) => h.severity === "critical" && h.category === "automutilation")).toBe(true);
    }
  });

  it("flags proana / promia written as a single token (search-alert gap)", () => {
    for (const t of ["proana", "promia", "pro ana"]) {
      const hits = scanText(`recherche ${t} tips`);
      expect(hits.some((h) => h.severity === "critical" && h.category === "automutilation")).toBe(true);
    }
  });

  it("does not duplicate the same keyword", () => {
    const hits = scanText("porn porn porn");
    const pornHits = hits.filter((h) => h.keyword === "porn");
    expect(pornHits).toHaveLength(1);
  });

  it("matches short acronyms as whole words (true positives)", () => {
    expect(scanText("tu devrais kys").some((h) => h.keyword === "kys")).toBe(true);
    expect(scanText("kys.").some((h) => h.keyword === "kys")).toBe(true);
    expect(scanText("vente de mdma ce soir").some((h) => h.keyword === "mdma")).toBe(true);
  });

  it("does NOT fire short acronyms inside innocent words", () => {
    // Regression: "kys" used to match "kyste" (a cyst) and "skys".
    expect(scanText("j'ai un kyste au genou")).toHaveLength(0);
    expect(scanText("the skys are blue")).toHaveLength(0);
  });
});
