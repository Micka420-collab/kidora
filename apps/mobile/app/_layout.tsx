import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useTheme } from "@/theme";
import "../src/location-task"; // registers the background location task at startup
import "../src/geofence-task"; // registers the native geofencing task at startup

export default function RootLayout() {
  const { c, isDark } = useTheme();
  return (
    <SafeAreaProvider>
      <StatusBar style={isDark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: c.bg },
          animation: "slide_from_right",
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="(parent)" />
        <Stack.Screen name="child/[id]" options={{ presentation: "card" }} />
        <Stack.Screen name="child-mode" />
      </Stack>
    </SafeAreaProvider>
  );
}
