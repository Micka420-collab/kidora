import type { ExpoConfig } from "expo/config";

// Two apps from one codebase, selected by APP_ROLE at build time:
//   APP_ROLE=parent  → "Kidora Parents"  (companion: voir/gérer)
//   APP_ROLE=child   → "Kidora Kids"     (appareil enfant: surveillance + SOS)
// Each variant has its own package name → two separate Android apps.
const ROLE = (process.env.APP_ROLE === "child" ? "child" : "parent") as "parent" | "child";
const isChild = ROLE === "child";

// Per-role brand assets so the two installed apps are visually distinct.
const ICON = isChild ? "./assets/icon-child.png" : "./assets/icon-parent.png";
const ADAPTIVE = isChild ? "./assets/adaptive-child.png" : "./assets/adaptive-parent.png";
const SPLASH_BG = isChild ? "#ede9fe" : "#eef2ff"; // violet-100 / indigo-50 tints
const easProjectId = isChild ? process.env.EAS_PROJECT_ID_CHILD : process.env.EAS_PROJECT_ID_PARENT;

const config: ExpoConfig = {
  owner: "kidora-team", // EAS organization that owns both app projects
  name: isChild ? "Kidora Kids" : "Kidora Parents",
  slug: isChild ? "kidora-child" : "kidora-parent",
  scheme: isChild ? "kidorachild" : "kidoraparent",
  version: "1.0.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic", // supports dark mode
  newArchEnabled: true,
  icon: ICON,
  splash: { image: "./assets/splash-icon.png", resizeMode: "contain", backgroundColor: SPLASH_BG },
  web: { favicon: "./assets/favicon.png" },
  ios: {
    supportsTablet: true,
    bundleIdentifier: isChild ? "app.kidora.child" : "app.kidora.parent",
    infoPlist: isChild
      ? {
          NSLocationWhenInUseUsageDescription: "Kidora partage la position de l'enfant avec ses parents.",
          NSLocationAlwaysAndWhenInUseUsageDescription: "Kidora partage la position en arrière-plan pour la sécurité de l'enfant.",
          UIBackgroundModes: ["location", "fetch"],
        }
      : {},
  },
  android: {
    package: isChild ? "app.kidora.child" : "app.kidora.parent",
    adaptiveIcon: { foregroundImage: ADAPTIVE, backgroundColor: SPLASH_BG },
    permissions: isChild
      ? [
          "ACCESS_FINE_LOCATION",
          "ACCESS_COARSE_LOCATION",
          "ACCESS_BACKGROUND_LOCATION",
          "FOREGROUND_SERVICE",
          "FOREGROUND_SERVICE_LOCATION",
          // DNS-filtering VpnService (web filter) runs as a "specialUse" FGS.
          "FOREGROUND_SERVICE_SPECIAL_USE",
          "PACKAGE_USAGE_STATS",
          "RECEIVE_BOOT_COMPLETED",
          // Local notifications for safe-zone enter/exit on the child device.
          "POST_NOTIFICATIONS",
          // SMS monitoring (sent/received) — requires a native module + manual
          // grant; restricted by Google Play (parental-control use case).
          "READ_SMS",
          "RECEIVE_SMS",
        ]
      : ["POST_NOTIFICATIONS"],
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    // minSdk 24 (Android 7.0) is RN 0.76's hard floor — react-android:0.76.5
    // declares minSdk 24, so a lower value fails the release manifest merger.
    // API 24 still covers ~97% of active Android devices.
    // kotlinVersion 1.9.25: expo-modules-core (SDK 52) ships Compose Compiler
    // 1.5.15 which requires exactly Kotlin 1.9.25 — RN 0.76's default 1.9.24
    // fails :expo-modules-core:compileReleaseKotlin on EAS.
    ["expo-build-properties", { android: { minSdkVersion: 24, compileSdkVersion: 35, targetSdkVersion: 35, kotlinVersion: "1.9.25" } }],
    ...(isChild
      ? [
          ["expo-location", { locationAlwaysAndWhenInUsePermission: "Kidora partage la position de l'enfant avec ses parents." }] as [string, Record<string, unknown>],
          "expo-notifications" as unknown as string,
        ]
      : []),
  ],
  extra: {
    role: ROLE,
    defaultServer: process.env.KIDORA_SERVER || "http://localhost:3000",
    // Each variant is its own EAS project (distinct slug). `eas init` links one
    // per role; supply the ids via env so CI can build non-interactively.
    eas: easProjectId ? { projectId: easProjectId } : undefined,
  },
};

export default config;
