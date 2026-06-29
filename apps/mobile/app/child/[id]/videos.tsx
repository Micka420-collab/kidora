import { useCallback, useState } from "react";
import { View, Text, ScrollView, RefreshControl, Pressable, Image, Linking } from "react-native";
import { useLocalSearchParams, useFocusEffect, router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { parent, type Video } from "@/api";
import { useTheme, relativeTime, youtubeThumb, space, radius } from "@/theme";
import { Card, Muted, Pill, Empty, Skeleton, IconBubble } from "@/ui";

export default function Videos() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try { setVideos((await parent.videos(id)).videos); }
    catch { /* ignore */ } finally { setLoading(false); setRefreshing(false); }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.bg }}>
      <Header title="Vidéos YouTube" subtitle={`${videos.length} regardée${videos.length > 1 ? "s" : ""}`} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxxl, gap: space.sm }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={c.primary} colors={[c.primary]} />}
      >
        {loading ? (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} height={72} />)
        ) : videos.length === 0 ? (
          <Empty icon="logo-youtube" title="Aucune vidéo" subtitle="Les vidéos YouTube regardées sur le téléphone et le PC apparaîtront ici." />
        ) : (
          videos.map((v) => <VideoRow key={v.id} video={v} />)
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function VideoRow({ video }: { video: Video }) {
  const { c } = useTheme();
  const thumb = youtubeThumb(video.url);
  return (
    <Card padded onPress={video.url ? () => Linking.openURL(video.url!).catch(() => {}) : undefined}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
        <View style={{ width: 96, height: 54, borderRadius: radius.sm, overflow: "hidden", backgroundColor: c.surfaceAlt, alignItems: "center", justifyContent: "center" }}>
          {thumb ? (
            <Image source={{ uri: thumb }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
          ) : (
            <Ionicons name="logo-youtube" size={26} color="#ef4444" />
          )}
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: c.text }} numberOfLines={2}>{video.title}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {video.channel ? <Muted numberOfLines={1}>{video.channel}</Muted> : null}
            <Pill label={video.platform === "phone" ? "Téléphone" : "PC"} icon={video.platform === "phone" ? "phone-portrait" : "desktop"} />
          </View>
          <Muted style={{ fontSize: 11 }}>{relativeTime(video.ts)}</Muted>
        </View>
      </View>
    </Card>
  );
}

export function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.sm }}>
      <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Retour" style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" }}>
        <Ionicons name="chevron-back" size={24} color={c.text} />
      </Pressable>
      <View>
        <Text style={{ fontSize: 20, fontWeight: "800", color: c.text }}>{title}</Text>
        {subtitle ? <Muted>{subtitle}</Muted> : null}
      </View>
    </View>
  );
}
