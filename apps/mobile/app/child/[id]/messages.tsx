import { useCallback, useState } from "react";
import { View, Text, ScrollView, RefreshControl } from "react-native";
import { useLocalSearchParams, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { parent, type Message } from "@/api";
import { useTheme, relativeTime, space, radius } from "@/theme";
import { Empty, Skeleton } from "@/ui";
import { Header } from "./videos";

export default function Messages() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try { setMessages((await parent.messages(id)).messages); }
    catch { /* ignore */ } finally { setLoading(false); setRefreshing(false); }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const received = messages.filter((m) => m.direction === "in").length;
  const sent = messages.length - received;

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.bg }}>
      <Header title="Messages" subtitle={messages.length ? `${received} reçu${received > 1 ? "s" : ""} · ${sent} envoyé${sent > 1 ? "s" : ""}` : undefined} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxxl, gap: space.sm }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={c.primary} colors={[c.primary]} />}
      >
        {loading ? (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} height={48} />)
        ) : messages.length === 0 ? (
          <Empty icon="chatbubbles" title="Aucun message" subtitle="Les SMS envoyés et reçus sur le téléphone apparaîtront ici (nécessite l'app Kids avec la permission SMS)." />
        ) : (
          messages.slice().reverse().map((m) => <Bubble key={m.id} message={m} />)
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Bubble({ message }: { message: Message }) {
  const { c } = useTheme();
  const out = message.direction === "out";
  return (
    <View style={{ alignItems: out ? "flex-end" : "flex-start" }}>
      <View
        style={{
          maxWidth: "82%",
          backgroundColor: out ? c.primary : c.card,
          borderWidth: out ? 0 : 1,
          borderColor: c.border,
          borderRadius: radius.lg,
          borderBottomRightRadius: out ? radius.sm : radius.lg,
          borderBottomLeftRadius: out ? radius.lg : radius.sm,
          paddingHorizontal: 14,
          paddingVertical: 9,
          gap: 2,
        }}
      >
        <Text style={{ fontSize: 11, fontWeight: "700", color: out ? "#ffffffcc" : c.textMuted }}>
          {out ? "Envoyé" : (message.contact ?? "Reçu")}
        </Text>
        <Text style={{ fontSize: 14, color: out ? "#fff" : c.text }}>{message.body}</Text>
        <Text style={{ fontSize: 10, color: out ? "#ffffffaa" : c.textFaint, alignSelf: "flex-end" }}>{relativeTime(message.ts)}</Text>
      </View>
    </View>
  );
}
