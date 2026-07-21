// Pure web-filter decision logic for the on-device DNS VpnService.
//
// This mirrors the desktop agent's categorizer (apps/agent-windows/lib/domains.js)
// so a phone filters exactly like a PC. It has NO React-Native/Expo imports, so
// it is unit-testable in plain Node. The native Kotlin categorizer
// (android/.../DomainRules.kt) is a faithful port of THIS file — keep the two in
// sync (there is a parity test that pins the mapping).

// Domain → category (registrable domain or exact host).
const DOMAIN_CATEGORY: Record<string, string> = {
  "facebook.com": "social", "instagram.com": "social", "tiktok.com": "social",
  "snapchat.com": "social", "twitter.com": "social", "x.com": "social",
  "reddit.com": "social", "pinterest.com": "social", "tumblr.com": "social",
  "vk.com": "social", "bsky.app": "social",
  "youtube.com": "video", "youtu.be": "video", "vimeo.com": "video", "dailymotion.com": "video",
  "twitch.tv": "streaming", "netflix.com": "streaming", "disneyplus.com": "streaming",
  "primevideo.com": "streaming", "hulu.com": "streaming",
  "spotify.com": "music", "deezer.com": "music", "soundcloud.com": "music",
  "roblox.com": "games", "epicgames.com": "games", "steampowered.com": "games",
  "minecraft.net": "games", "miniclip.com": "games", "poki.com": "games", "crazygames.com": "games",
  "gmail.com": "communication", "mail.google.com": "communication", "outlook.com": "communication",
  "discord.com": "communication", "whatsapp.com": "communication", "telegram.org": "communication",
  "messenger.com": "communication",
  "wikipedia.org": "education", "khanacademy.org": "education", "duolingo.com": "education",
  "coursera.org": "education", "scratch.mit.edu": "education", "education.gouv.fr": "education",
  "google.com": "browser", "bing.com": "browser", "duckduckgo.com": "browser",
  "amazon.com": "shopping", "amazon.fr": "shopping", "aliexpress.com": "shopping", "ebay.com": "shopping",
  "lemonde.fr": "news", "bbc.com": "news", "cnn.com": "news",
  "github.com": "developer", "stackoverflow.com": "developer",
};

// Substring signals catch new/unknown domains in sensitive categories.
const SENSITIVE_SIGNALS: { match: RegExp; category: string }[] = [
  { match: /porn|xxx|sex|hentai|nude|escort|camgirl|onlyfans|brazzers|xvideos|xnxx|redtube|youporn/i, category: "adult" },
  { match: /casino|bet365|pokerstars|gambl|betting|roulette|1xbet|stake\.com/i, category: "gambling" },
  { match: /tinder|grindr|badoo|bumble|adultfriend|ashleymadison/i, category: "dating" },
  { match: /\b(cocaine|cannabis|weed-shop|buy-drugs)\b/i, category: "drugs" },
];

export const DEFAULT_BLOCKED_CATEGORIES = ["adult", "gambling", "violence", "drugs", "dating"];

// SafeSearch DNS targets (services publish these for DNS-based enforcement).
export const SAFESEARCH_MAP: Record<string, string> = {
  "google.com": "forcesafesearch.google.com",
  "www.google.com": "forcesafesearch.google.com",
  "youtube.com": "restrict.youtube.com",
  "www.youtube.com": "restrict.youtube.com",
  "m.youtube.com": "restrict.youtube.com",
  "youtubei.googleapis.com": "restrict.youtube.com",
  "bing.com": "strict.bing.com",
  "www.bing.com": "strict.bing.com",
  "duckduckgo.com": "safe.duckduckgo.com",
};

export function normalizeDomain(input: string): string {
  let d = (input || "").trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "").replace(/^www\./, "");
  d = d.split("/")[0].split("?")[0].split(":")[0];
  return d;
}

/** Registrable-ish domain (last two labels). */
export function registrableDomain(domain: string): string {
  const parts = normalizeDomain(domain).split(".");
  if (parts.length <= 2) return parts.join(".");
  return parts.slice(-2).join(".");
}

