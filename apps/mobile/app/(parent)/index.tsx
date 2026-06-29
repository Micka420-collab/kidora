import { useCallback, useState } from "react";
import { View, Text, Pressable, RefreshControl, ScrollView } from "react-native";
import { useFocusEffect, router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { parent, type Child, type Live, type Alert } from "@/api";
import { useTheme, relativeTime, radius, space, alertMeta } from "@/theme";
import { Card, Avatar, PulseDot, Pill, Muted, SectionHeader, Empty, Skeleton, IconBubble } from "@/ui";

type Enriched = Child & { live?: Live };

function batteryView(level: number | null, color: string) {
  if (level == null) return null;
  const icon = level <= 15 ? "battery-dead" : level <= 50 ? "battery-half" : "battery-full";
  const col = level <= 15 ? "#ef4444" : level <= 30 ? "#f59e0b" : color;
  return { icon, col, label: `${level}%` };
}

export default function Home() {
  const { c, gradient } = useTheme();
  const [kids, setKids] = useState<Enriched[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [{ children }, a] = await Promise.all([parent.children(), parent.alerts()]);
      // enrich each child with a live snapshot (best-effort, parallel)
      const live = await Promise.all(
        children.map((ch) => parent.live(ch.id).catch(() => undefined)),
      );
      setKids(children.map((ch, i) => ({ ...ch, live: live[i] })));
      setAlerts(a.alerts.slice(0, 3));
    } catch {
      router.replace("/login");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onlineCount = kids.filter((k) => k.live?.online ?? k.devices.some((d) => d.online)).length;
  const allPaused = kids.length > 0 && kids.every((k) => k.live?.paused ?? k.paused);

  async function toggleFamilyPause() {
    setBusy(true);
    try { await parent.familyPause(!allPaused); await load(); } finally { setBusy(false); }
  }

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ flex: 1 }}>
        <Hero
          onlineCount={onlineCount}
          total={kids.length}
          allPaused={allPaused}
          onToggle={toggleFamilyPause}
          busy={busy}
          gradient={gradient}
        />
        <View style={{ flex: 1 }}>
          {loading ? (
            <View style={{ padding: space.lg, gap: space.md }}>
              {[0, 1].map((i) => <Skeleton key={i} height={92} />)}
            </View>
          ) : (
            <ChildList kids={kids} alerts={alerts} reload={load} refreshing={refreshing} setRefreshing={setRefreshing} />
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

function Hero({ onlineCount, total, allPaused, onToggle, busy, gradient }: { onlineCount: number; total: number; allPaused: boolean; onToggle: () => void; busy: boolean; gradient: readonly [string, string, ...string[]] }) {
  return (
    <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.xl, borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl }}>
      <Text style={{ color: "#ffffffcc", fontSize: 14, fontWeight: "600" }}>Bonjour 👋</Text>
      <Text style={{ color: "#fff", fontSize: 26, fontWeight: "800", marginTop: 2 }}>Ma famille</Text>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: space.lg }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <PulseDot on={onlineCount > 0} />
          <Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>
            {total === 0 ? "Aucun enfant" : `${onlineCount}/${total} en ligne`}
          </Text>
        </View>
        {total > 0 && (
          <Pressable
            onPress={onToggle}
            disabled={busy}
            accessibilityLabel={allPaused ? "Reprendre pour toute la famille" : "Mettre en pause toute la famille"}
            style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#ffffff22", paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill }}
          >
            <Ionicons name={allPaused ? "play" : "pause"} size={15} color="#fff" />
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>{allPaused ? "Reprendre" : "Pause familiale"}</Text>
          </Pressable>
        )}
      </View>
    </LinearGradient>
  );
}

function ChildList({ kids, alerts, reload, refreshing, setRefreshing }: { kids: Enriched[]; alerts: Alert[]; reload: () => void; refreshing: boolean; setRefreshing: (v: boolean) => void }) {
  const { c } = useTheme();
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxxl, gap: space.sm }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); reload(); }} tintColor={c.primary} colors={[c.primary]} />}
    >
      <SectionHeader title="Enfants" />
      {kids.length === 0 ? (
        <Empty icon="people" title="Aucun enfant" subtitle="Ajoutez un enfant et un appareil depuis le tableau de bord web." />
      ) : (
        <View style={{ gap: space.md }}>
          {kids.map((k) => <ChildCard key={k.id} child={k} />)}
        </View>
      )}

      <View style={{ height: space.lg }} />
      <SectionHeader title="Dernières alertes" actionLabel={alerts.length ? "Tout voir" : undefined} onAction={() => router.push("/(parent)/alerts")} />
      {alerts.length === 0 ? (
        <Card><View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}><Ionicons name="checkmark-circle" size={22} color={c.success} /><Muted>Tout est calme — aucune alerte.</Muted></View></Card>
      ) : (
        <View style={{ gap: space.sm }}>{alerts.map((a) => <AlertRow key={a.id} alert={a} />)}</View>
      )}
    </ScrollView>
  );
}

function ChildCard({ child }: { child: Enriched }) {
  const { c } = useTheme();
  const online = child.live?.online ?? child.devices.some((d) => d.online);
  const paused = child.live?.paused ?? child.paused ?? false;
  const battery = batteryView(child.live?.battery ?? child.devices[0]?.battery ?? null, c.textMuted);
  const alertCount = child._count?.alerts ?? 0;
  const subtitle = child.live?.currentApp
    ? `Utilise ${child.live.currentApp.title}`
    : online ? "En ligne" : `Vu ${relativeTime(child.live?.lastSeen ?? child.devices[0]?.lastSeen ?? null)}`;

  return (
    <Card onPress={() => router.push(`/child/${child.id}`)} padded>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
        <Avatar emoji={child.avatar} online={online} size={54} />
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ fontSize: 16, fontWeight: "800", color: c.text }} numberOfLines={1}>{child.name}</Text>
            {paused && <Pill label="En pause" tone="warn" icon="pause" />}
          </View>
          <Muted style={{ color: c.textMuted }} >{subtitle}</Muted>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 2 }}>
            {battery && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                <Ionicons name={battery.icon as keyof typeof Ionicons.glyphMap} size={14} color={battery.col} />
                <Text style={{ fontSize: 12, color: battery.col, fontWeight: "700" }}>{battery.label}</Text>
              </View>
            )}
            {alertCount > 0 && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                <Ionicons name="notifications" size={13} color={c.warn} />
                <Text style={{ fontSize: 12, color: c.warn, fontWeight: "700" }}>{alertCount}</Text>
              </View>
            )}
          </View>
        </View>
        <Ionicons name="chevron-forward" size={20} color={c.textFaint} />
      </View>
    </Card>
  );
}

function AlertRow({ alert }: { alert: Alert }) {
  const { c } = useTheme();
  const meta = alertMeta(alert.type);
  const tone = meta.tone === "danger" ? c.danger : meta.tone === "warn" ? c.warn : c.info;
  return (
    <Card padded>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
        <IconBubble icon={meta.icon} color={tone} size={38} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: "600", color: c.text }} numberOfLines={2}>{alert.message}</Text>
          <Muted>{alert.child.name} · {relativeTime(alert.ts)}</Muted>
        </View>
        {!alert.read && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.primary }} />}
      </View>
    </Card>
  );
}
