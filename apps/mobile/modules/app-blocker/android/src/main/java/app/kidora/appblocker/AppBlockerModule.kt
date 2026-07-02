package app.kidora.appblocker

import android.content.Context
import android.content.Intent
import android.provider.Settings
import android.text.TextUtils
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// JS bridge for the accessibility-based app blocker. The block list + paused flag
// are written to SharedPreferences, which the AccessibilityService reads on every
// foreground-app change (persisted so it survives the service being restarted).
class AppBlockerModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AppBlocker")

    Function("isEnabled") {
      val ctx = appContext.reactContext ?: return@Function false
      isServiceEnabled(ctx)
    }

    Function("openSettings") {
      val ctx = appContext.reactContext ?: return@Function
      val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      ctx.startActivity(intent)
    }

    Function("setBlockedPackages") { packages: List<String> ->
      val ctx = appContext.reactContext ?: return@Function
      prefs(ctx).edit()
        .putStringSet(KidoraAccessibilityService.KEY_BLOCKED, HashSet(packages))
        .apply()
    }

    Function("setPaused") { paused: Boolean ->
      val ctx = appContext.reactContext ?: return@Function
      prefs(ctx).edit().putBoolean(KidoraAccessibilityService.KEY_PAUSED, paused).apply()
    }
  }

  private fun prefs(ctx: Context) =
    ctx.getSharedPreferences(KidoraAccessibilityService.PREFS, Context.MODE_PRIVATE)

  private fun isServiceEnabled(ctx: Context): Boolean {
    val expected = "${ctx.packageName}/${KidoraAccessibilityService::class.java.name}"
    val enabled = Settings.Secure.getString(
      ctx.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
    ) ?: return false
    val splitter = TextUtils.SimpleStringSplitter(':')
    splitter.setString(enabled)
    while (splitter.hasNext()) {
      if (splitter.next().equals(expected, ignoreCase = true)) return true
    }
    return false
  }
}
