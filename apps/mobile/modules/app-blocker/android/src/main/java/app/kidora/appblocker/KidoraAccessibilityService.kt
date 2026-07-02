package app.kidora.appblocker

import android.accessibilityservice.AccessibilityService
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.media.AudioManager
import android.os.Handler
import android.os.Looper
import android.view.accessibility.AccessibilityEvent
import android.widget.Toast

// Watches which app comes to the foreground and, if the parent's policy blocks it
// (or the child is paused), sends it straight back to the launcher. It only reads
// the foreground package name from window-state events — never screen content.
//
// NOTE (Android limitation): without Device Owner / MDM, a determined user can
// still disable this service from Settings > Accessibility. We therefore never
// block Settings/launcher/system UI, which would trap the device. This mirrors
// what consumer parental-control apps can do on stock Android.
class KidoraAccessibilityService : AccessibilityService() {
  private val prefs: SharedPreferences by lazy {
    getSharedPreferences(PREFS, Context.MODE_PRIVATE)
  }
  private val main = Handler(Looper.getMainLooper())
  private var lastBlockedAt = 0L

  // Packages that must never be blocked, or the device becomes unusable. The
  // default launcher(s) are resolved at runtime (OEM launchers vary widely).
  private val launcherPkgs: Set<String> by lazy { resolveLaunchers() }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    if (event == null || event.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return
    val pkg = event.packageName?.toString().orEmpty()
    if (pkg.isBlank() || pkg == packageName || isExempt(pkg)) return
    // Never interfere while a call is active — the child must always be able to
    // reach a parent or emergency services, even during a pause.
    if (isCallActive()) return

    val paused = prefs.getBoolean(KEY_PAUSED, false)
    val blocked = prefs.getStringSet(KEY_BLOCKED, emptySet()) ?: emptySet()
    if (!(paused || blocked.contains(pkg))) return

    // Debounce: one window transition can emit several events.
    val now = System.currentTimeMillis()
    if (now - lastBlockedAt < 500) return
    lastBlockedAt = now

    performGlobalAction(GLOBAL_ACTION_HOME)
    val label = if (paused) "Kidora : c'est l'heure d'une pause 😌" else "Kidora : application bloquée 🛡️"
    main.post { Toast.makeText(applicationContext, label, Toast.LENGTH_SHORT).show() }
  }

  override fun onInterrupt() {}

  private fun isExempt(pkg: String): Boolean {
    return pkg in launcherPkgs ||
      pkg == "com.android.settings" ||
      pkg.startsWith("com.android.systemui") ||
      pkg.startsWith("com.android.inputmethod") ||
      pkg.startsWith("com.google.android.inputmethod") ||
      pkg.startsWith("com.samsung.android.honeyboard") || // common OEM keyboard
      // Phone / dialer / in-call UI — the child must always be able to call for
      // help. Covers stock + Google + OEM dialers and the emergency dialer.
      pkg == "com.android.phone" ||
      pkg == "com.android.server.telecom" ||
      pkg.contains("dialer") ||
      pkg.contains("incallui") ||
      pkg.contains("emergency")
  }

  private fun isCallActive(): Boolean {
    return try {
      val am = getSystemService(Context.AUDIO_SERVICE) as AudioManager
      am.mode == AudioManager.MODE_IN_CALL || am.mode == AudioManager.MODE_IN_COMMUNICATION
    } catch (e: Exception) {
      false
    }
  }

  private fun resolveLaunchers(): Set<String> {
    val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
    return try {
      packageManager.queryIntentActivities(intent, 0)
        .mapNotNull { it.activityInfo?.packageName }
        .toHashSet()
    } catch (e: Exception) {
      hashSetOf("com.android.launcher", "com.google.android.apps.nexuslauncher")
    }
  }

  companion object {
    const val PREFS = "kidora_blocker"
    const val KEY_BLOCKED = "blocked_packages"
    const val KEY_PAUSED = "paused"
  }
}
