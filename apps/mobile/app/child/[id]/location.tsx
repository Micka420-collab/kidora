import { useCallback, useMemo, useState } from "react";
import { View, Text, ScrollView, RefreshControl, TextInput, Pressable, Linking, Alert as RNAlert } from "react-native";
import { useLocalSearchParams, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { parent, type LocationPing, type Geofence } from "@/api";
import { useTheme, relativeTime, space, radius } from "@/theme";
import { Card, Muted, H2, Pill, Btn, Empty, Skeleton, IconBubble, ErrorState } from "@/ui";
import { Header } from "./videos";

const RADII = [100, 150, 300, 500];

// Great-circle distance in metres (small local helper — no native deps).
function metersBetween(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

function fenceContaining(ping: LocationPing | null, fences: Geofence[]): Geofence | null {
  if (!ping) return null;
  for (const f of fences) {
    if (metersBetween(ping.lat, ping.lng, f.lat, f.lng) <= f.radius) return f;
  }
  return null;
}

function coords(p: LocationPing): string {
  return `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;
}

function openMap(p: LocationPing) {
  Linking.openURL(`https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=17/${p.lat}/${p.lng}`).catch(() => {});
}

export default function Location() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const [pings, setPings] = useState<LocationPing[]>([]);
  const [latest, setLatest] = useState<LocationPing | null>(null);
  const [fences, setFences] = useState<Geofence[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [zoneName, setZoneName] = useState("");
  const [zoneRadius, setZoneRadius] = useState(150);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const r = await parent.location(id);
      setPings(r.pings);
      setLatest(r.latest);
      setFences(r.geofences);
      setError(false);
    } catch { setError(true); } finally { setLoading(false); setRefreshing(false); }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const [locating, setLocating] = useState(false);
  async function requestLocate() {
    if (!id) return;
    setLocating(true);
    try {
      await parent.command(id, "locate");
      RNAlert.alert("Kidora", "Demande envoyée. La position se mettra à jour à la prochaine synchro de l'appareil (tirez pour rafraîchir).");
    } catch (e) {
      RNAlert.alert("Erreur", e instanceof Error ? e.message : "Demande impossible");
    } finally { setLocating(false); }
  }

  async function createZone() {
    if (!id || !latest || zoneName.trim().length < 1) return;
    setAdding(true);
    try {
      const r = await parent.addGeofence(id, { name: zoneName.trim(), lat: latest.lat, lng: latest.lng, radius: zoneRadius });
      setFences((fs) => [...fs, r.geofence]);
      setZoneName("");
      RNAlert.alert("Kidora", `Zone « ${r.geofence.name} » créée ✅`);
    } catch (e) {
      RNAlert.alert("Erreur", e instanceof Error ? e.message : "Création impossible");
    } finally { setAdding(false); }
  }

  function confirmDeleteZone(f: Geofence) {
    RNAlert.alert("Supprimer la zone", `Supprimer « ${f.name} » ?`, [
      { text: "Annuler", style: "cancel" },
      { text: "Supprimer", style: "destructive", onPress: () => deleteZone(f) },
    ]);
  }
  async function deleteZone(f: Geofence) {
    if (!id) return;
    const prev = fences;
    setFences((fs) => fs.filter((x) => x.id !== f.id));
    try { await parent.deleteGeofence(id, f.id); }
    catch { setFences(prev); RNAlert.alert("Erreur", "Suppression impossible"); }
  }

  const here = useMemo(() => fenceContaining(latest, fences), [latest, fences]);
  // Exclude the "latest" ping from the history list by id, not by position — a
  // positional slice(1) would drop a real point (or duplicate latest) if the
  // API's `latest` isn't exactly `pings[0]`.
  const history = latest ? pings.filter((p) => p.id !== latest.id) : pings;

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.bg }}>
      <Header title="Localisation" subtitle={latest ? `Mise à jour ${relativeTime(latest.ts)}` : undefined} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxxl, gap: space.lg }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={c.primary} colors={[c.primary]} />}
      >
        {loading ? (
          <><Skeleton height={120} /><Skeleton height={80} /><Skeleton height={200} /></>
        ) : error ? (
          <ErrorState onRetry={() => { setLoading(true); load(); }} />
        ) : !latest ? (
          <>
            <Empty icon="location" title="Aucune position" subtitle="La position de l'enfant apparaîtra ici dès que l'appareil la partage." />
            <Btn title="Localiser maintenant" icon="navigate" loading={locating} onPress={requestLocate} full />
          </>
        ) : (
          <>
            <Btn title="Localiser maintenant" icon="navigate" loading={locating} onPress={requestLocate} full />
            {/* current position */}
            <Card padded onPress={() => openMap(latest)}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
                <IconBubble icon="location" color={c.danger} size={46} />
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={{ fontSize: 15, fontWeight: "800", color: c.text }} numberOfLines={2}>
                    {latest.address ?? coords(latest)}
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    {here ? <Pill label={`Dans « ${here.name} »`} tone="success" icon="shield-checkmark" /> : <Pill label="Hors zone" tone="warn" icon="walk" />}
                    {latest.accuracy != null ? <Muted style={{ fontSize: 11 }}>± {Math.round(latest.accuracy)} m</Muted> : null}
                  </View>
                  <Muted style={{ fontSize: 11 }}>{relativeTime(latest.ts)} · appuyez pour la carte</Muted>
                </View>
              </View>
            </Card>

            {/* safe zones */}
            <View style={{ gap: space.sm }}>
              <H2>Zones de sécurité</H2>
              {fences.length > 0 && (
                <Card>
                  {fences.map((f, i) => (
                    <View key={f.id} style={{ flexDirection: "row", alignItems: "center", gap: space.md, marginTop: i ? space.md : 0, paddingTop: i ? space.md : 0, borderTopWidth: i ? 1 : 0, borderTopColor: c.border }}>
                      <IconBubble icon="shield-checkmark" color={c.success} size={36} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: "700", color: c.text }}>{f.name}</Text>
                        <Muted style={{ fontSize: 12 }}>Rayon {f.radius} m{here?.id === f.id ? " · ici en ce moment" : ""}</Muted>
                      </View>
                      {here?.id === f.id ? <Pill label="Présent" tone="success" /> : null}
                      <Pressable onPress={() => confirmDeleteZone(f)} hitSlop={10} accessibilityLabel={`Supprimer ${f.name}`} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, marginLeft: 4 })}>
                        <Ionicons name="trash-outline" size={18} color={c.textFaint} />
                      </Pressable>
                    </View>
                  ))}
                </Card>
              )}

              {/* create a zone at the child's current position */}
              <Card>
                <Text style={{ fontSize: 14, fontWeight: "800", color: c.text, marginBottom: 2 }}>Créer une zone ici</Text>
                <Muted style={{ fontSize: 12 }}>Centrée sur la position actuelle de l&apos;enfant. Vous serez alerté aux entrées/sorties.</Muted>
                <TextInput
                  style={{ marginTop: space.md, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, color: c.text, paddingHorizontal: 14, minHeight: 46, fontSize: 15 }}
                  placeholder="Nom (ex. Maison, École)" placeholderTextColor={c.textFaint}
                  value={zoneName} onChangeText={setZoneName} accessibilityLabel="Nom de la zone"
                />
                <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.sm }}>
                  {RADII.map((r) => {
                    const on = zoneRadius === r;
                    return (
                      <Pressable key={r} onPress={() => setZoneRadius(r)} accessibilityLabel={`Rayon ${r} m`} style={({ pressed }) => ({ flex: 1, transform: [{ scale: pressed ? 0.97 : 1 }] })}>
                        <View style={{ alignItems: "center", paddingVertical: 9, borderRadius: radius.md, backgroundColor: on ? c.tint : c.surfaceAlt, borderWidth: 1, borderColor: on ? c.primary + "66" : c.border }}>
                          <Text style={{ fontSize: 12.5, fontWeight: "800", color: on ? c.primary : c.textMuted }}>{r} m</Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
                <View style={{ marginTop: space.md }}>
                  <Btn title="Créer la zone" icon="add-circle" loading={adding} disabled={zoneName.trim().length < 1} onPress={createZone} full />
                </View>
              </Card>
            </View>

            {/* history */}
            <View style={{ gap: space.sm }}>
              <H2>Historique</H2>
              {history.length === 0 ? (
                <Card><Muted>Aucun déplacement antérieur enregistré.</Muted></Card>
              ) : (
                <Card>
                  {history.map((p, i) => {
                    const inFence = fenceContaining(p, fences);
                    return (
                      <View key={p.id} style={{ flexDirection: "row", alignItems: "flex-start", gap: space.md, marginTop: i ? space.md : 0 }}>
                        <View style={{ alignItems: "center" }}>
                          <View style={{ width: 10, height: 10, borderRadius: 5, marginTop: 4, backgroundColor: inFence ? c.success : c.textFaint }} />
                          {i < history.length - 1 ? <View style={{ width: 2, flex: 1, minHeight: 22, backgroundColor: c.border, marginTop: 2 }} /> : null}
                        </View>
                        <View style={{ flex: 1, paddingBottom: space.xs, borderRadius: radius.sm }}>
                          <Text style={{ fontSize: 13, fontWeight: "600", color: c.text }} numberOfLines={1}>{p.address ?? coords(p)}</Text>
                          <Muted style={{ fontSize: 11 }}>{relativeTime(p.ts)}{inFence ? ` · ${inFence.name}` : ""}</Muted>
                        </View>
                      </View>
                    );
                  })}
                </Card>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
