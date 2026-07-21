import ExpoModulesCore

// iOS web filtering goes through Apple's Network Extension stack
// (NEDNSProxyProvider / NEFilterDataProvider) or a Screen Time
// (FamilyControls + ManagedSettings) content filter — both of which require
// managed-device / special entitlements granted by Apple and a companion
// extension target. This module therefore reports "unavailable" on iOS; callers
// fall back to a no-op (see index.ts `isAvailable`).
public class DnsFilterModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DnsFilter")

    Function("isRunning") { () -> Bool in
      return false
    }

    Function("needsConsent") { () -> Bool in
      return false
    }

    Function("setPolicy") { (_ cfg: [String: Any]) in
      // No-op on iOS.
    }

    AsyncFunction("start") { (promise: Promise) in
      promise.resolve(false)
    }

    Function("stop") {
      // No-op on iOS.
    }
  }
}
