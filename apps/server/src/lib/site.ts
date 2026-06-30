/**
 * Canonical site origin, resolved from the environment.
 * Priority: NEXT_PUBLIC_SITE_URL > Vercel deployment URL > localhost.
 */
export function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  );
}
