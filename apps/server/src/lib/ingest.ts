// Helpers for ingesting semi-trusted agent telemetry.

/**
 * Coerce an agent-supplied timestamp to a valid Date, falling back to now.
 * A device with a bad clock (or a scraped title leaking into a `ts` field) used
 * to yield an Invalid Date which Prisma then threw on — taking down the whole
 * sync with a 500. The agent would re-POST the identical batch on its next
 * cycle, double-incrementing `seconds` usage. Sanitising at the point of use
 * keeps one bad record from poisoning the batch.
 */
export function safeDate(s: string | undefined | null): Date {
  if (!s) return new Date();
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}
