import { useEffect, useState, useCallback } from "react";
import { View, Text, FlatList, StyleSheet, Pressable, RefreshControl, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { parent, type Child, type Alert } from "@/api";
import * as storage from "@/storage";

export default function ParentHome() {
  const [children, setChildren] = useState<Child[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, a] = await Promise.all([parent.children(), parent.alerts()]);
      setChildren(c.children);
      setAlerts(a.alerts.slice(0, 5));
    } catch {
      router.replace("/login");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function logout() {
    await storage.clearAll();
    router.replace("/login");
  }

  if (loading) return <View style={s.center}><ActivityIndicator color="#4f46e5" size="large" /></View>;

  return (
    <FlatList
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16 }}
      data={children}
      keyExtractor={(c) => c.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      ListHeaderComponent={
        <View>
          <Text style={s.h1}>Mes enfants</Text>
        </View>
      }
      renderItem={({ item }) => {
        const online = item.devices.filter((d) => d.online).length;
        return (
          <Pressable style={s.card}>
            <Text style={s.avatar}>{item.avatar ?? "🧒"}</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{item.name}</Text>
              <Text style={s.sub}>{item.devices.length} appareil(s) · {online} en ligne</Text>
            </View>
            <View style={[s.dot, { backgroundColor: online ? "#10b981" : "#cbd5e1" }]} />
          </Pressable>
        );
      }}
      ListFooterComponent={
        <View style={{ marginTop: 16 }}>
          <Text style={s.h2}>Alertes récentes</Text>
          {alerts.length === 0 ? (
            <Text style={s.sub}>Aucune alerte ✅</Text>
          ) : (
            alerts.map((a) => (
              <View key={a.id} style={s.alert}>
                <Text style={s.alertMsg}>{a.message}</Text>
                <Text style={s.sub}>{a.child.name}</Text>
              </View>
            ))
          )}
          <Pressable style={s.logout} onPress={logout}>
            <Text style={{ color: "#ef4444", fontWeight: "600" }}>Déconnexion</Text>
          </Pressable>
        </View>
      }
    />
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  h1: { fontSize: 24, fontWeight: "800", marginBottom: 12 },
  h2: { fontSize: 18, fontWeight: "700", marginBottom: 8 },
  card: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: "#e2e8f0" },
  avatar: { fontSize: 30, marginRight: 12 },
  name: { fontSize: 16, fontWeight: "700" },
  sub: { color: "#64748b", fontSize: 13 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  alert: { backgroundColor: "#fff", borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: "#e2e8f0" },
  alertMsg: { fontSize: 14, fontWeight: "500" },
  logout: { marginTop: 24, alignItems: "center", padding: 14 },
});
