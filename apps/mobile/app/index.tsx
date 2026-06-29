import { useEffect } from "react";
import { Text, ActivityIndicator } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import Constants from "expo-constants";
import * as Linking from "expo-linking";
import { childAgent } from "@/api";
import * as storage from "@/storage";

const ROLE = (Constants.expoConfig?.extra?.role as "parent" | "child") ?? "parent";

// Role is fixed per app (two separate Android apps):
//  - Kidora Kids    → child enrollment (incl. QR deep-link) / child-mode
//  - Kidora Parents → parent login / dashboard
export default function Index() {
  useEffect(() => {
    (async () => {
      if (ROLE === "child") {
        // QR pairing: scanning kidorachild://enroll?token=...&server=... opens the
        // app via this deep link and enrolls automatically.
        try {
          const initial = await Linking.getInitialURL();
          if (initial) {
            const { hostname, queryParams } = Linking.parse(initial);
            const token = queryParams?.token as string | undefined;
            const server = (queryParams?.server as string | undefined) ?? undefined;
            if (hostname === "enroll" && token && server) {
              await childAgent.enroll(token, server, { model: "Mobile", agentVersion: "1.0.0" });
              router.replace("/child-mode");
              return;
            }
          }
        } catch {
          /* fall through to manual enrollment */
        }
        const enrollToken = await storage.get("enrollToken");
        router.replace(enrollToken ? "/child-mode" : "/login");
      } else {
        const parentToken = await storage.get("parentToken");
        router.replace(parentToken ? "/(parent)" : "/login");
      }
    })();
  }, []);

  return (
    <LinearGradient colors={["#818cf8", "#6366f1", "#4338ca"]} style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 18 }}>
      <Text style={{ fontSize: 64 }}>🛡️</Text>
      <Text style={{ color: "#fff", fontSize: 30, fontWeight: "800", letterSpacing: 0.5 }}>Kidora</Text>
      <ActivityIndicator color="#ffffffcc" />
    </LinearGradient>
  );
}
