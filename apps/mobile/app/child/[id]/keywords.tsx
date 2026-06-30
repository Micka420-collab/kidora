import { useCallback, useState } from "react";
import { View, Text, ScrollView, TextInput, Pressable, Alert as RNAlert } from "react-native";
import { useLocalSearchParams, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { parent, type WatchedKeyword } from "@/api";
import { useTheme, space, radius } from "@/theme";
import { Card, Muted, H2, Btn, Empty, Skeleton, ErrorState } from "@/ui";
import { Header } from "./videos";

// A few ready-made risk terms parents can add in one tap.
const SUGGESTIONS = ["suicide", "automutilation", "drogue", "alcool", "arme", "violence", "nudes", "fugue"];

export default function Keywords() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const [keywords, setKeywords] = useState<WatchedKeyword[]>([]);
  const [term, setTerm] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try { setKeywords((await parent.keywords(id)).keywords); setError(false); }
    catch { setError(true); } finally { setLoading(false); }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function add(raw: string) {
    const t = raw.trim().toLowerCase();
    if (t.length < 2 || !id) return;
    if (keywords.some((k) => k.term === t)) { setTerm(""); return; }
    setBusy(true);
    try {
      const r = await parent.addKeyword(id, t);
      setKeywords((ks) => [r.keyword, ...ks.filter((k) => k.id !== r.keyword.id)]);
      setTerm("");
    } catch (e) {
      RNAlert.alert("Erreur", e instanceof Error ? e.message : "Ajout impossible");
    } finally { setBusy(false); }
  }

  async function remove(k: WatchedKeyword) {
    if (!id) return;
    const prev = keywords;
    setKeywords((ks) => ks.filter((x) => x.id !== k.id)); // optimistic
    try { await parent.deleteKeyword(id, k.id); }
    catch { setKeywords(prev); }
  }

  const available = SUGGESTIONS.filter((s) => !keywords.some((k) => k.term === s));

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.bg }}>
      <Header title="Mots-clés sensibles" subtitle="Être alerté si l'enfant recherche ces termes" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxxl, gap: space.lg }}
        keyboardShouldPersistTaps="handled"
      >
        {/* add */}
        <Card>
          <Text style={{ fontSize: 15, fontWeight: "800", color: c.text, marginBottom: 4 }}>Ajouter un mot-clé</Text>
          <Muted>Une alerte est créée quand le terme apparaît dans les recherches ou messages.</Muted>
          <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.md }}>
            <TextInput
              style={{ flex: 1, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, color: c.text, paddingHorizontal: 14, minHeight: 48, fontSize: 15 }}
              placeholder="ex. automutilation" placeholderTextColor={c.textFaint} autoCapitalize="none"
              value={term} onChangeText={setTerm} onSubmitEditing={() => add(term)} returnKeyType="done"
              accessibilityLabel="Nouveau mot-clé"
            />
            <Btn title="Ajouter" icon="add" loading={busy} disabled={term.trim().length < 2} onPress={() => add(term)} />
          </View>
          {available.length > 0 && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.md }}>
              {available.map((s) => (
                <Pressable key={s} onPress={() => add(s)} accessibilityLabel={`Ajouter ${s}`} style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.96 : 1 }] })}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 11, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: c.tint, borderWidth: 1, borderColor: c.border }}>
                    <Ionicons name="add" size={13} color={c.primary} />
                    <Text style={{ fontSize: 12.5, fontWeight: "700", color: c.primary }}>{s}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </Card>

        {/* list */}
        <View style={{ gap: space.sm }}>
          <H2>Surveillés{keywords.length ? ` · ${keywords.length}` : ""}</H2>
          {loading ? (
            <><Skeleton height={56} /><Skeleton height={56} /></>
          ) : error ? (
            <ErrorState onRetry={() => { setLoading(true); load(); }} />
          ) : keywords.length === 0 ? (
            <Empty icon="search" title="Aucun mot-clé" subtitle="Ajoutez des termes à surveiller, ou choisissez-en un ci-dessus." />
          ) : (
            <Card>
              {keywords.map((k, i) => (
                <View key={k.id} style={{ flexDirection: "row", alignItems: "center", gap: space.md, marginTop: i ? space.md : 0, paddingTop: i ? space.md : 0, borderTopWidth: i ? 1 : 0, borderTopColor: c.border }}>
                  <View style={{ width: 34, height: 34, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: c.warnSoft }}>
                    <Ionicons name="search" size={16} color={c.warn} />
                  </View>
                  <Text style={{ flex: 1, fontSize: 15, fontWeight: "700", color: c.text }} numberOfLines={1}>{k.term}</Text>
                  <Pressable onPress={() => remove(k)} hitSlop={10} accessibilityLabel={`Supprimer ${k.term}`} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
                    <Ionicons name="close-circle" size={22} color={c.textFaint} />
                  </Pressable>
                </View>
              ))}
            </Card>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
