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

/**
 * Origin derived from the incoming request (honours proxy headers), falling
 * back to {@link siteUrl}. Server-only — reads request headers, so it must be
 * awaited inside a request scope (route handlers, metadata routes).
 */
export async function requestOrigin(): Promise<string> {
  const { headers } = await import("next/headers");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return siteUrl();
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
