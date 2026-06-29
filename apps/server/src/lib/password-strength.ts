// Client-safe password strength scorer (no Node imports) so it can run both
// server-side (policy) and in the browser (live strength meter).

const COMMON = new Set([
  "password", "passw0rd", "motdepasse", "123456", "1234567", "12345678", "123456789",
  "azerty", "qwerty", "qwertyuiop", "111111", "000000", "abc123", "iloveyou", "admin",
  "welcome", "letmein", "monkey", "dragon", "football", "sunshine", "princess",
  "kidora", "kidora1234", "soleil", "doudou", "bonjour", "azertyuiop",
]);

export type Strength = {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  suggestions: string[];
};

const LABELS = ["Très faible", "Faible", "Moyen", "Bon", "Excellent"] as const;

/** Heuristic 0-4 strength score with French label + suggestions. */
export function passwordStrength(pw: string): Strength {
  const suggestions: string[] = [];
  if (!pw) return { score: 0, label: LABELS[0], suggestions: ["Saisissez un mot de passe."] };

  const lower = /[a-z]/.test(pw);
  const upper = /[A-Z]/.test(pw);
  const digit = /\d/.test(pw);
  const symbol = /[^A-Za-z0-9]/.test(pw);
  const classes = [lower, upper, digit, symbol].filter(Boolean).length;
  const norm = pw.toLowerCase();

  let score = 0;
  if (pw.length >= 8) score += 1;
  if (pw.length >= 12) score += 1;
  if (classes >= 3) score += 1;
  if (pw.length >= 16 || (pw.length >= 12 && classes === 4)) score += 1;

  const isCommon = COMMON.has(norm) || [...COMMON].some((c) => norm.includes(c) && c.length >= 6);
  const sequential = /(.)\1\1/.test(pw) || /(0123|1234|2345|3456|4567|5678|6789|abcd|qwer|azer)/i.test(pw);
  if (isCommon) { score = Math.min(score, 1); suggestions.push("Évitez les mots de passe courants."); }
  if (sequential) { score = Math.max(0, score - 1); suggestions.push("Évitez les suites (1234, aaaa…)."); }

  if (pw.length < 12) suggestions.push("Allongez-le (12+ caractères).");
  if (classes < 3) suggestions.push("Mélangez majuscules, chiffres et symboles.");

  const clamped = Math.max(0, Math.min(4, score)) as 0 | 1 | 2 | 3 | 4;
  return { score: clamped, label: LABELS[clamped], suggestions };
}
