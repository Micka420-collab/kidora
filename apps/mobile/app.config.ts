import type { ExpoConfig } from "expo/config";

// Two apps from one codebase, selected by APP_ROLE at build time:
//   APP_ROLE=parent  → "Kidora Parents"  (companion: voir/gérer)
//   APP_ROLE=child   → "Kidora Kids"     (appareil enfant: surveillance + SOS)
// Each variant has its own package name → two separate Android apps.
const ROLE = (process.env.APP_ROLE === "child" ? "child" : "parent") as "parent" | "child";
const isChild = ROLE === "child";

const config: ExpoConfig = {
  name: isChild ? "Kidora Kids" : "Kidora Parents",
  slug: isChild ? "kidora-child" : "kidora-parent",
  scheme: isChild ? "kidorachild" : "kidoraparent",
  version: "1.0.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic", // supports dark mode
  newArchEnabled: true,
  icon: "./assets/icon.png",
  splash: { backgroundColor: "#4f46e5" },
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
    permissions: isChild
      ? [
          "ACCESS_FINE_LOCATION",
          "ACCESS_COARSE_LOCATION",
          "ACCESS_BACKGROUND_LOCATION",
          "FOREGROUND_SERVICE",
          "FOREGROUND_SERVICE_LOCATION",
          "PACKAGE_USAGE_STATS",
          "RECEIVE_BOOT_COMPLETED",
        ]
      : ["POST_NOTIFICATIONS"],
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    // Low minSdk so the app runs on virtually any active Android device.
    ["expo-build-properties", { android: { minSdkVersion: 23, compileSdkVersion: 35, targetSdkVersion: 35 } }],
    ...(isChild
      ? [["expo-location", { locationAlwaysAndWhenInUsePermission: "Kidora partage la position de l'enfant avec ses parents." }]]
      : []),
  ],
  extra: {
    role: ROLE,
    defaultServer: process.env.KIDORA_SERVER || "http://localhost:3000",
  },
};

export default config;
