// Local domain categorizer (mirrors apps/server/src/lib/categories.ts) so the
// DNS proxy can filter by category at query time — including NEW domains not in
// any static blocklist, via the sensitive-keyword signals.

// Domain → category (registrable domain or exact host).
const DOMAIN_CATEGORY = {
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
const SENSITIVE_SIGNALS = [
  { match: /porn|xxx|sex|hentai|nude|escort|camgirl|onlyfans|brazzers|xvideos|xnxx|redtube|youporn/i, category: "adult" },
  { match: /casino|bet365|pokerstars|gambl|betting|roulette|1xbet|stake\.com/i, category: "gambling" },
  { match: /tinder|grindr|badoo|bumble|adultfriend|ashleymadison/i, category: "dating" },
  { match: /\b(cocaine|cannabis|weed-shop|buy-drugs)\b/i, category: "drugs" },
];

export const DEFAULT_BLOCKED_CATEGORIES = ["adult", "gambling", "violence", "drugs", "dating"];

// SafeSearch DNS targets (services publish these for DNS-based enforcement).
export const SAFESEARCH_MAP = {
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

export function normalizeDomain(input) {
  let d = (input || "").trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "").replace(/^www\./, "");
  d = d.split("/")[0].split("?")[0].split(":")[0];
  return d;
}

/** Registrable-ish domain (last two labels). */
export function registrableDomain(domain) {
  const parts = normalizeDomain(domain).split(".");
  if (parts.length <= 2) return parts.join(".");
  return parts.slice(-2).join(".");
}

/**
 * All known domains whose category is in `categories`. Used by the hosts-file
 * fallback, which — unlike the DNS proxy — can't categorize at query time, so it
 * must be handed the concrete domain list for each blocked category.
 */
export function domainsForCategories(categories) {
  const set = categories instanceof Set ? categories : new Set(categories || []);
  if (set.size === 0) return [];
  const out = [];
  for (const [domain, cat] of Object.entries(DOMAIN_CATEGORY)) {
    if (set.has(cat)) out.push(domain);
  }
  return out;
}

export function categorizeDomain(input) {
  const domain = normalizeDomain(input);
  const reg = registrableDomain(domain);
  if (DOMAIN_CATEGORY[domain]) return DOMAIN_CATEGORY[domain];
  if (DOMAIN_CATEGORY[reg]) return DOMAIN_CATEGORY[reg];
  for (const sig of SENSITIVE_SIGNALS) if (sig.match.test(domain)) return sig.category;
  return "unknown";
}

/** True if `host` equals or is a subdomain of any entry in `set` (normalized). */
function suffixMatch(host, set) {
  if (!set || set.size === 0) return false;
  const h = normalizeDomain(host);
  if (set.has(h)) return true;
  const parts = h.split(".");
  for (let i = 1; i < parts.length - 1; i++) {
    if (set.has(parts.slice(i).join("."))) return true;
  }
  return false;
}

/**
 * Decide what the DNS proxy should do with a queried hostname.
 * web = { blockedDomains:Set, allowedDomains:Set, blockedCategories:Set,
 *         blockUnknown:bool, safeSearch:bool }
 * Returns { action: "allow"|"block"|"safesearch", reason, target? }.
 */
export function webDecision(host, web) {
  const domain = normalizeDomain(host);

  // Explicit allow always wins.
  if (suffixMatch(domain, web.allowedDomains)) return { action: "allow", reason: "allowlist" };

  // Forced SafeSearch redirect for search/video domains.
  if (web.safeSearch) {
    const target = SAFESEARCH_MAP[domain] || SAFESEARCH_MAP[registrableDomain(domain)];
    if (target && target !== domain) return { action: "safesearch", reason: "safesearch", target };
  }

  // Explicit / category-expanded blocklist.
  if (suffixMatch(domain, web.blockedDomains)) return { action: "block", reason: "blocklist" };

  // Category-level decision.
  const cat = categorizeDomain(domain);
  if (web.blockedCategories && web.blockedCategories.has(cat)) {
    return { action: "block", reason: `category:${cat}` };
  }
  if (web.blockUnknown && cat === "unknown") return { action: "block", reason: "unknown" };

  return { action: "allow", reason: "ok" };
}