/** Category for a domain: exact host, registrable domain, then keyword signals. */
export function categorizeDomain(input: string): string {
  const domain = normalizeDomain(input);
  if (DOMAIN_CATEGORY[domain]) return DOMAIN_CATEGORY[domain];
  const reg = registrableDomain(domain);
  if (DOMAIN_CATEGORY[reg]) return DOMAIN_CATEGORY[reg];
  for (const sig of SENSITIVE_SIGNALS) {
    if (sig.match.test(domain)) return sig.category;
  }
  return "unknown";
}

/** True when `domain` equals or is a subdomain of any entry in `set`. */
function suffixMatch(domain: string, set: Iterable<string>): boolean {
  for (const raw of set) {
    const d = normalizeDomain(raw);
    if (!d) continue;
    if (domain === d || domain.endsWith(`.${d}`)) return true;
  }
  return false;
}

export type WebPolicy = {
  blockedDomains?: Iterable<string>;
  allowedDomains?: Iterable<string>;
  blockedCategories?: Iterable<string>;
  blockUnknown?: boolean;
  safeSearch?: boolean;
};

export type WebDecision =
  | { action: "allow"; reason: string }
  | { action: "block"; reason: string }
  | { action: "safesearch"; reason: string; target: string };

/**
 * Decide what to do with a DNS query for `host`. Order mirrors the desktop
 * proxy: explicit allow wins, then forced SafeSearch, then blocklist, then
 * category, then block-unknown.
 */
export function webDecision(host: string, web: WebPolicy = {}): WebDecision {
  const domain = normalizeDomain(host);
  const allowed = web.allowedDomains ?? [];
  const blocked = web.blockedDomains ?? [];
  const categories = web.blockedCategories instanceof Set
    ? web.blockedCategories
    : new Set(web.blockedCategories ?? []);

  if (suffixMatch(domain, allowed)) return { action: "allow", reason: "allowlist" };

  if (web.safeSearch) {
    const target = SAFESEARCH_MAP[domain] || SAFESEARCH_MAP[registrableDomain(domain)];
    if (target && target !== domain) return { action: "safesearch", reason: "safesearch", target };
  }

  if (suffixMatch(domain, blocked)) return { action: "block", reason: "blocklist" };

  const cat = categorizeDomain(domain);
  if (categories.has(cat)) return { action: "block", reason: `category:${cat}` };
  if (web.blockUnknown && cat === "unknown") return { action: "block", reason: "unknown" };

  return { action: "allow", reason: "ok" };
}

// ── Bridge helper: server policy → the flat config pushed to the native filter ──

type EffectivePolicy = {
  webFilter?: { safeSearch?: boolean; blockUnknown?: boolean; blockedCategories?: string[] };
  blockedDomains?: string[];
  allowedDomains?: string[];
};

export type NativeWebFilterConfig = {
  safeSearch: boolean;
  blockUnknown: boolean;
  blockedCategories: string[];
  blockedDomains: string[];
  allowedDomains: string[];
};

/**
 * Flatten the server's effective policy into the primitive lists/flags the
 * native VpnService reads from SharedPreferences. Mirrors how child-mode derives
 * the app block list — pure so it is unit-tested.
 */
export function webFilterConfigFromPolicy(policy: EffectivePolicy | null | undefined): NativeWebFilterConfig {
  const wf = policy?.webFilter ?? {};
  return {
    safeSearch: wf.safeSearch ?? true,
    blockUnknown: !!wf.blockUnknown,
    blockedCategories: Array.isArray(wf.blockedCategories) ? wf.blockedCategories : [],
    blockedDomains: Array.isArray(policy?.blockedDomains) ? policy!.blockedDomains : [],
    allowedDomains: Array.isArray(policy?.allowedDomains) ? policy!.allowedDomains : [],
  };
}

/** Does this policy require the DNS filter to actually be running? */
export function webFilterNeeded(cfg: NativeWebFilterConfig): boolean {
  return cfg.safeSearch || cfg.blockUnknown || cfg.blockedCategories.length > 0 || cfg.blockedDomains.length > 0;
}
