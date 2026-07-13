package app.kidora.dnsfilter

// Faithful Kotlin port of ../../webfilter.ts (itself mirroring the desktop agent's
// apps/agent-windows/lib/domains.js). Keep the three in sync — the JS side has a
// parity test pinning this mapping. Pure logic, no Android deps, so it can be
// unit-tested with Robolectric/JUnit if a device harness is added later.
object DomainRules {

  private val DOMAIN_CATEGORY: Map<String, String> = mapOf(
    "facebook.com" to "social", "instagram.com" to "social", "tiktok.com" to "social",
    "snapchat.com" to "social", "twitter.com" to "social", "x.com" to "social",
    "reddit.com" to "social", "pinterest.com" to "social", "tumblr.com" to "social",
    "vk.com" to "social", "bsky.app" to "social",
    "youtube.com" to "video", "youtu.be" to "video", "vimeo.com" to "video", "dailymotion.com" to "video",
    "twitch.tv" to "streaming", "netflix.com" to "streaming", "disneyplus.com" to "streaming",
    "primevideo.com" to "streaming", "hulu.com" to "streaming",
    "spotify.com" to "music", "deezer.com" to "music", "soundcloud.com" to "music",
    "roblox.com" to "games", "epicgames.com" to "games", "steampowered.com" to "games",
    "minecraft.net" to "games", "miniclip.com" to "games", "poki.com" to "games", "crazygames.com" to "games",
    "gmail.com" to "communication", "mail.google.com" to "communication", "outlook.com" to "communication",
    "discord.com" to "communication", "whatsapp.com" to "communication", "telegram.org" to "communication",
    "messenger.com" to "communication",
    "wikipedia.org" to "education", "khanacademy.org" to "education", "duolingo.com" to "education",
    "coursera.org" to "education", "scratch.mit.edu" to "education", "education.gouv.fr" to "education",
    "google.com" to "browser", "bing.com" to "browser", "duckduckgo.com" to "browser",
    "amazon.com" to "shopping", "amazon.fr" to "shopping", "aliexpress.com" to "shopping", "ebay.com" to "shopping",
    "lemonde.fr" to "news", "bbc.com" to "news", "cnn.com" to "news",
    "github.com" to "developer", "stackoverflow.com" to "developer",
  )

  private data class Signal(val regex: Regex, val category: String)

  private val SENSITIVE_SIGNALS = listOf(
    Signal(Regex("porn|xxx|sex|hentai|nude|escort|camgirl|onlyfans|brazzers|xvideos|xnxx|redtube|youporn", RegexOption.IGNORE_CASE), "adult"),
    Signal(Regex("casino|bet365|pokerstars|gambl|betting|roulette|1xbet|stake\\.com", RegexOption.IGNORE_CASE), "gambling"),
    Signal(Regex("tinder|grindr|badoo|bumble|adultfriend|ashleymadison", RegexOption.IGNORE_CASE), "dating"),
    Signal(Regex("\\b(cocaine|cannabis|weed-shop|buy-drugs)\\b", RegexOption.IGNORE_CASE), "drugs"),
  )

  val SAFESEARCH_MAP: Map<String, String> = mapOf(
    "google.com" to "forcesafesearch.google.com",
    "www.google.com" to "forcesafesearch.google.com",
    "youtube.com" to "restrict.youtube.com",
    "www.youtube.com" to "restrict.youtube.com",
    "m.youtube.com" to "restrict.youtube.com",
    "youtubei.googleapis.com" to "restrict.youtube.com",
    "bing.com" to "strict.bing.com",
    "www.bing.com" to "strict.bing.com",
    "duckduckgo.com" to "safe.duckduckgo.com",
  )

  fun normalizeDomain(input: String?): String {
    var d = (input ?: "").trim().lowercase()
    d = d.removePrefix("https://").removePrefix("http://").removePrefix("www.")
    d = d.substringBefore("/").substringBefore("?").substringBefore(":")
    return d
  }

  fun registrableDomain(domain: String): String {
    val parts = normalizeDomain(domain).split(".").filter { it.isNotEmpty() }
    if (parts.size <= 2) return parts.joinToString(".")
    return parts.takeLast(2).joinToString(".")
  }

  fun categorizeDomain(input: String): String {
    val domain = normalizeDomain(input)
    DOMAIN_CATEGORY[domain]?.let { return it }
    DOMAIN_CATEGORY[registrableDomain(domain)]?.let { return it }
    for (sig in SENSITIVE_SIGNALS) if (sig.regex.containsMatchIn(domain)) return sig.category
    return "unknown"
  }

  private fun suffixMatch(domain: String, set: Set<String>): Boolean {
    for (raw in set) {
      val d = normalizeDomain(raw)
      if (d.isEmpty()) continue
      if (domain == d || domain.endsWith(".$d")) return true
    }
    return false
  }

  sealed class Decision {
    data class Allow(val reason: String) : Decision()
    data class Block(val reason: String) : Decision()
    data class SafeSearch(val target: String) : Decision()
  }

  /** Immutable policy snapshot the VpnService reads per DNS query. */
  data class Policy(
    val blockedDomains: Set<String> = emptySet(),
    val allowedDomains: Set<String> = emptySet(),
    val blockedCategories: Set<String> = emptySet(),
    val blockUnknown: Boolean = false,
    val safeSearch: Boolean = true,
  )

  /** Decision order mirrors the desktop proxy and webfilter.ts exactly. */
  fun decide(host: String, p: Policy): Decision {
    val domain = normalizeDomain(host)

    if (suffixMatch(domain, p.allowedDomains)) return Decision.Allow("allowlist")

    if (p.safeSearch) {
      val target = SAFESEARCH_MAP[domain] ?: SAFESEARCH_MAP[registrableDomain(domain)]
      if (target != null && target != domain) return Decision.SafeSearch(target)
    }

    if (suffixMatch(domain, p.blockedDomains)) return Decision.Block("blocklist")

    val cat = categorizeDomain(domain)
    if (p.blockedCategories.contains(cat)) return Decision.Block("category:$cat")
    if (p.blockUnknown && cat == "unknown") return Decision.Block("unknown")

    return Decision.Allow("ok")
  }
}
