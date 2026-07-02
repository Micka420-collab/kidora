import ExpoModulesCore

// iOS cannot force-close arbitrary apps like Android's AccessibilityService.
// App restriction on iOS goes through Apple's Screen Time stack — FamilyControls
// (authorization) + ManagedSettings (shielding apps) + DeviceActivity — which
// needs the `com.apple.developer.family-controls` entitlement (granted by Apple)
// and a companion app extension. This module therefore reports "unavailable" on
// iOS; callers fall back to no-op (see index.ts `isAvailable`).
public class AppBlockerModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AppBlocker")

    Function("isEnabled") { () -> Bool in
      return false
    }

    Function("openSettings") {
      // No-op on iOS; restriction is configured via the FamilyControls flow.
    }

    Function("setBlockedPackages") { (_ packages: [String]) in
      // No-op on iOS.
    }

    Function("setPaused") { (_ paused: Bool) in
      // No-op on iOS.
    }
  }
}
