import { useCallback, useState } from "react";
import { View, Text, ScrollView, RefreshControl, Pressable } from "react-native";
import { useLocalSearchParams, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { parent, type AppRule, type AppAction } from "@/api";
import { useTheme, categoryMeta, formatDuration, space, radius } from "@/theme";
import { Card, Muted, Empty, Skeleton, IconBubble, ErrorState } from "@/ui";
import { Header } from "./videos";

const ACTIONS: { key: AppAction; label: string; color: (c: ThemeColors) => string }[] = [
  { key: "allow", label: "Autorisée", color: (c) => c.success },
  { key: "limit", label: "Limitée", color: (c) => c.warn },
  { key: "block", label: "Bloquée", color: (c) => c.danger },
];
const STEP = 15;
type ThemeColors = { success: string; warn: string; danger: string };

export default function Apps() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const [rules, setRules] = useState<AppRule[]>([]);
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const r = await parent.appRules(id);
      setRules(r.rules);
      setUsage(r.usageToday ?? {});
      setError(false);
    } catch { setError(true); } finally { setLoading(false); setRefreshing(false); }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Persist a rule change optimistically; revert on failure.
  async function persist(next: AppRule, prev: AppRule[]) {
    if (!id) return;
    setRules((rs) => rs.map((r) => (r.appId === next.appId ? next : r)));
    setSavingId(next.appId);
    try {
      await parent.setAppRule(id, {
        appId: next.appId,
        appName: next.appName,
        action: next.action,
        dailyLimitMinutes: next.action === "limit" ? next.dailyLimitMinutes ?? 30 : null,
      });
    } catch {
      setRules(prev); // revert
    } finally { setSavingId(null); }
  }

  function setAction(rule: AppRule, action: AppAction) {
    if (rule.action === action) return;
    const next: AppRule = { ...rule, action, dailyLimitMinutes: action === "limit" ? rule.dailyLimitMinutes ?? 60 : rule.dailyLimitMinutes };
    persist(next, rules);
  }
  function bumpLimit(rule: AppRule, delta: number) {
    const m = Math.max(0, Math.min(1440, (rule.dailyLimitMinutes ?? 60) + delta));
    persist({ ...rule, action: "limit", dailyLimitMinutes: m }, rules);
  }

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.bg }}>
      <Header title="Applications" subtitle={rules.length ? `${rules.length} app${rules.length > 1 ? "s" : ""} gérée${rules.length > 1 ? "s" : ""}` : undefined} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxxl, gap: space.sm }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={c.primary} colors={[c.primary]} />}
      >
        {loading ? (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} height={110} />)
        ) : error ? (
          <ErrorState onRetry={() => { setLoading(true); load(); }} />
        ) : rules.length === 0 ? (
          <Empty icon="apps" title="Aucune application" subtitle="Les applications détectées sur les appareils de l'enfant apparaîtront ici pour être autorisées, limitées ou bloquées." />
        ) : (
          rules.map((rule) => {
            const meta = categoryMeta(rule.category);
            const used = usage[rule.appId] ?? 0;
            const limitSec = (rule.dailyLimitMinutes ?? 0) * 60;
            const over = rule.action === "limit" && limitSec > 0 && used >= limitSec;
            return (
              <Card key={rule.appId}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
                  <IconBubble icon={meta.icon} color={meta.color} size={40} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: "800", color: c.text }} numberOfLines={1}>{rule.appName}</Text>
                    <Muted style={{ fontSize: 12 }}>
                      {meta.label}
                      {used > 0 ? ` · ${formatDuration(used)} aujourd'hui` : ""}
                      {over ? " · limite atteinte" : ""}
                    </Muted>
                  </View>
                  {savingId === rule.appId ? <Ionicons name="sync" size={16} color={c.textFaint} /> : null}
                </View>

                {/* action segmented control */}
                <View style={{ flexDirection: "row", gap: 6, marginTop: space.md, backgroundColor: c.surfaceAlt, borderRadius: radius.md, padding: 4 }}>
                  {ACTIONS.map((a) => {
                    const on = rule.action === a.key;
                    const col = a.color(c);
                    return (
                      <Pressable key={a.key} onPress={() => setAction(rule, a.key)} accessibilityLabel={a.label} style={({ pressed }) => ({ flex: 1, transform: [{ scale: pressed ? 0.97 : 1 }] })}>
                        <View style={{ alignItems: "center", paddingVertical: 8, borderRadius: radius.sm, backgroundColor: on ? col + "22" : "transparent", borderWidth: 1, borderColor: on ? col + "66" : "transparent" }}>
                          <Text style={{ fontSize: 12.5, fontWeight: "800", color: on ? col : c.textMuted }}>{a.label}</Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>

                {/* daily limit stepper, only when limited */}
                {rule.action === "limit" && (
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: space.md }}>
                    <Muted style={{ fontSize: 13 }}>Limite quotidienne</Muted>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                      <Stepper icon="remove" onPress={() => bumpLimit(rule, -STEP)} disabled={(rule.dailyLimitMinutes ?? 0) <= 0} />
                      <Text style={{ minWidth: 78, textAlign: "center", fontSize: 13, fontWeight: "800", color: c.warn }}>{formatDuration((rule.dailyLimitMinutes ?? 0) * 60)}</Text>
                      <Stepper icon="add" onPress={() => bumpLimit(rule, STEP)} disabled={(rule.dailyLimitMinutes ?? 0) >= 1440} />
                    </View>
                  </View>
                )}
              </Card>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stepper({ icon, onPress, disabled }: { icon: string; onPress: () => void; disabled?: boolean }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityLabel={icon === "add" ? "Augmenter" : "Diminuer"} style={({ pressed }) => ({ opacity: disabled ? 0.35 : 1, transform: [{ scale: pressed ? 0.92 : 1 }] })}>
      <View style={{ width: 36, height: 36, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: c.tint, borderWidth: 1, borderColor: c.border }}>
        <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={18} color={c.primary} />
      </View>
    </Pressable>
  );
}
