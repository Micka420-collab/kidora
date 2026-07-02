import * as SecureStore from "expo-secure-store";

// Small typed wrapper around expo-secure-store.
const KEYS = {
  server: "kidora.server",
  parentToken: "kidora.parentToken",
  parentName: "kidora.parentName",
  enrollToken: "kidora.enrollToken",
  role: "kidora.role",
  kidsWelcomed: "kidora.kidsWelcomed",
  kidsUsageBaseline: "kidora.kidsUsageBaseline",
  sosQueue: "kidora.sosQueue", // SOS triggered offline, pending flush on reconnect
} as const;

type Key = keyof typeof KEYS;

export async function get(key: Key): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS[key]);
}
export async function set(key: Key, value: string): Promise<void> {
  await SecureStore.setItemAsync(KEYS[key], value);
}
export async function remove(key: Key): Promise<void> {
  await SecureStore.deleteItemAsync(KEYS[key]);
}
export async function clearAll(): Promise<void> {
  await Promise.all(Object.keys(KEYS).map((k) => SecureStore.deleteItemAsync(KEYS[k as Key])));
}
