import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "../src/location-task"; // registers the background location task at startup

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: "#4f46e5" },
          headerTintColor: "#fff",
          headerTitleStyle: { fontWeight: "800" },
          contentStyle: { backgroundColor: "#f6f7fb" },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ title: "Kidora" }} />
        <Stack.Screen name="parent" options={{ title: "Ma famille" }} />
        <Stack.Screen name="child-mode" options={{ title: "Mode enfant" }} />
      </Stack>
    </>
  );
}
