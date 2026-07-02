import { useCallback, useState } from "react";
import { View, Text, Pressable, RefreshControl, ScrollView, Alert as RNAlert } from "react-native";
import { useFocusEffect, router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { parent, ApiError, type Child, type Live, type Alert } from "@/api";
import { useTheme, relativeTime, radius, space, alertMeta, formatDuration } from "@/theme";
import { isDeviceOnline } from "@/device";
import { Card, Avatar, PulseDot, Pill, Muted, SectionHeader, Empty, Skeleton, IconBubble, ErrorState } from "@/ui";

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
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [week, setWeek] = useState<{ thisWeekSeconds: number; lastWeekSeconds: number; alertsThisWeek: number } | null>(null);
  // Pending screen-time requests surface as unread `time_request` alerts — no extra fetch.
  const [timeReq, setTimeReq] = useState<{ count: number; childId: string | null }>({ count: 0, childId: null });

  const load = useCallback(async () => {
    try {
      const [{ children }, a, ins] = await Promise.all([
        parent.children(),
        parent.alerts(),
        parent.insights().catch(() => null),
      ]);
      // enrich each child with a live snapshot (best-effort, parallel)
      const live = await Promise.all(
        children.map((ch) => parent.live(ch.id).catch(() => undefined)),
      );
      setKids(children.map((ch, i) => ({ ...ch, live: live[i] })));
      setAlerts(a.alerts.slice(0, 3));
      const pendingReqs = a.alerts.filter((x) => x.type === "time_request" && !x.read);
      setTimeReq({ count: pendingReqs.length, childId: pendingReqs[0]?.childId ?? null });
      setWeek(ins);
      setError(false);
    } catch (e) {
      // Only a real auth failure should eject to login — a 5xx or flaky network
      // shows a retryable error instead of spuriously logging the parent out.
      if (e instanceof ApiError && e.status === 401) {
        router.replace("/login");
      } else {
        setError(true);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onlineCount = kids.filter((k) => k.live?.online ?? k.devices.some((d) => isDeviceOnline(d))).length;
  const allPaused = kids.length > 0 && kids.every((k) => k.live?.paused ?? k.paused);

  async function runFamily(fn: () => Promise<unknown>) {
    setBusy(true);
    try { await fn(); await load(); } finally { setBusy(false); }
  }
  function toggleFamilyPause() {
    if (allPaused) { runFamily(() => parent.familyPause(false)); return; }
    RNAlert.alert("Pause familiale", "Mettre tous les appareils en pause…", [
      { text: "30 minutes", onPress: () => runFamily(() => parent.familyPauseFor(30)) },
      { text: "1 heure", onPress: () => runFamily(() => parent.familyPauseFor(60)) },
      { text: "2 heures", onPress: () => runFamily(() => parent.familyPauseFor(120)) },
      { text: "Indéfiniment", onPress: () => runFamily(() => parent.familyPause(true)) },
      { text: "Annuler", style: "cancel" as const },
    ]);
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
          ) : error ? (
            <View style={{ padding: space.lg }}>
              <ErrorState onRetry={() => { setLoading(true); load(); }} />
            </View>
          ) : (
            <ChildList kids={kids} alerts={alerts} week={week} timeReq={timeReq} reload={load} refreshing={refreshing} setRefreshing={setRefreshing} />
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

type Week = { thisWeekSeconds: number; lastWeekSeconds: number; alertsThisWeek: number } | null;

function WeekCard({ week }: { week: Week }) {
  const { c } = useTheme();
  if (!week || (week.thisWeekSeconds === 0 && week.alertsThisWeek === 0)) return null;
  const { thisWeekSeconds: now, lastWeekSeconds: prev, alertsThisWeek } = week;
  let delta: { up: boolean; pct: number } | null = null;
  if (prev > 0) {
    const pct = Math.round(((now - prev) / prev) * 100);
    if (Math.abs(pct) >= 1) delta = { up: now > prev, pct: Math.abs(pct) };
  }
  return (
    <Card>
      <Text style={{ fontSize: 13, fontWeight: "700", color: c.textMuted, marginBottom: 8 }}>CETTE SEMAINE</Text>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 10 }}>
        <Text style={{ fontSize: 26, fontWeight: "800", color: c.text }}>{formatDuration(now)}</Text>
        {delta && (
          <Text style={{ fontSize: 14, fontWeight: "700", marginBottom: 3, color: delta.up ? c.warn : c.success }}>
            {delta.up ? "▲" : "▼"} {delta.pct}%
          </Text>
        )}
      </View>
      <Muted style={{ marginTop: 2 }}>Temps d&apos;écran (7 j){alertsThisWeek > 0 ? ` · ${alertsThisWeek} alerte${alertsThisWeek > 1 ? "s" : ""}` : ""}</Muted>
    </Card>
  );
}

function ChildList({ kids, alerts, week, timeReq, reload, refreshing, setRefreshing }: { kids: Enriched[]; alerts: Alert[]; week: Week; timeReq: { count: number; childId: string | null }; reload: () => void; refreshing: boolean; setRefreshing: (v: boolean) => void }) {
  const { c } = useTheme();
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxxl, gap: space.sm }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); reload(); }} tintColor={c.primary} colors={[c.primary]} />}
    >
      {timeReq.count > 0 && (
        <Pressable
          onPress={() => router.push(timeReq.count === 1 && timeReq.childId ? `/child/${timeReq.childId}` : "/(parent)/alerts")}
          accessibilityLabel="Voir les demandes de temps en attente"
          style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.99 : 1 }] })}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.md, backgroundColor: c.warnSoft, borderWidth: 1, borderColor: c.warn + "55", borderRadius: radius.lg, padding: space.md }}>
            <IconBubble icon="hourglass" color={c.warn} size={40} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: "800", color: c.text }}>{timeReq.count} demande{timeReq.count > 1 ? "s" : ""} de temps</Text>
              <Muted style={{ fontSize: 12 }}>En attente de votre réponse — appuyez pour {timeReq.count === 1 ? "répondre" : "voir"}.</Muted>
            </View>
            <Ionicons name="chevron-forward" size={18} color={c.warn} />
          </View>
        </Pressable>
      )}
      <WeekCard week={week} />
      <SectionHeader title="Enfants" actionLabel="+ Ajouter" onAction={() => router.push("/add-child")} />
      {kids.length === 0 ? (
        <Pressable onPress={() => router.push("/add-child")} accessibilityRole="button">
          <Empty icon="people" title="Aucun enfant" subtitle="Touchez ici pour ajouter un enfant et un appareil — sans passer par le web." />
        </Pressable>
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
  const online = child.live?.online ?? child.devices.some((d) => isDeviceOnline(d));
  const paused = child.live?.paused ?? child.paused ?? false;
  const battery = batteryView(child.live?.battery ?? child.devices[0]?.battery ?? null, c.textMuted);
  const alertCount = child._count?.alerts ?? 0;
  const subtitle = child.live?.currentApp
    ? `Utilise ${child.live.currentApp.title}`
    : online ? "En ligne" : `Vu ${relativeTime(child.live?.lastSeen ?? child.devices[0]?.lastSeen ?? null)}`;

  return (
    <Card onPress={() => router.push(`/child/${child.id}`)} padded accessibilityLabel={`Voir ${child.name} — ${subtitle}`}>
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
    <Card padded onPress={() => router.push(`/child/${alert.childId}`)} accessibilityLabel={`Alerte ${alert.child.name} : ${alert.message}`}>
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
