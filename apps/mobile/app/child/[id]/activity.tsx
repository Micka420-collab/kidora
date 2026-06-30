import { useCallback, useMemo, useState } from "react";
import { View, Text, ScrollView, RefreshControl } from "react-native";
import { useLocalSearchParams, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { parent, type ActivityEvent } from "@/api";
import { useTheme, relativeTime, space, radius } from "@/theme";
import { Card, Muted, H2, Pill, Empty, Skeleton, IconBubble, ErrorState } from "@/ui";
import { Header } from "./videos";

// Pure local helpers (mirror the server's hourly.ts) — no native deps.
function hourHistogram(timestamps: string[]): number[] {
  const buckets = new Array(24).fill(0) as number[];
  for (const t of timestamps) {
    const h = new Date(t).getHours();
    if (h >= 0 && h < 24) buckets[h]++;
  }
  return buckets;
}
function peakHour(buckets: number[]): number | null {
  let max = 0, peak: number | null = null;
  for (let h = 0; h < buckets.length; h++) if (buckets[h] > max) { max = buckets[h]; peak = h; }
  return peak;
}

function eventMeta(type: string): { icon: string; color: string; label: string } {
  switch (type) {
    case "web_visit": return { icon: "globe", color: "#3b82f6", label: "Site web" };
    case "search": return { icon: "search", color: "#8b5cf6", label: "Recherche" };
    case "app_open": return { icon: "apps", color: "#6366f1", label: "Application" };
    case "screen_on": return { icon: "phone-portrait", color: "#0ea5e9", label: "Écran allumé" };
    case "location": return { icon: "location", color: "#ef4444", label: "Position" };
    case "blocked": return { icon: "ban", color: "#ef4444", label: "Bloqué" };
    default: return { icon: "ellipse", color: "#94a3b8", label: type };
  }
}

export default function Activity() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try { setEvents((await parent.activity(id)).events); setError(false); }
    catch { setError(true); } finally { setLoading(false); setRefreshing(false); }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const hist = useMemo(() => hourHistogram(events.map((e) => e.ts)), [events]);
  const peak = useMemo(() => peakHour(hist), [hist]);
  const maxBucket = Math.max(1, ...hist);

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.bg }}>
      <Header title="Activité" subtitle={events.length ? `${events.length} évènement${events.length > 1 ? "s" : ""} récent${events.length > 1 ? "s" : ""}` : undefined} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxxl, gap: space.lg }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={c.primary} colors={[c.primary]} />}
      >
        {loading ? (
          <><Skeleton height={160} /><Skeleton height={80} /><Skeleton height={80} /></>
        ) : error ? (
          <ErrorState onRetry={() => { setLoading(true); load(); }} />
        ) : events.length === 0 ? (
          <Empty icon="pulse" title="Aucune activité" subtitle="Les évènements récents (apps, recherches, sites…) apparaîtront ici." />
        ) : (
          <>
            {/* hourly histogram */}
            <Card>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <H2>Activité par heure</H2>
                {peak != null ? <Pill label={`Pic vers ${String(peak).padStart(2, "0")}h`} tone="brand" icon="flame" /> : null}
              </View>
              <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", height: 96, marginTop: space.md }}>
                {hist.map((v, h) => {
                  const hgt = Math.max(2, (v / maxBucket) * 84);
                  const isPeak = h === peak;
                  return (
                    <View key={h} style={{ flex: 1, alignItems: "center", justifyContent: "flex-end" }}>
                      <View style={{ width: "62%", height: hgt, borderRadius: 3, backgroundColor: v === 0 ? c.surfaceAlt : isPeak ? c.primary : c.tint }} />
                    </View>
                  );
                })}
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
                {["0h", "6h", "12h", "18h", "23h"].map((l) => (
                  <Text key={l} style={{ fontSize: 10, color: c.textFaint, fontWeight: "700" }}>{l}</Text>
                ))}
              </View>
            </Card>

            {/* recent feed */}
            <View style={{ gap: space.sm }}>
              <H2>Évènements récents</H2>
              <Card>
                {events.slice(0, 60).map((e, i) => {
                  const meta = eventMeta(e.blocked ? "blocked" : e.type);
                  return (
                    <View key={e.id} style={{ flexDirection: "row", alignItems: "center", gap: space.md, marginTop: i ? space.md : 0, paddingTop: i ? space.md : 0, borderTopWidth: i ? 1 : 0, borderTopColor: c.border }}>
                      <IconBubble icon={meta.icon} color={meta.color} size={36} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: "700", color: c.text }} numberOfLines={1}>{e.title ?? meta.label}</Text>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          {e.detail ? <Muted style={{ fontSize: 12, flexShrink: 1 }} numberOfLines={1}>{e.detail}</Muted> : null}
                          {e.blocked ? <Pill label="Bloqué" tone="danger" icon="ban" /> : null}
                        </View>
                      </View>
                      <View style={{ alignItems: "flex-end", gap: 2 }}>
                        <Muted style={{ fontSize: 11 }}>{relativeTime(e.ts)}</Muted>
                        <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: c.surfaceAlt }}>
                          <Text style={{ fontSize: 10, fontWeight: "700", color: c.textMuted }}>{meta.label}</Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </Card>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
