import { useCallback, useState } from "react";
import { View, Text, ScrollView, Switch, Alert as RNAlert } from "react-native";
import { useLocalSearchParams, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { parent, type WebFilter } from "@/api";
import { useTheme, space } from "@/theme";
import { Card, Muted, H2, Btn, Skeleton, ErrorState } from "@/ui";
import { Header } from "./videos";

const CATEGORIES: { key: string; label: string; emoji: string; group: "sensitive" | "optional" }[] = [
  { key: "adult", label: "Contenu adulte", emoji: "🔞", group: "sensitive" },
  { key: "gambling", label: "Jeux d'argent", emoji: "🎰", group: "sensitive" },
  { key: "violence", label: "Violence", emoji: "⚔️", group: "sensitive" },
  { key: "drugs", label: "Drogues", emoji: "💊", group: "sensitive" },
  { key: "dating", label: "Rencontres", emoji: "💘", group: "sensitive" },
  { key: "social", label: "Réseaux sociaux", emoji: "💬", group: "optional" },
  { key: "video", label: "Vidéo", emoji: "🎬", group: "optional" },
  { key: "games", label: "Jeux", emoji: "🎮", group: "optional" },
  { key: "streaming", label: "Streaming", emoji: "📺", group: "optional" },
  { key: "shopping", label: "Achats en ligne", emoji: "🛒", group: "optional" },
];

function parseCategories(raw: WebFilter["blockedCategories"] | undefined): string[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") { try { const o = JSON.parse(raw); return Array.isArray(o) ? o : []; } catch { return []; } }
  return [];
}

export default function WebFilterEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const [safeSearch, setSafeSearch] = useState(true);
  const [blockUnknown, setBlockUnknown] = useState(false);
  const [blocked, setBlocked] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const wf = (await parent.child(id)).child.webFilter;
      setSafeSearch(wf?.safeSearch ?? true);
      setBlockUnknown(wf?.blockUnknown ?? false);
      setBlocked(parseCategories(wf?.blockedCategories));
      setError(false);
      setDirty(false);
    } catch { setError(true); } finally { setLoading(false); }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function toggleCat(key: string) {
    setBlocked((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
    setDirty(true);
  }

  async function save() {
    if (!id) return;
    setBusy(true);
    try {
      await parent.setWebFilter(id, { safeSearch, blockUnknown, blockedCategories: blocked });
      setDirty(false);
      RNAlert.alert("Kidora", "Filtrage web enregistré ✅");
    } catch (e) {
      RNAlert.alert("Erreur", e instanceof Error ? e.message : "Enregistrement impossible");
    } finally { setBusy(false); }
  }

  const sensitive = CATEGORIES.filter((c2) => c2.group === "sensitive");
  const optional = CATEGORIES.filter((c2) => c2.group === "optional");

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.bg }}>
      <Header title="Filtrage web" subtitle="Catégories bloquées & recherche sécurisée" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: space.lg, paddingBottom: 120, gap: space.lg }}
      >
        {loading ? (
          <><Skeleton height={120} /><Skeleton height={220} /><Skeleton height={220} /></>
        ) : error ? (
          <ErrorState onRetry={() => { setLoading(true); load(); }} />
        ) : (
          <>
            {/* master switches */}
            <Card>
              <ToggleRow label="Recherche sécurisée (SafeSearch)" sub="Force le filtrage adulte sur Google, Bing, YouTube." value={safeSearch} onValueChange={(v) => { setSafeSearch(v); setDirty(true); }} />
              <View style={{ height: 1, backgroundColor: c.border, marginVertical: space.md }} />
              <ToggleRow label="Bloquer les sites inconnus" sub="N'autoriser que les sites d'une catégorie connue (strict)." value={blockUnknown} onValueChange={(v) => { setBlockUnknown(v); setDirty(true); }} />
            </Card>

            <CategorySection title="Catégories sensibles" hint="Recommandé pour tous les âges." items={sensitive} blocked={blocked} onToggle={toggleCat} />
            <CategorySection title="Autres catégories" hint="À ajuster selon l'âge de l'enfant." items={optional} blocked={blocked} onToggle={toggleCat} />
          </>
        )}
      </ScrollView>

      {!loading && !error && (
        <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: space.lg, paddingTop: space.md, backgroundColor: c.bg, borderTopWidth: 1, borderTopColor: c.border }}>
          <Btn title={dirty ? `Enregistrer (${blocked.length} bloquée${blocked.length > 1 ? "s" : ""})` : "Enregistré"} icon="save" loading={busy} disabled={!dirty} onPress={save} full />
        </View>
      )}
    </SafeAreaView>
  );
}

function ToggleRow({ label, sub, value, onValueChange }: { label: string; sub: string; value: boolean; onValueChange: (v: boolean) => void }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: "700", color: c.text }}>{label}</Text>
        <Muted style={{ fontSize: 12 }}>{sub}</Muted>
      </View>
      <Switch value={value} onValueChange={onValueChange} trackColor={{ false: c.border, true: c.primary }} accessibilityLabel={label} />
    </View>
  );
}

function CategorySection({ title, hint, items, blocked, onToggle }: { title: string; hint: string; items: { key: string; label: string; emoji: string }[]; blocked: string[]; onToggle: (k: string) => void }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: space.sm }}>
      <H2>{title}</H2>
      <Muted style={{ fontSize: 12, marginTop: -4 }}>{hint}</Muted>
      <Card>
        {items.map((cat, i) => {
          const on = blocked.includes(cat.key);
          return (
            <View key={cat.key} style={{ flexDirection: "row", alignItems: "center", gap: space.md, marginTop: i ? space.md : 0, paddingTop: i ? space.md : 0, borderTopWidth: i ? 1 : 0, borderTopColor: c.border }}>
              <Text style={{ fontSize: 22 }}>{cat.emoji}</Text>
              <Text style={{ flex: 1, fontSize: 14, fontWeight: "700", color: c.text }}>{cat.label}</Text>
              <Switch value={on} onValueChange={() => onToggle(cat.key)} trackColor={{ false: c.border, true: c.danger }} accessibilityLabel={`Bloquer ${cat.label}`} />
            </View>
          );
        })}
      </Card>
    </View>
  );
}
