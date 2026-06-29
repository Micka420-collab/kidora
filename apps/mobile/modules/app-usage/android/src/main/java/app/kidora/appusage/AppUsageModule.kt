package app.kidora.appusage

import android.app.AppOpsManager
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.os.Process
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.Calendar

// Reports per-app foreground time using Android's UsageStatsManager.
// Requires the PACKAGE_USAGE_STATS "Usage access" special permission,
// which the user must grant manually in system settings.
class AppUsageModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AppUsage")

    Function("hasPermission") {
      val ctx = appContext.reactContext ?: return@Function false
      val appOps = ctx.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
      val mode = appOps.unsafeCheckOpNoThrow(
        AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), ctx.packageName
      )
      mode == AppOpsManager.MODE_ALLOWED
    }

    Function("openSettings") {
      val ctx = appContext.reactContext ?: return@Function
      val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      ctx.startActivity(intent)
    }

    AsyncFunction("getUsageToday") {
      val ctx = appContext.reactContext ?: return@AsyncFunction emptyList<Map<String, Any>>()
      val usm = ctx.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
      val cal = Calendar.getInstance().apply {
        set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0)
        set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
      }
      val stats = usm.queryUsageStats(
        UsageStatsManager.INTERVAL_DAILY, cal.timeInMillis, System.currentTimeMillis()
      ) ?: emptyList()
      val pm = ctx.packageManager
      stats.filter { it.totalTimeInForeground > 0 }.map { u ->
        val label = try {
          pm.getApplicationLabel(pm.getApplicationInfo(u.packageName, 0)).toString()
        } catch (e: Exception) { u.packageName }
        mapOf(
          "packageName" to u.packageName,
          "appName" to label,
          "totalSeconds" to (u.totalTimeInForeground / 1000).toInt()
        )
      }
    }
  }
}
