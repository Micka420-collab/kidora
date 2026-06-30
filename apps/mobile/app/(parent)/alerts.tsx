import { useCallback, useMemo, useState } from "react";
import { View, Text, ScrollView, RefreshControl, Pressable } from "react-native";
import { useFocusEffect, router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { parent, type Alert } from "@/api";
import { useTheme, relativeTime, alertMeta, space, radius } from "@/theme";
import { Card, Avatar, Muted, IconBubble, Empty, Skeleton, H1, ErrorState } from "@/ui";

type Filter = "all" | "unread" | "critical" | "warning";

function matches(a: Alert, f: Filter): boolean {
  if (f === "unread") return !a.read;
  if (f === "critical") return alertMeta(a.type).tone === "danger";
  if (f === "warning") return alertMeta(a.type).tone === "warn";
  return true;
}

export default function Alerts() {
  const { c } = useTheme();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [unread, setUnread] = useState(0);
  const [filter, setFilter] = useState<Filter>("all");
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

  // Mark a single alert read (optimistic) on tap, then open the child.
  function openAlert(a: Alert) {
    if (!a.read) {
      setAlerts((prev) => prev.map((x) => (x.id === a.id ? { ...x, read: true } : x)));
      setUnread((u) => Math.max(0, u - 1));
      parent.markAlertRead(a.id).catch(() => { /* best-effort */ });
    }
    router.push(`/child/${a.childId}`);
  }

  const counts = useMemo(() => ({
    all: alerts.length,
    unread: alerts.filter((a) => !a.read).length,
    critical: alerts.filter((a) => alertMeta(a.type).tone === "danger").length,
    warning: alerts.filter((a) => alertMeta(a.type).tone === "warn").length,
  }), [alerts]);
  const shown = useMemo(() => alerts.filter((a) => matches(a, filter)), [alerts, filter]);
  const FILTERS: { key: Filter; label: string }[] = [
    { key: "all", label: "Toutes" },
    { key: "unread", label: "Non lues" },
    { key: "critical", label: "Critiques" },
    { key: "warning", label: "Avertissements" },
  ];

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

      {/* filter chips */}
      {!loading && !error && alerts.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.sm, paddingBottom: space.sm }}>
          {FILTERS.map((f) => {
            const on = filter === f.key;
            return (
              <Pressable key={f.key} onPress={() => setFilter(f.key)} accessibilityLabel={f.label} accessibilityState={{ selected: on }} style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.97 : 1 }] })}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 13, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: on ? c.primary : c.surfaceAlt, borderWidth: 1, borderColor: on ? c.primary : c.border }}>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: on ? c.onPrimary : c.textMuted }}>{f.label}</Text>
                  <View style={{ minWidth: 18, paddingHorizontal: 5, paddingVertical: 1, borderRadius: radius.pill, backgroundColor: on ? "#ffffff33" : c.tint }}>
                    <Text style={{ fontSize: 11, fontWeight: "800", color: on ? c.onPrimary : c.primaryDark, textAlign: "center" }}>{counts[f.key]}</Text>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

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
        ) : shown.length === 0 ? (
          <Empty icon="filter" title="Aucune alerte" subtitle={`Aucune alerte « ${FILTERS.find((f) => f.key === filter)?.label.toLowerCase()} ».`} />
        ) : (
          shown.map((a) => <AlertItem key={a.id} alert={a} onOpen={openAlert} />)
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function AlertItem({ alert, onOpen }: { alert: Alert; onOpen: (a: Alert) => void }) {
  const { c } = useTheme();
  const meta = alertMeta(alert.type);
  const tone = meta.tone === "danger" ? c.danger : meta.tone === "warn" ? c.warn : c.info;
  return (
    <Card
      padded
      onPress={() => onOpen(alert)}
      accessibilityLabel={`Alerte ${alert.child.name} : ${alert.message}`}
      style={alert.read ? undefined : { borderColor: tone + "55", borderWidth: 1 }}
    >
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
