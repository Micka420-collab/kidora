package app.kidora.dnsfilter

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.VpnService
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// JS bridge for the DNS-filter VPN. The policy is written to SharedPreferences
// (read by DnsVpnService per query). Starting the VPN needs the one-time system
// consent dialog; on approval we start the service from the activity-result hook.
class DnsFilterModule : Module() {
  private var pendingStart = false

  override fun definition() = ModuleDefinition {
    Name("DnsFilter")

    Function("isRunning") {
      DnsFilterState.running
    }

    // True when starting the VPN would still show Android's consent dialog.
    Function("needsConsent") {
      val ctx = appContext.reactContext ?: return@Function false
      VpnService.prepare(ctx) != null
    }

    Function("setPolicy") { cfg: Map<String, Any?> ->
      val ctx = appContext.reactContext ?: return@Function
      PolicyStore.save(
        ctx,
        blockedDomains = stringList(cfg["blockedDomains"]),
        allowedDomains = stringList(cfg["allowedDomains"]),
        blockedCategories = stringList(cfg["blockedCategories"]),
        blockUnknown = cfg["blockUnknown"] as? Boolean ?: false,
        safeSearch = cfg["safeSearch"] as? Boolean ?: true,
      )
    }

    // Returns true if the VPN was started synchronously (consent already granted).
    // If consent is required, launches the system dialog and returns false; the
    // service is started from OnActivityResult once the user approves.
    AsyncFunction("start") { promise: expo.modules.kotlin.Promise ->
      val ctx = appContext.reactContext
      if (ctx == null) { promise.resolve(false); return@AsyncFunction }
      val consent = VpnService.prepare(ctx)
      if (consent == null) {
        startService(ctx)
        promise.resolve(true)
      } else {
        val activity = appContext.currentActivity
        if (activity == null) { promise.resolve(false); return@AsyncFunction }
        pendingStart = true
        activity.startActivityForResult(consent, VPN_REQUEST_CODE)
        promise.resolve(false)
      }
    }

    Function("stop") {
      val ctx = appContext.reactContext ?: return@Function
      // stopService (not startService with an action): it isn't subject to the
      // background-start restriction and triggers onDestroy → clean teardown.
      ctx.stopService(Intent(ctx, DnsVpnService::class.java))
      Unit
    }

    OnActivityResult { _, payload ->
      if (payload.requestCode == VPN_REQUEST_CODE && pendingStart) {
        pendingStart = false
        if (payload.resultCode == Activity.RESULT_OK) {
          appContext.reactContext?.let { startService(it) }
        }
      }
    }
  }

  private fun startService(ctx: Context) {
    val intent = Intent(ctx, DnsVpnService::class.java)
    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
      ctx.startForegroundService(intent)
    } else {
      ctx.startService(intent)
    }
  }

  private fun stringList(v: Any?): List<String> = when (v) {
    is List<*> -> v.mapNotNull { it?.toString() }
    else -> emptyList()
  }

  companion object {
    private const val VPN_REQUEST_CODE = 0x4b44 // "KD"
  }
}
