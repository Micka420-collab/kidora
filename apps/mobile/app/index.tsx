import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import Constants from "expo-constants";
import * as storage from "@/storage";

const ROLE = (Constants.expoConfig?.extra?.role as "parent" | "child") ?? "parent";

// Role is fixed per app (two separate Android apps):
//  - Kidora Kids   → child enrollment / child-mode
//  - Kidora Parents → parent login / dashboard
export default function Index() {
  useEffect(() => {
    (async () => {
      if (ROLE === "child") {
        const enrollToken = await storage.get("enrollToken");
        router.replace(enrollToken ? "/child-mode" : "/login");
      } else {
        const parentToken = await storage.get("parentToken");
        router.replace(parentToken ? "/parent" : "/login");
      }
    })();
  }, []);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#4f46e5" }}>
      <ActivityIndicator color="#fff" size="large" />
    </View>
  );
}
