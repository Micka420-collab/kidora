import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, Alert as RNAlert } from "react-native";
import { router } from "expo-router";
import * as Location from "expo-location";
import { childAgent } from "@/api";
import * as storage from "@/storage";

const SYNC_MS = 60_000;

export default function ChildMode() {
  const [status, setStatus] = useState("Initialisation…");
  const [active, setActive] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    start();
    return () => { if (timer.current) clearInterval(timer.current); };
    // eslint-disable-next-line
  }, []);

  async function start() {
    const { status: perm } = await Location.requestForegroundPermissionsAsync();
    if (perm !== "granted") {
      setStatus("Permission de localisation refusée");
      return;
    }
    setActive(true);
    setStatus("Protection active 🛡️");
    await syncNow();
    timer.current = setInterval(syncNow, SYNC_MS);
  }

  async function syncNow() {
    try {
      let location: { lat: number; lng: number; accuracy?: number } | undefined;
      try {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        location = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy ?? undefined };
      } catch { /* location may be unavailable momentarily */ }

      const res = await childAgent.sync({
        online: true,
        location,
        events: [{ type: "location", title: "Position mise à jour" }],
      });
      setPaused(res.policy.paused);
      setLastSync(new Date().toLocaleTimeString("fr-FR"));
      setStatus(res.policy.paused ? "⏸ Mis en pause par un parent" : "Protection active 🛡️");
    } catch (e) {
      setStatus("Erreur de synchronisation");
    }
  }

  async function unlink() {
    RNAlert.alert("Dissocier cet appareil ?", "La surveillance sera désactivée.", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Dissocier",
        style: "destructive",
        onPress: async () => {
          if (timer.current) clearInterval(timer.current);
          await storage.clearAll();
          router.replace("/login");
        },
      },
    ]);
  }

  return (
    <View style={s.container}>
      <View style={[s.badge, { backgroundColor: paused ? "#fef3c7" : active ? "#dcfce7" : "#fee2e2" }]}>
        <Text style={[s.badgeText, { color: paused ? "#b45309" : active ? "#15803d" : "#b91c1c" }]}>
          {status}
        </Text>
      </View>

      <Text style={s.shield}>{paused ? "⏸" : "🛡️"}</Text>
      <Text style={s.title}>Kidora protège cet appareil</Text>
      <Text style={s.desc}>
        La position est partagée avec tes parents pour ta sécurité. Tu ne peux pas
        désactiver la protection sans leur accord.
      </Text>

      {lastSync && <Text style={s.sync}>Dernière synchro : {lastSync}</Text>}

      <Pressable style={s.refresh} onPress={syncNow}>
        <Text style={s.refreshText}>Synchroniser maintenant</Text>
      </Pressable>

      <Pressable style={s.unlink} onPress={unlink}>
        <Text style={s.unlinkText}>Dissocier (parent)</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28 },
  badge: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, marginBottom: 32 },
  badgeText: { fontWeight: "700" },
  shield: { fontSize: 72, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: "800", textAlign: "center" },
  desc: { color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 20 },
  sync: { color: "#94a3b8", marginTop: 24, fontSize: 13 },
  refresh: { marginTop: 16, backgroundColor: "#4f46e5", paddingHorizontal: 24, paddingVertical: 14, borderRadius: 10 },
  refreshText: { color: "#fff", fontWeight: "700" },
  unlink: { marginTop: 24, padding: 10 },
  unlinkText: { color: "#94a3b8", fontSize: 13 },
});
