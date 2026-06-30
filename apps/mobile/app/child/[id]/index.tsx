import { useCallback, useState } from "react";
import { View, Text, ScrollView, RefreshControl, Pressable, Alert as RNAlert } from "react-native";
import { useLocalSearchParams, useFocusEffect, router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { parent, type Child, type Live, type Report } from "@/api";
import { useTheme, formatDuration, relativeTime, categoryMeta, space, radius } from "@/theme";
import { Card, Avatar, PulseDot, Pill, Muted, H2, Stat, Bar, Btn, IconBubble, Empty, Skeleton, ErrorState } from "@/ui";

const WD = ["D", "L", "M", "M", "J", "V", "S"];

export default function ChildDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c, gradient } = useTheme();
  const [child, setChild] = useState<Child | null>(null);
  const [live, setLive] = useState<Live | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [ch, lv, rp] = await Promise.all([
        parent.child(id).then((r) => r.child),
        parent.live(id).catch(() => null),
        parent.report(id, 7).catch(() => null),
      ]);
      setChild(ch);
      setLive(lv);
      setReport(rp);
      setError(false);
    } catch { setError(true); } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function act(fn: () => Promise<unknown>, okMsg?: string) {
    setBusy(true);
    try { await fn(); if (okMsg) RNAlert.alert("Kidora", okMsg); await load(); }
    catch (e) { RNAlert.alert("Erreur", e instanceof Error ? e.message : "Action impossible"); }
    finally { setBusy(false); }
  }

  const paused = live?.paused ?? child?.paused ?? false;
  const online = live?.online ?? child?.devices.some((d) => d.online) ?? false;

  function togglePause() { act(() => parent.pause(id!, !paused)); }
  function lock() {
    RNAlert.alert("Verrouiller l'appareil", "Verrouiller maintenant l'appareil de l'enfant ?", [
      { text: "Annuler", style: "cancel" },
      { text: "Verrouiller", style: "destructive", onPress: () => act(() => parent.command(id!, "lock"), "Appareil verrouillé.") },
    ]);
  }
  function message() {
    const presets = ["À table ! 🍽️", "C'est l'heure des devoirs 📚", "On pense à toi ❤️"];
    RNAlert.alert("Envoyer un message", "Choisissez un message", [
      ...presets.map((text) => ({ text, onPress: () => act(() => parent.command(id!, "message", { text }), "Message envoyé.") })),
      { text: "Annuler", style: "cancel" as const },
    ]);
  }
  function grant() { act(() => parent.grantTime(id!, 15), "+15 min accordées."); }

  const todaySeconds = report?.trend?.length ? report.trend[report.trend.length - 1].seconds : 0;

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.bg }}>
      {/* hero */}
      <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.xl, borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Retour" style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: "#ffffff22", alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </Pressable>
          {paused && <Pill label="En pause" tone="warn" icon="pause" />}
        </View>
        <View style={{ alignItems: "center", marginTop: space.sm, gap: 6 }}>
          <Avatar emoji={child?.avatar} size={76} online={online} />
          <Text style={{ color: "#fff", fontSize: 24, fontWeight: "800", marginTop: 4 }}>{child?.name ?? "…"}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <PulseDot on={online} size={10} />
            <Text style={{ color: "#ffffffdd", fontSize: 13, fontWeight: "600" }}>
              {live?.currentApp ? `Utilise ${live.currentApp.title}` : online ? "En ligne" : `Vu ${relativeTime(live?.lastSeen ?? null)}`}
            </Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxxl, gap: space.lg }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={c.primary} colors={[c.primary]} />}
      >
        {loading ? (
          <>
            <Skeleton height={80} /><Skeleton height={160} /><Skeleton height={120} />
          </>
        ) : error && !child ? (
          <ErrorState onRetry={() => { setLoading(true); load(); }} />
        ) : (
          <>
            {/* quick actions */}
            <View style={{ flexDirection: "row", gap: space.sm }}>
              <Action icon={paused ? "play" : "pause"} label={paused ? "Reprendre" : "Pause"} onPress={togglePause} active={paused} disabled={busy} />
              <Action icon="lock-closed" label="Verrouiller" onPress={lock} disabled={busy} />
              <Action icon="chatbubble" label="Message" onPress={message} disabled={busy} />
              <Action icon="add-circle" label="+15 min" onPress={grant} disabled={busy} />
            </View>

            {/* stats */}
            <View style={{ flexDirection: "row", gap: space.sm }}>
              <Stat icon="hourglass" value={formatDuration(todaySeconds)} label="Aujourd'hui" color={c.primary} />
              <Stat icon="trending-up" value={formatDuration(report?.avgPerDaySeconds ?? 0)} label="Moy./jour" color={c.info} />
              <Stat icon="globe" value={String(report?.web.totalVisits ?? 0)} label={`${report?.web.blockedVisits ?? 0} bloqués`} color={c.warn} />
            </View>

            {/* videos + messages shortcuts */}
            <View style={{ flexDirection: "row", gap: space.sm }}>
              <NavCard icon="logo-youtube" color="#ef4444" label="Vidéos YouTube" onPress={() => router.push(`/child/${id}/videos`)} />
              <NavCard icon="chatbubbles" color={c.primary} label="Messages" onPress={() => router.push(`/child/${id}/messages`)} />
            </View>

            {/* weekly trend */}
            <Card>
              <H2>Temps d'écran · 7 jours</H2>
              <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", height: 110, marginTop: space.md }}>
                {(report?.trend ?? []).map((d, i) => {
                  const max = Math.max(60, ...(report?.trend ?? []).map((t) => t.seconds));
                  const h = Math.max(4, (d.seconds / max) * 92);
                  const wd = new Date(d.date + "T00:00:00").getDay();
                  const isToday = i === (report?.trend.length ?? 0) - 1;
                  return (
                    <View key={d.date} style={{ alignItems: "center", gap: 6, flex: 1 }}>
                      <View style={{ width: 22, height: h, borderRadius: 8, backgroundColor: isToday ? c.primary : c.tint }} />
                      <Text style={{ fontSize: 11, color: isToday ? c.primary : c.textFaint, fontWeight: "700" }}>{WD[wd]}</Text>
                    </View>
                  );
                })}
              </View>
            </Card>

            {/* top apps */}
            <View style={{ gap: space.sm }}>
              <H2>Applications les plus utilisées</H2>
              {(report?.topApps ?? []).length === 0 ? (
                <Card><Muted>Aucune donnée d'usage pour l'instant.</Muted></Card>
              ) : (
                <Card>
                  {report!.topApps.slice(0, 5).map((app, i) => {
                    const meta = categoryMeta(app.category);
                    const max = report!.topApps[0].seconds || 1;
                    return (
                      <View key={app.appName + i} style={{ marginTop: i ? space.md : 0, gap: 6 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                          <IconBubble icon={meta.icon} color={meta.color} size={34} />
                          <Text style={{ flex: 1, fontSize: 14, fontWeight: "700", color: c.text }} numberOfLines={1}>{app.appName}</Text>
                          <Text style={{ fontSize: 13, fontWeight: "700", color: c.textMuted }}>{formatDuration(app.seconds)}</Text>
                        </View>
                        <Bar value={app.seconds / max} color={meta.color} />
                      </View>
                    );
                  })}
                </Card>
              )}
            </View>

            {/* location */}
            <View style={{ gap: space.sm }}>
              <H2>Localisation</H2>
              <Card>
                {live?.location ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
                    <IconBubble icon="location" color={c.danger} size={42} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: "700", color: c.text }} numberOfLines={2}>{live.location.address ?? `${live.location.lat.toFixed(4)}, ${live.location.lng.toFixed(4)}`}</Text>
                      <Muted>Mis à jour {relativeTime(live.location.ts)}</Muted>
                    </View>
                  </View>
                ) : (
                  <Muted>Aucune position récente.</Muted>
                )}
              </Card>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Action({ icon, label, onPress, active, disabled }: { icon: string; label: string; onPress: () => void; active?: boolean; disabled?: boolean }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityLabel={label} style={({ pressed }) => ({ flex: 1, opacity: disabled ? 0.5 : 1, transform: [{ scale: pressed ? 0.96 : 1 }] })}>
      <View style={{ alignItems: "center", gap: 6, backgroundColor: active ? c.warnSoft : c.card, borderRadius: radius.md, paddingVertical: space.md, borderWidth: 1, borderColor: active ? c.warn + "55" : c.border }}>
        <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={22} color={active ? c.warn : c.primary} />
        <Text style={{ fontSize: 11, fontWeight: "700", color: active ? c.warn : c.text }}>{label}</Text>
      </View>
    </Pressable>
  );
}

function NavCard({ icon, color, label, onPress }: { icon: string; color: string; label: string; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityLabel={label} style={({ pressed }) => ({ flex: 1, transform: [{ scale: pressed ? 0.97 : 1 }] })}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: c.card, borderRadius: radius.md, padding: space.md, borderWidth: 1, borderColor: c.border }}>
        <IconBubble icon={icon} color={color} size={36} />
        <Text style={{ flex: 1, fontSize: 13, fontWeight: "700", color: c.text }}>{label}</Text>
        <Ionicons name="chevron-forward" size={16} color={c.textFaint} />
      </View>
    </Pressable>
  );
}
