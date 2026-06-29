// Content classification engine — maps apps & domains to categories.
// Used by web filtering, app rules, and activity reporting.

export type Category =
  | "social"
  | "video"
  | "games"
  | "education"
  | "communication"
  | "shopping"
  | "news"
  | "adult"
  | "gambling"
  | "violence"
  | "drugs"
  | "dating"
  | "streaming"
  | "music"
  | "productivity"
  | "browser"
  | "system"
  | "developer"
  | "unknown";

export const CATEGORY_META: Record<
  Category,
  { label: string; emoji: string; sensitive: boolean }
> = {
  social: { label: "Réseaux sociaux", emoji: "💬", sensitive: true },
  video: { label: "Vidéo", emoji: "📺", sensitive: false },
  games: { label: "Jeux", emoji: "🎮", sensitive: false },
  education: { label: "Éducation", emoji: "📚", sensitive: false },
  communication: { label: "Communication", emoji: "✉️", sensitive: false },
  shopping: { label: "Achats", emoji: "🛒", sensitive: false },
  news: { label: "Actualités", emoji: "📰", sensitive: false },
  adult: { label: "Contenu adulte", emoji: "🔞", sensitive: true },
  gambling: { label: "Jeux d'argent", emoji: "🎰", sensitive: true },
  violence: { label: "Violence", emoji: "⚔️", sensitive: true },
  drugs: { label: "Drogues / Alcool", emoji: "🚬", sensitive: true },
  dating: { label: "Rencontres", emoji: "❤️", sensitive: true },
  streaming: { label: "Streaming", emoji: "🎬", sensitive: false },
  music: { label: "Musique", emoji: "🎵", sensitive: false },
  productivity: { label: "Productivité", emoji: "🗂️", sensitive: false },
  browser: { label: "Navigateur", emoji: "🌐", sensitive: false },
  system: { label: "Système", emoji: "⚙️", sensitive: false },
  developer: { label: "Développement", emoji: "💻", sensitive: false },
  unknown: { label: "Inconnu", emoji: "❓", sensitive: false },
};

/** Categories blocked by default for a "young child" profile. */
export const DEFAULT_BLOCKED_CATEGORIES: Category[] = [
  "adult",
  "gambling",
  "violence",
  "drugs",
  "dating",
];

// ── Domain → category. Keyed by registrable domain or substring. ──
const DOMAIN_CATEGORY: Record<string, Category> = {
  // social
  "facebook.com": "social",
  "instagram.com": "social",
  "tiktok.com": "social",
  "snapchat.com": "social",
  "twitter.com": "social",
  "x.com": "social",
  "reddit.com": "social",
  "pinterest.com": "social",
  "tumblr.com": "social",
  "vk.com": "social",
  "bsky.app": "social",
  // video / streaming
  "youtube.com": "video",
  "youtu.be": "video",
  "vimeo.com": "video",
  "dailymotion.com": "video",
  "twitch.tv": "streaming",
  "netflix.com": "streaming",
  "disneyplus.com": "streaming",
  "primevideo.com": "streaming",
  "hulu.com": "streaming",
  // music
  "spotify.com": "music",
  "deezer.com": "music",
  "soundcloud.com": "music",
  // games
  "roblox.com": "games",
  "epicgames.com": "games",
  "steampowered.com": "games",
  "minecraft.net": "games",
  "miniclip.com": "games",
  "poki.com": "games",
  "crazygames.com": "games",
  // communication
  "gmail.com": "communication",
  "mail.google.com": "communication",
  "outlook.com": "communication",
  "discord.com": "communication",
  "whatsapp.com": "communication",
  "telegram.org": "communication",
  "messenger.com": "communication",
  // education
  "wikipedia.org": "education",
  "khanacademy.org": "education",
  "duolingo.com": "education",
  "coursera.org": "education",
  "scratch.mit.edu": "education",
  "education.gouv.fr": "education",
  "google.com": "browser",
  "bing.com": "browser",
  "duckduckgo.com": "browser",
  // shopping
  "amazon.com": "shopping",
  "amazon.fr": "shopping",
  "aliexpress.com": "shopping",
  "ebay.com": "shopping",
  // news
  "lemonde.fr": "news",
  "bbc.com": "news",
  "cnn.com": "news",
  // dev
  "github.com": "developer",
  "stackoverflow.com": "developer",
};

// Substring signals for sensitive categories (defensive defaults).
const SENSITIVE_SIGNALS: { match: RegExp; category: Category }[] = [
  { match: /porn|xxx|sex|hentai|nude|escort|camgirl|onlyfans|brazzers|xvideos|xnxx|redtube|youporn/i, category: "adult" },
  { match: /casino|bet365|pokerstars|gambl|betting|roulette|1xbet|stake\.com/i, category: "gambling" },
  { match: /tinder|grindr|badoo|bumble|adultfriend|ashleymadison/i, category: "dating" },
  { match: /\b(cocaine|cannabis|weed-shop|buy-drugs)\b/i, category: "drugs" },
];

export function normalizeDomain(input: string): string {
  let d = input.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "").replace(/^www\./, "");
  d = d.split("/")[0].split("?")[0].split(":")[0];
  return d;
}

/** Returns the registrable-ish domain (last two labels). */
export function registrableDomain(domain: string): string {
  const parts = normalizeDomain(domain).split(".");
  if (parts.length <= 2) return parts.join(".");
  return parts.slice(-2).join(".");
}

export function categorizeDomain(input: string): Category {
  const domain = normalizeDomain(input);
  const reg = registrableDomain(domain);

  if (DOMAIN_CATEGORY[domain]) return DOMAIN_CATEGORY[domain];
  if (DOMAIN_CATEGORY[reg]) return DOMAIN_CATEGORY[reg];

  for (const sig of SENSITIVE_SIGNALS) {
    if (sig.match.test(domain)) return sig.category;
  }
  return "unknown";
}

// ── App (process / package) → category ──
const APP_CATEGORY: { match: RegExp; category: Category; name?: string }[] = [
  { match: /chrome|firefox|msedge|opera|brave|browser/i, category: "browser" },
  { match: /steam|epicgames|roblox|minecraft|leagueclient|valorant|fortnite|origin|battle\.net|riotclient/i, category: "games" },
  { match: /discord/i, category: "communication" },
  { match: /whatsapp|telegram|signal|messenger|skype|zoom|teams/i, category: "communication" },
  { match: /spotify|deezer|itunes|musicbee/i, category: "music" },
  { match: /vlc|netflix|wmplayer|potplayer/i, category: "streaming" },
  { match: /tiktok|instagram|snapchat|facebook|twitter/i, category: "social" },
  { match: /word|excel|powerpnt|onenote|outlook|acrobat|notion|obsidian/i, category: "productivity" },
  { match: /code|devenv|pycharm|idea|sublime|node|python|git/i, category: "developer" },
  { match: /explorer|svchost|taskmgr|cmd|powershell|settings|systemsettings|dwm|winlogon/i, category: "system" },
];

export function categorizeApp(appId: string, appName?: string): Category {
  const hay = `${appId} ${appName ?? ""}`.toLowerCase();
  for (const rule of APP_CATEGORY) {
    if (rule.match.test(hay)) return rule.category;
  }
  return "unknown";
}

/** Bundled default blocklist domains (seed for new profiles). */
export const DEFAULT_BLOCKLIST: string[] = [
  "pornhub.com",
  "xvideos.com",
  "xnxx.com",
  "redtube.com",
  "youporn.com",
  "onlyfans.com",
  "stake.com",
  "1xbet.com",
  "bet365.com",
  "tinder.com",
];
