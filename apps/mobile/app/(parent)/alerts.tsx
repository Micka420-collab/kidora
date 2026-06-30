import { useCallback, useState } from "react";
import { View, Text, ScrollView, RefreshControl, Pressable } from "react-native";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { parent, type Alert } from "@/api";
import { useTheme, relativeTime, alertMeta, space, radius } from "@/theme";
import { Card, Avatar, Muted, IconBubble, Empty, Skeleton, H1, ErrorState } from "@/ui";

export default function Alerts() {
  const { c } = useTheme();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const a = await parent.alerts();
      setAlerts(a.alerts);
      setUnread(a.unread);
      setError(false);
    } catch { setError(true); } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function markAll() {
    setAlerts((prev) => prev.map((a) => ({ ...a, read: true })));
    setUnread(0);
    try { await parent.markAlertsRead(); } catch { /* ignore */ }
  }

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm }}>
        <View>
          <H1>Alertes</H1>
          {unread > 0 && <Muted style={{ color: c.primary, fontWeight: "700" }}>{unread} non lue{unread > 1 ? "s" : ""}</Muted>}
        </View>
        {unread > 0 && (
          <Pressable onPress={markAll} accessibilityLabel="Tout marquer comme lu" style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: c.tint, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill }}>
            <Ionicons name="checkmark-done" size={15} color={c.primaryDark} />
            <Text style={{ color: c.primaryDark, fontWeight: "700", fontSize: 13 }}>Tout lu</Text>
          </Pressable>
        )}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: space.lg, paddingTop: space.sm, paddingBottom: space.xxxl, gap: space.sm }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={c.primary} colors={[c.primary]} />}
      >
        {loading ? (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} height={72} />)
        ) : error ? (
          <ErrorState onRetry={() => { setLoading(true); load(); }} />
        ) : alerts.length === 0 ? (
          <Empty icon="shield-checkmark" title="Aucune alerte" subtitle="Tout va bien. Les alertes (SOS, zones, limites, mots-clés) apparaîtront ici." />
        ) : (
          alerts.map((a) => <AlertItem key={a.id} alert={a} />)
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function AlertItem({ alert }: { alert: Alert }) {
  const { c } = useTheme();
  const meta = alertMeta(alert.type);
  const tone = meta.tone === "danger" ? c.danger : meta.tone === "warn" ? c.warn : c.info;
  return (
    <Card padded style={alert.read ? undefined : { borderColor: tone + "55", borderWidth: 1 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
        <IconBubble icon={meta.icon} color={tone} size={42} />
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={{ fontSize: 14, fontWeight: "600", color: c.text }}>{alert.message}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Avatar emoji={alert.child.avatar} size={18} />
            <Muted>{alert.child.name} · {relativeTime(alert.ts)}</Muted>
          </View>
        </View>
        {!alert.read && <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: tone }} />}
      </View>
    </Card>
  );
}
