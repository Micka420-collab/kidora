import { describe, it, expect } from "vitest";
import { passwordStrength } from "./password-strength";

describe("passwordStrength — branches", () => {
  it("empty input scores 0 with a prompt", () => {
    const s = passwordStrength("");
    expect(s.score).toBe(0);
    expect(s.label).toBe("Très faible");
    expect(s.suggestions).toContain("Saisissez un mot de passe.");
  });

  it("caps a password that merely CONTAINS a common word", () => {
    const s = passwordStrength("myPassword123!"); // contains "password"
    expect(s.score).toBeLessThanOrEqual(1);
    expect(s.suggestions).toContain("Évitez les mots de passe courants.");
  });

  it("penalises sequences and repeats with a hint", () => {
    expect(passwordStrength("Abcd1234!x").suggestions).toContain("Évitez les suites (1234, aaaa…).");
    expect(passwordStrength("aaae1234").suggestions).toContain("Évitez les suites (1234, aaaa…).");
  });

  it("rewards length + class variety up to the top score", () => {
    expect(passwordStrength("Xk9!mNp2Qr7@LbZ3").score).toBe(4); // 16 chars, 4 classes, not common/sequential
  });

  it("suggests lengthening and mixing classes for weak inputs", () => {
    const s = passwordStrength("abcdefg"); // 7 chars, one class
    expect(s.suggestions).toContain("Allongez-le (12+ caractères).");
    expect(s.suggestions).toContain("Mélangez majuscules, chiffres et symboles.");
  });

  it("always returns a label matching the clamped score", () => {
    const labels = ["Très faible", "Faible", "Moyen", "Bon", "Excellent"];
    for (const pw of ["", "abc", "abcd1234", "Sunny-Day-42", "Xk9!mNp2Qr7@LbZ3"]) {
      const s = passwordStrength(pw);
      expect(s.score).toBeGreaterThanOrEqual(0);
      expect(s.score).toBeLessThanOrEqual(4);
      expect(s.label).toBe(labels[s.score]);
    }
  });
});
