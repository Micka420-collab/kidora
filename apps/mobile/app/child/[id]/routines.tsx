import { useCallback, useState } from "react";
import { View, Text, ScrollView, RefreshControl, Switch, Pressable, Alert as RNAlert } from "react-native";
import { useLocalSearchParams, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { parent, type RoutineRaw } from "@/api";
import { useTheme, space, radius } from "@/theme";
import { Card, Muted, Empty, Skeleton, IconBubble, ErrorState } from "@/ui";
import { Header } from "./videos";

const DAY_LABEL: Record<string, string> = { mon: "Lun", tue: "Mar", wed: "Mer", thu: "Jeu", fri: "Ven", sat: "Sam", sun: "Dim" };
const DAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function parseArr(s: string): string[] {
  try { const o = JSON.parse(s); return Array.isArray(o) ? o : []; } catch { return []; }
}

export default function Routines() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const [routines, setRoutines] = useState<RoutineRaw[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try { setRoutines((await parent.routines(id)).routines); setError(false); }
    catch { setError(true); } finally { setLoading(false); setRefreshing(false); }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function toggle(r: RoutineRaw) {
    if (!id) return;
    const prev = routines;
    const next = { ...r, enabled: !r.enabled };
    setRoutines((rs) => rs.map((x) => (x.id === r.id ? next : x))); // optimistic
    setSavingId(r.id);
    try {
      await parent.saveRoutine(id, {
        id: r.id, name: r.name, enabled: next.enabled,
        days: parseArr(r.days), start: r.start, end: r.end, blockedAppIds: parseArr(r.blockedAppIds),
      });
    } catch { setRoutines(prev); } finally { setSavingId(null); }
  }

  function confirmDelete(r: RoutineRaw) {
    RNAlert.alert("Supprimer la routine", `Supprimer « ${r.name} » ?`, [
      { text: "Annuler", style: "cancel" },
      { text: "Supprimer", style: "destructive", onPress: () => remove(r) },
    ]);
  }
  async function remove(r: RoutineRaw) {
    if (!id) return;
    const prev = routines;
    setRoutines((rs) => rs.filter((x) => x.id !== r.id));
    try { await parent.deleteRoutine(id, r.id); }
    catch { setRoutines(prev); RNAlert.alert("Erreur", "Suppression impossible"); }
  }

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.bg }}>
      <Header title="Routines" subtitle="Profils horaires (ex. heures d'école)" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxxl, gap: space.sm }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={c.primary} colors={[c.primary]} />}
      >
        {loading ? (
          [0, 1].map((i) => <Skeleton key={i} height={120} />)
        ) : error ? (
          <ErrorState onRetry={() => { setLoading(true); load(); }} />
        ) : routines.length === 0 ? (
          <Empty icon="calendar" title="Aucune routine" subtitle="Créez des profils horaires (ex. heures d'école) depuis le tableau de bord web ; vous pourrez les activer ou les supprimer ici." />
        ) : (
          routines.map((r) => {
            const days = parseArr(r.days);
            const apps = parseArr(r.blockedAppIds);
            return (
              <Card key={r.id}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
                  <IconBubble icon="calendar" color={r.enabled ? c.primary : c.textFaint} size={40} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: "800", color: c.text }} numberOfLines={1}>{r.name}</Text>
                    <Muted style={{ fontSize: 12 }}>{r.start} – {r.end} · {apps.length} app{apps.length > 1 ? "s" : ""} bloquée{apps.length > 1 ? "s" : ""}</Muted>
                  </View>
                  {savingId === r.id ? <Ionicons name="sync" size={16} color={c.textFaint} style={{ marginRight: 4 }} /> : null}
                  <Switch value={r.enabled} onValueChange={() => toggle(r)} trackColor={{ false: c.border, true: c.primary }} accessibilityLabel={`Activer ${r.name}`} />
                </View>

                {/* day chips */}
                <View style={{ flexDirection: "row", gap: 6, marginTop: space.md }}>
                  {DAY_ORDER.map((d) => {
                    const on = days.includes(d);
                    return (
                      <View key={d} style={{ flex: 1, alignItems: "center", paddingVertical: 6, borderRadius: radius.sm, backgroundColor: on ? c.tint : c.surfaceAlt }}>
                        <Text style={{ fontSize: 11, fontWeight: "800", color: on ? c.primary : c.textFaint }}>{DAY_LABEL[d]}</Text>
                      </View>
                    );
                  })}
                </View>

                <Pressable onPress={() => confirmDelete(r)} accessibilityLabel={`Supprimer ${r.name}`} style={({ pressed }) => ({ alignSelf: "flex-start", marginTop: space.md, opacity: pressed ? 0.5 : 1 })}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                    <Ionicons name="trash-outline" size={15} color={c.danger} />
                    <Text style={{ fontSize: 13, fontWeight: "700", color: c.danger }}>Supprimer</Text>
                  </View>
                </Pressable>
              </Card>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
