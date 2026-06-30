import type { MetadataRoute } from "next";
import { requestOrigin } from "@/lib/site";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const base = await requestOrigin();
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/dashboard", "/api/"] },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
