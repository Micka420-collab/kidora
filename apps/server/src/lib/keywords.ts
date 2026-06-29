// Sensitive-keyword detection for searches & page titles.
// Used to raise "keyword" alerts so parents are warned about risky topics.

export type KeywordHit = {
  keyword: string;
  category: string;
  severity: "warning" | "critical";
};

// Built-in watchlist. Kept deliberately small & high-signal; parents can add
// their own per-child terms via WatchedKeyword.
const BUILTIN: { category: string; severity: "warning" | "critical"; terms: string[] }[] = [
  {
    category: "automutilation",
    severity: "critical",
    terms: ["suicide", "me suicider", "self harm", "automutilation", "scarification", "comment mourir", "pro ana", "pro mia"],
  },
  {
    category: "violence",
    severity: "critical",
    terms: ["fabriquer une bombe", "how to make a bomb", "school shooting", "tuer quelqu'un"],
  },
  {
    category: "drogue",
    severity: "warning",
    terms: ["acheter de la drogue", "buy weed", "cannabis livraison", "cocaïne", "mdma", "vente stupéfiants"],
  },
  {
    category: "adulte",
    severity: "warning",
    terms: ["porn", "porno", "xxx", "nude", "onlyfans", "sexe gratuit"],
  },
  {
    category: "harcèlement",
    severity: "warning",
    terms: ["je te déteste", "personne ne m'aime", "harcèlement", "bullying", "kill yourself", "kys"],
  },
  {
    category: "rencontres",
    severity: "warning",
    terms: ["rencontre adulte", "dating adulte", "tinder", "grindr", "snap nude"],
  },
];

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, ""); // strip accents for robust matching
}

/**
 * Scan free text against built-in + custom watch terms.
 * `custom` = parent-defined terms (treated as "warning"/personnalisé).
 */
export function scanText(text: string, custom: string[] = []): KeywordHit[] {
  if (!text) return [];
  const hay = normalize(text);
  const hits: KeywordHit[] = [];
  const seen = new Set<string>();

  for (const group of BUILTIN) {
    for (const term of group.terms) {
      if (hay.includes(normalize(term)) && !seen.has(term)) {
        seen.add(term);
        hits.push({ keyword: term, category: group.category, severity: group.severity });
      }
    }
  }
  for (const term of custom) {
    const t = term.trim();
    if (t && hay.includes(normalize(t)) && !seen.has(t)) {
      seen.add(t);
      hits.push({ keyword: t, category: "personnalisé", severity: "warning" });
    }
  }
  return hits;
}
