import { useCallback, useState } from "react";
import { View, Text, ScrollView, RefreshControl, Image, Pressable, Modal, Alert as RNAlert } from "react-native";
import { useLocalSearchParams, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { parent, type Screenshot } from "@/api";
import { useTheme, relativeTime, space, radius } from "@/theme";
import { Card, Muted, Btn, Empty, Skeleton, ErrorState } from "@/ui";
import { Header } from "./videos";

export default function Screenshots() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const [shots, setShots] = useState<Screenshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [zoom, setZoom] = useState<Screenshot | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try { setShots((await parent.screenshots(id)).screenshots); setError(false); }
    catch { setError(true); } finally { setLoading(false); setRefreshing(false); }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function requestShot() {
    if (!id) return;
    setRequesting(true);
    try {
      await parent.command(id, "screenshot");
      RNAlert.alert("Kidora", "Demande envoyée. La capture apparaîtra ici une fois l'appareil synchronisé (tirez pour rafraîchir).");
    } catch (e) {
      RNAlert.alert("Erreur", e instanceof Error ? e.message : "Demande impossible");
    } finally { setRequesting(false); }
  }

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.bg }}>
      <Header title="Captures d'écran" subtitle={shots.length ? `${shots.length} récente${shots.length > 1 ? "s" : ""}` : undefined} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: space.lg, paddingBottom: 110, gap: space.md }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={c.primary} colors={[c.primary]} />}
      >
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
            <Ionicons name="information-circle" size={20} color={c.info} />
            <Muted style={{ flex: 1, fontSize: 12 }}>Les captures sont chiffrées au repos et ne sont visibles que par vous. Windows uniquement.</Muted>
          </View>
        </Card>

        {loading ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} height={120} width="48%" />)}
          </View>
        ) : error ? (
          <ErrorState onRetry={() => { setLoading(true); load(); }} />
        ) : shots.length === 0 ? (
          <Empty icon="camera" title="Aucune capture" subtitle="Demandez une capture ci-dessous ; elle apparaîtra après la prochaine synchro de l'appareil." />
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            {shots.map((s) => (
              <Pressable key={s.id} onPress={() => setZoom(s)} accessibilityLabel={`Capture du ${relativeTime(s.createdAt)}`} style={({ pressed }) => ({ width: "48.5%", opacity: pressed ? 0.85 : 1 })}>
                <View style={{ borderRadius: radius.md, overflow: "hidden", backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.border }}>
                  <Image source={{ uri: s.dataUrl }} style={{ width: "100%", height: 130 }} resizeMode="cover" />
                  <Text style={{ fontSize: 11, color: c.textMuted, paddingHorizontal: 8, paddingVertical: 6 }}>{relativeTime(s.createdAt)}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      {/* request button */}
      {!loading && !error && (
        <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: space.lg, paddingTop: space.md, backgroundColor: c.bg, borderTopWidth: 1, borderTopColor: c.border }}>
          <Btn title="Demander une capture" icon="camera" loading={requesting} onPress={requestShot} full />
        </View>
      )}

      {/* fullscreen viewer */}
      <Modal visible={!!zoom} transparent animationType="fade" onRequestClose={() => setZoom(null)}>
        <Pressable onPress={() => setZoom(null)} style={{ flex: 1, backgroundColor: "#000000ee", alignItems: "center", justifyContent: "center", padding: space.md }}>
          {zoom && <Image source={{ uri: zoom.dataUrl }} style={{ width: "100%", height: "80%" }} resizeMode="contain" />}
          <View style={{ position: "absolute", top: 50, right: 20 }}>
            <Ionicons name="close-circle" size={34} color="#ffffffdd" />
          </View>
          {zoom && <Text style={{ color: "#ffffffaa", fontSize: 12, marginTop: space.md }}>{relativeTime(zoom.createdAt)}</Text>}
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
