import { useCallback, useMemo, useState } from "react";
import { View, Text, ScrollView, RefreshControl, Linking } from "react-native";
import { useLocalSearchParams, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { parent, type WebVisit } from "@/api";
import { useTheme, relativeTime, categoryMeta, space } from "@/theme";
import { Card, Muted, Pill, Empty, Skeleton, IconBubble, ErrorState } from "@/ui";
import { Header } from "./videos";

export default function WebHistory() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const [visits, setVisits] = useState<WebVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try { setVisits((await parent.webVisits(id)).visits); setError(false); }
    catch { setError(true); } finally { setLoading(false); setRefreshing(false); }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const blockedCount = useMemo(() => visits.filter((v) => v.blocked).length, [visits]);

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.bg }}>
      <Header
        title="Historique web"
        subtitle={visits.length ? `${visits.length} site${visits.length > 1 ? "s" : ""}${blockedCount ? ` · ${blockedCount} bloqué${blockedCount > 1 ? "s" : ""}` : ""}` : undefined}
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxxl, gap: space.sm }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={c.primary} colors={[c.primary]} />}
      >
        {loading ? (
          [0, 1, 2, 3, 4].map((i) => <Skeleton key={i} height={64} />)
        ) : error ? (
          <ErrorState onRetry={() => { setLoading(true); load(); }} />
        ) : visits.length === 0 ? (
          <Empty icon="globe" title="Aucun site visité" subtitle="Les sites consultés sur le téléphone et le PC apparaîtront ici." />
        ) : (
          visits.map((v) => <VisitRow key={v.id} visit={v} />)
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function VisitRow({ visit }: { visit: WebVisit }) {
  const { c } = useTheme();
  const meta = categoryMeta(visit.category);
  const open = visit.url ? () => Linking.openURL(visit.url!).catch(() => {}) : undefined;
  return (
    <Card padded onPress={open}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
        {visit.blocked
          ? <IconBubble icon="ban" color={c.danger} size={38} />
          : <IconBubble icon={meta.icon} color={meta.color} size={38} />}
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: c.text }} numberOfLines={1}>{visit.title || visit.domain}</Text>
          <Text style={{ fontSize: 12, color: c.textMuted }} numberOfLines={1}>{visit.domain}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 }}>
            {visit.category ? <Pill label={meta.label} /> : null}
            {visit.blocked ? <Pill label="Bloqué" tone="danger" icon="ban" /> : null}
          </View>
        </View>
        <Muted style={{ fontSize: 11 }}>{relativeTime(visit.ts)}</Muted>
      </View>
    </Card>
  );
}
