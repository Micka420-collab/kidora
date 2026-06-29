// Heuristic risk scorer for free text (messages, searches, titles). Goes beyond
// exact keyword matching: weighted multi-category signals combine into a 0-100
// risk score. Designed for parental safety alerts (Bark/Helmit-style) — flags
// self-harm, grooming/predator, bullying, sexual, drugs and violence signals.
// Defensive / parental use only; never used to evade detection.

export type RiskLevel = "none" | "low" | "medium" | "high" | "critical";
export type RiskSignal = { category: string; label: string; weight: number };
export type RiskResult = {
  score: number; // 0-100
  level: RiskLevel;
  signals: RiskSignal[];
  topCategory: string | null;
};

function normalize(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, ""); // strip accents
}

type Pattern = { category: string; label: string; weight: number; re: RegExp };

// FR + EN, written against accent-stripped lowercase text.
const PATTERNS: Pattern[] = [
  // ── self-harm (very high) ──
  { category: "automutilation", label: "idées suicidaires", weight: 70, re: /(je veux mourir|envie de mourir|me suicider|suicide|veux plus vivre|me faire du mal|je me coupe|self.?harm|kill myself|end it all|i want to die)/ },
  { category: "automutilation", label: "pro-ana/mia", weight: 45, re: /(pro.?ana|pro.?mia|comment maigrir vite|jeune extreme)/ },
  // ── grooming / predator (combination-boosted) ──
  { category: "grooming", label: "demande de secret", weight: 28, re: /(notre secret|garde (le|ca) secret|c'?est un secret|our secret|keep (this|it) secret|entre nous deux|reste entre nous)/ },
  { category: "grooming", label: "cacher aux parents", weight: 32, re: /(n'?en parle pas a tes parents|ne dis rien a tes parents|dis.?le a personne|don'?t tell your (parents|mom|dad|mum)|supprime (ce|le) message|delete (this|the) (message|chat)|efface la conversation)/ },
  { category: "grooming", label: "demande de photo", weight: 30, re: /(envoie.?(moi)? une? (photo|pic|image|selfie)|send (me )?(a )?(pic|photo|selfie|nude)|montre.?moi ton corps|prends.?toi en photo)/ },
  { category: "grooming", label: "âge/adresse demandé", weight: 22, re: /(tu as quel age|quel age as.?tu|how old are you|tu habites ou|where do you live|t'?es (ou|chez toi)|t'?es seule?|are you (alone|home alone)|tes parents sont la)/ },
  { category: "grooming", label: "proposition de rencontre", weight: 28, re: /(on se voit (en vrai|quand)|let'?s meet( up)?|tu veux qu'?on se voie|rejoins.?moi|viens me voir|je viens te chercher)/ },
  { category: "grooming", label: "flatterie/confiance", weight: 18, re: /(tu es (tres )?mature|mure pour ton age|mature for your age|tu peux me faire confiance|je suis le seul a te comprendre|tu es speciale?)/ },
  // ── bullying ──
  { category: "harcelement", label: "incitation au suicide", weight: 55, re: /(kill yourself|\bkys\b|tue.?toi|va te tuer|pends.?toi)/ },
  { category: "harcelement", label: "insultes/rejet", weight: 22, re: /(personne ne t'?aime|nobody likes you|t'?es (nul|moche|grosse?|qu'?une merde)|you'?re worthless|ferme ta gueule|sale (pute|merde|chienne)|i hate you|je te deteste|degage de ma vie)/ },
  // ── sexual ──
  { category: "sexuel", label: "contenu sexuel/nudes", weight: 30, re: /(nudes?|photo nue|sois nue|envoie un nude|sext(ing)?|onlyfans|montre tes (seins|fesses)|t'?es chaude)/ },
  // ── drugs ──
  { category: "drogue", label: "drogues", weight: 22, re: /(achete de la (drogue|beuh)|buy (weed|drugs)|cannabis livraison|cocaine|\bmdma\b|ecstasy|je te deale)/ },
  // ── violence / weapons ──
  { category: "violence", label: "armes/violence", weight: 55, re: /(fabriquer une bombe|make a bomb|school shooting|je vais (le|la|les) tuer|tuer ma classe|ramene un couteau)/ },
];

function levelFor(score: number): RiskLevel {
  if (score >= 75) return "critical";
  if (score >= 50) return "high";
  if (score >= 25) return "medium";
  if (score >= 10) return "low";
  return "none";
}

/** Analyze free text and return a 0-100 risk score with matched signals. */
export function analyzeRisk(text: string): RiskResult {
  const hay = normalize(text);
  if (!hay) return { score: 0, level: "none", signals: [], topCategory: null };

  const signals: RiskSignal[] = [];
  const byCategory = new Map<string, number>();
  let grooming = 0;

  for (const p of PATTERNS) {
    if (p.re.test(hay)) {
      signals.push({ category: p.category, label: p.label, weight: p.weight });
      byCategory.set(p.category, (byCategory.get(p.category) ?? 0) + p.weight);
      if (p.category === "grooming") grooming++;
    }
  }

  let score = signals.reduce((a, s) => a + s.weight, 0);
  // Combination boost: several grooming cues together are far more alarming.
  if (grooming >= 2) score += 25;
  if (grooming >= 3) score += 20;
  score = Math.min(100, score);

  let topCategory: string | null = null;
  let topWeight = -1;
  for (const [cat, w] of byCategory) {
    if (w > topWeight) { topWeight = w; topCategory = cat; }
  }

  return { score, level: levelFor(score), signals, topCategory };
}

/** Map a risk level to an alert severity used elsewhere. */
export function riskSeverity(level: RiskLevel): "info" | "warning" | "critical" {
  if (level === "critical" || level === "high") return "critical";
  if (level === "medium") return "warning";
  return "info";
}

export const RISK_CATEGORY_LABELS: Record<string, string> = {
  automutilation: "Automutilation",
  grooming: "Prédation / grooming",
  harcelement: "Harcèlement",
  sexuel: "Contenu sexuel",
  drogue: "Drogues",
  violence: "Violence",
};
