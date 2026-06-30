import { useCallback, useState } from "react";
import { View, Text, ScrollView, Switch, Pressable, Alert as RNAlert } from "react-native";
import { useLocalSearchParams, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { parent } from "@/api";
import { useTheme, space, radius } from "@/theme";
import { Card, Muted, H2, Btn, Skeleton, ErrorState } from "@/ui";
import { Header } from "./videos";

const WEEKDAYS: { key: string; label: string }[] = [
  { key: "mon", label: "Lundi" },
  { key: "tue", label: "Mardi" },
  { key: "wed", label: "Mercredi" },
  { key: "thu", label: "Jeudi" },
  { key: "fri", label: "Vendredi" },
  { key: "sat", label: "Samedi" },
  { key: "sun", label: "Dimanche" },
];
const STEP = 15; // minutes
const PRESETS = [0, 60, 90, 120, 180];

function fmtMin(m: number): string {
  if (m <= 0) return "Aucune limite";
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h ? `${h} h${r ? ` ${r} min` : ""}` : `${r} min`;
}

export default function ScreenTime() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const [enabled, setEnabled] = useState(true);
  const [limits, setLimits] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const r = (await parent.screenTimeRule(id)).screenTime;
      setEnabled(r?.enabled ?? true);
      setLimits(r ? safeParse(r.dailyLimits) : {});
      setError(false);
      setDirty(false);
    } catch { setError(true); } finally { setLoading(false); }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function setDay(key: string, minutes: number) {
    setLimits((prev) => ({ ...prev, [key]: Math.max(0, Math.min(1440, minutes)) }));
    setDirty(true);
  }
  function applyAll(minutes: number) {
    setLimits(Object.fromEntries(WEEKDAYS.map((d) => [d.key, minutes])));
    setDirty(true);
  }

  async function save() {
    if (!id) return;
    setBusy(true);
    try {
      await parent.setScreenTimeRule(id, { enabled, dailyLimits: limits });
      setDirty(false);
      RNAlert.alert("Kidora", "Limites de temps d'écran enregistrées ✅");
    } catch (e) {
      RNAlert.alert("Erreur", e instanceof Error ? e.message : "Enregistrement impossible");
    } finally { setBusy(false); }
  }

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.bg }}>
      <Header title="Temps d'écran" subtitle="Limites quotidiennes par jour" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: space.lg, paddingBottom: 120, gap: space.lg }}
      >
        {loading ? (
          <><Skeleton height={70} /><Skeleton height={320} /></>
        ) : error ? (
          <ErrorState onRetry={() => { setLoading(true); load(); }} />
        ) : (
          <>
            {/* master toggle */}
            <Card>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: "800", color: c.text }}>Limites activées</Text>
                  <Muted>Désactivez pour suspendre toutes les limites sans les effacer.</Muted>
                </View>
                <Switch
                  value={enabled}
                  onValueChange={(v) => { setEnabled(v); setDirty(true); }}
                  trackColor={{ false: c.border, true: c.primary }}
                  accessibilityLabel="Activer les limites"
                />
              </View>
            </Card>

            {/* quick presets */}
            <View style={{ gap: space.sm }}>
              <H2>Appliquer à tous les jours</H2>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
                {PRESETS.map((m) => (
                  <Pressable key={m} onPress={() => applyAll(m)} accessibilityLabel={fmtMin(m)} style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.96 : 1 }] })}>
                    <View style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill, backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.border }}>
                      <Text style={{ fontSize: 13, fontWeight: "700", color: c.text }}>{m === 0 ? "Aucune" : fmtMin(m)}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* per-day steppers */}
            <View style={{ gap: space.sm, opacity: enabled ? 1 : 0.5 }}>
              <H2>Par jour</H2>
              <Card>
                {WEEKDAYS.map((d, i) => {
                  const v = limits[d.key] ?? 0;
                  return (
                    <View key={d.key} style={{ flexDirection: "row", alignItems: "center", gap: space.md, marginTop: i ? space.md : 0, paddingTop: i ? space.md : 0, borderTopWidth: i ? 1 : 0, borderTopColor: c.border }}>
                      <Text style={{ width: 86, fontSize: 14, fontWeight: "700", color: c.text }}>{d.label}</Text>
                      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: space.sm }}>
                        <Stepper icon="remove" onPress={() => setDay(d.key, v - STEP)} disabled={v <= 0} />
                        <Text style={{ minWidth: 96, textAlign: "center", fontSize: 13, fontWeight: "700", color: v > 0 ? c.text : c.textFaint }}>{fmtMin(v)}</Text>
                        <Stepper icon="add" onPress={() => setDay(d.key, v + STEP)} disabled={v >= 1440} />
                      </View>
                    </View>
                  );
                })}
              </Card>
            </View>
          </>
        )}
      </ScrollView>

      {/* sticky save */}
      {!loading && !error && (
        <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: space.lg, paddingTop: space.md, backgroundColor: c.bg, borderTopWidth: 1, borderTopColor: c.border }}>
          <Btn title={dirty ? "Enregistrer" : "Enregistré"} icon="save" loading={busy} disabled={!dirty} onPress={save} full />
        </View>
      )}
    </SafeAreaView>
  );
}

function Stepper({ icon, onPress, disabled }: { icon: string; onPress: () => void; disabled?: boolean }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityLabel={icon === "add" ? "Augmenter" : "Diminuer"} style={({ pressed }) => ({ opacity: disabled ? 0.35 : 1, transform: [{ scale: pressed ? 0.92 : 1 }] })}>
      <View style={{ width: 38, height: 38, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: c.tint, borderWidth: 1, borderColor: c.border }}>
        <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={20} color={c.primary} />
      </View>
    </Pressable>
  );
}

function safeParse(s: string): Record<string, number> {
  try {
    const o = JSON.parse(s);
    return o && typeof o === "object" ? o : {};
  } catch { return {}; }
}
