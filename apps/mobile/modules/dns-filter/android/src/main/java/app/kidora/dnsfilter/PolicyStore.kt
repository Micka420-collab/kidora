package app.kidora.dnsfilter

import android.content.Context

// The web-filter policy is written by the JS bridge (DnsFilterModule.setPolicy)
// into SharedPreferences and read by the VpnService per DNS query. Persisting it
// means the filter keeps working across service restarts (and reboots) without a
// round-trip to JS.
object PolicyStore {
  const val PREFS = "kidora_dns_filter"
  const val KEY_BLOCKED_DOMAINS = "blocked_domains"
  const val KEY_ALLOWED_DOMAINS = "allowed_domains"
  const val KEY_BLOCKED_CATEGORIES = "blocked_categories"
  const val KEY_BLOCK_UNKNOWN = "block_unknown"
  const val KEY_SAFE_SEARCH = "safe_search"

  private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun save(
    ctx: Context,
    blockedDomains: List<String>,
    allowedDomains: List<String>,
    blockedCategories: List<String>,
    blockUnknown: Boolean,
    safeSearch: Boolean,
  ) {
    prefs(ctx).edit()
      .putStringSet(KEY_BLOCKED_DOMAINS, HashSet(blockedDomains))
      .putStringSet(KEY_ALLOWED_DOMAINS, HashSet(allowedDomains))
      .putStringSet(KEY_BLOCKED_CATEGORIES, HashSet(blockedCategories))
      .putBoolean(KEY_BLOCK_UNKNOWN, blockUnknown)
      .putBoolean(KEY_SAFE_SEARCH, safeSearch)
      .apply()
  }

  fun current(ctx: Context): DomainRules.Policy {
    val p = prefs(ctx)
    return DomainRules.Policy(
      blockedDomains = p.getStringSet(KEY_BLOCKED_DOMAINS, emptySet()) ?: emptySet(),
      allowedDomains = p.getStringSet(KEY_ALLOWED_DOMAINS, emptySet()) ?: emptySet(),
      blockedCategories = p.getStringSet(KEY_BLOCKED_CATEGORIES, emptySet()) ?: emptySet(),
      blockUnknown = p.getBoolean(KEY_BLOCK_UNKNOWN, false),
      safeSearch = p.getBoolean(KEY_SAFE_SEARCH, true),
    )
  }
}
