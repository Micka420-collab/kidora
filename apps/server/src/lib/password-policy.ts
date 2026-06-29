import { createHash } from "node:crypto";
import { passwordStrength } from "./password-strength";

export { passwordStrength } from "./password-strength";
export type { Strength } from "./password-strength";

// Have I Been Pwned k-anonymity breach check + minimum policy. The strength
// scorer lives in password-strength.ts (client-safe).

/**
 * Have I Been Pwned check using k-anonymity: only the first 5 chars of the
 * SHA-1 hash leave the server, never the password. Fails OPEN (returns false)
 * on network/API errors so account creation isn't blocked by an outage.
 */
export async function isPasswordBreached(pw: string): Promise<boolean> {
  try {
    const sha1 = createHash("sha1").update(pw).digest("hex").toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true" },
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return false;
    const text = await res.text();
    for (const line of text.split("\n")) {
      const [hashSuffix, count] = line.split(":");
      if (hashSuffix.trim() === suffix && Number(count) > 0) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Enforce a minimum policy. Returns an error message or null if acceptable. */
export function passwordPolicyError(pw: string): string | null {
  if (pw.length < 8) return "Le mot de passe doit faire au moins 8 caractères.";
  if (passwordStrength(pw).score < 2) {
    return "Mot de passe trop faible : allongez-le et variez les caractères.";
  }
  return null;
}
