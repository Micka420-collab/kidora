import ExpoModulesCore

// iOS does NOT allow reading arbitrary per-app usage like Android's UsageStatsManager.
// Parental controls on iOS go through Apple's Screen Time stack:
//   FamilyControls (authorization) + DeviceActivity (monitoring) + ManagedSettings (enforcement).
// That requires the `com.apple.developer.family-controls` entitlement (granted by Apple)
// and a DeviceActivityMonitor app extension. This module therefore reports "unsupported"
// for raw usage; enforcement should be implemented via the Screen Time extension.
public class AppUsageModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AppUsage")

    Function("hasPermission") { () -> Bool in
      return false
    }

    Function("openSettings") {
      // No-op on iOS; Screen Time is configured via FamilyControls authorization flow.
    }

    AsyncFunction("getUsageToday") { () -> [[String: Any]] in
      return []
    }
  }
}
