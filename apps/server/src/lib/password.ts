import bcrypt from "bcryptjs";

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// A valid bcrypt hash (cost 10) of a throwaway value — NOT a secret (nobody
// knows its preimage). Comparing against it makes the login path spend the same
// ~bcrypt time when the account doesn't exist, so response timing can't be used
// to enumerate which emails are registered.
const DUMMY_HASH = "$2b$10$DzprlWX98gxirQ94baSdrOpe2L7khiTmtkuWrfFteJUgmQ19r4MTe";

/** Burn a bcrypt comparison to equalize timing when there is no user to check. */
export async function dummyVerify(plain: string): Promise<void> {
  try {
    await bcrypt.compare(plain, DUMMY_HASH);
  } catch {
    /* ignore — purely a timing equalizer */
  }
}

/** Generate a random URL-safe token (device enrollment, etc.). */
export function randomToken(bytes = 24): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Buffer.from(arr)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Short human-friendly pairing code, e.g. KIDORA-7F3K-9Q2P */
export function pairingCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const block = () =>
    Array.from(
      { length: 4 },
      () => alphabet[Math.floor((crypto.getRandomValues(new Uint8Array(1))[0] / 256) * alphabet.length)],
    ).join("");
  return `${block()}-${block()}`;
}
