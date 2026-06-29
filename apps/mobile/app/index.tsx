import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import * as storage from "@/storage";

// Decide where to send the user based on previously stored role.
export default function Index() {
  useEffect(() => {
    (async () => {
      const role = await storage.get("role");
      const parentToken = await storage.get("parentToken");
      const enrollToken = await storage.get("enrollToken");
      if (role === "parent" && parentToken) router.replace("/parent");
      else if (role === "child" && enrollToken) router.replace("/child-mode");
      else router.replace("/login");
    })();
  }, []);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#4f46e5" }}>
      <ActivityIndicator color="#fff" size="large" />
    </View>
  );
}
