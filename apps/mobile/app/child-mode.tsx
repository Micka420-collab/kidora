import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, Alert as RNAlert, Animated, Easing } from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import { childAgent } from "@/api";
import * as storage from "@/storage";
import * as AppUsage from "../modules/app-usage";
import { startBackgroundLocation, stopBackgroundLocation } from "@/location-task";

const SYNC_MS = 60_000;

export default function ChildMode() {
  const [status, setStatus] = useState("Initialisation…");
  const [active, setActive] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [needsUsagePerm, setNeedsUsagePerm] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevUsage = useRef<Record<string, number>>({});

  // ── Animations ──
  const fade = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(24)).current;
  const pulse = useRef(new Animated.Value(0)).current; // 0→1 loop for the halo
  const sosScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // entrance: fade + slide up
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(slide, { toValue: 0, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
    // continuous protective pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    ).start();

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
    startBackgroundLocation().catch(() => undefined);
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

      let usage: { appId: string; appName: string; date: string; seconds: number }[] = [];
      if (AppUsage.isAvailable) {
        const granted = await AppUsage.hasPermission();
        setNeedsUsagePerm(!granted);
        if (granted) {
          const today = new Date().toISOString().slice(0, 10);
          const entries = await AppUsage.getUsageToday();
          for (const e of entries) {
            const prev = prevUsage.current[e.packageName] ?? 0;
            const delta = Math.max(0, e.totalSeconds - prev);
            prevUsage.current[e.packageName] = e.totalSeconds;
            if (delta > 0) usage.push({ appId: e.packageName, appName: e.appName, date: today, seconds: delta });
          }
        }
      }

      const res = await childAgent.sync({
        online: true,
        location,
        usage,
        events: [{ type: "location", title: "Position mise à jour" }],
      });
      setPaused(res.policy.paused);
      setLastSync(new Date().toLocaleTimeString("fr-FR"));
      setStatus(res.policy.paused ? "⏸ Mis en pause par un parent" : "Protection active 🛡️");
    } catch (e) {
      setStatus("Erreur de synchronisation");
    }
  }

  async function triggerSOS() {
    try {
      let location: { lat: number; lng: number; accuracy?: number } | undefined;
      try {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        location = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy ?? undefined };
      } catch { /* send without location if unavailable */ }
      await childAgent.sync({ online: true, panic: true, location, events: [{ type: "panic", title: "SOS déclenché" }] });
      RNAlert.alert("SOS envoyé", "Tes parents ont été prévenus avec ta position.");
    } catch {
      RNAlert.alert("Erreur", "Impossible d'envoyer le SOS. Réessaie.");
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
          await stopBackgroundLocation().catch(() => undefined);
          await storage.clearAll();
          router.replace("/login");
        },
      },
    ]);
  }

  const haloStyle = {
    transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] }) }],
    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
  };

  return (
    <LinearGradient colors={["#4f46e5", "#3730a3", "#1e1b4b"]} style={s.container}>
      <Animated.View style={[s.content, { opacity: fade, transform: [{ translateY: slide }] }]}>
        <View style={[s.badge, { backgroundColor: paused ? "rgba(254,243,199,0.95)" : active ? "rgba(220,252,231,0.95)" : "rgba(254,226,226,0.95)" }]}>
          <Text style={[s.badgeText, { color: paused ? "#b45309" : active ? "#15803d" : "#b91c1c" }]}>{status}</Text>
        </View>

        <View style={s.shieldWrap}>
          <Animated.View style={[s.halo, haloStyle]} />
          <Text style={s.shield}>{paused ? "⏸" : "🛡️"}</Text>
        </View>

        <Text style={s.title}>Kidora protège cet appareil</Text>
        <Text style={s.desc}>
          Ta position est partagée avec tes parents pour ta sécurité. Tu ne peux pas
          désactiver la protection sans leur accord.
        </Text>

        <Pressable
          onPress={triggerSOS}
          onPressIn={() => Animated.spring(sosScale, { toValue: 0.94, useNativeDriver: true }).start()}
          onPressOut={() => Animated.spring(sosScale, { toValue: 1, friction: 3, useNativeDriver: true }).start()}
          accessibilityRole="button"
          accessibilityLabel="Bouton SOS : alerter mes parents avec ma position"
        >
          <Animated.View style={[s.sos, { transform: [{ scale: sosScale }] }]}>
            <Text style={s.sosText}>🆘  SOS</Text>
            <Text style={s.sosSub}>Prévenir mes parents maintenant</Text>
          </Animated.View>
        </Pressable>

        {lastSync && <Text style={s.sync}>Dernière synchro : {lastSync}</Text>}

        <Pressable style={s.refresh} onPress={syncNow} accessibilityRole="button">
          <Text style={s.refreshText}>Synchroniser maintenant</Text>
        </Pressable>

        {needsUsagePerm && (
          <Pressable style={s.permBtn} onPress={() => AppUsage.openSettings()} accessibilityRole="button">
            <Text style={s.permText}>Autoriser l'accès à l'usage des apps</Text>
          </Pressable>
        )}

        <Pressable style={s.unlink} onPress={unlink} accessibilityRole="button">
          <Text style={s.unlinkText}>Dissocier (parent)</Text>
        </Pressable>
      </Animated.View>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28 },
  content: { alignItems: "center", width: "100%" },
  badge: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, marginBottom: 28 },
  badgeText: { fontWeight: "700" },
  shieldWrap: { width: 140, height: 140, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  halo: { position: "absolute", width: 120, height: 120, borderRadius: 60, backgroundColor: "#a5b4fc" },
  shield: { fontSize: 76 },
  title: { fontSize: 22, fontWeight: "800", textAlign: "center", color: "#fff" },
  desc: { color: "#c7d2fe", textAlign: "center", marginTop: 12, lineHeight: 20, maxWidth: 320 },
  sos: { marginTop: 28, backgroundColor: "#ef4444", paddingHorizontal: 44, paddingVertical: 20, borderRadius: 18, alignItems: "center", minWidth: 240, shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  sosText: { color: "#fff", fontWeight: "800", fontSize: 26, letterSpacing: 1 },
  sosSub: { color: "#fee2e2", fontSize: 13, marginTop: 2 },
  sync: { color: "#c7d2fe", marginTop: 22, fontSize: 13 },
  refresh: { marginTop: 14, backgroundColor: "rgba(255,255,255,0.15)", paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12, minHeight: 48, justifyContent: "center" },
  refreshText: { color: "#fff", fontWeight: "700" },
  permBtn: { marginTop: 12, backgroundColor: "#fef3c7", paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },
  permText: { color: "#b45309", fontWeight: "600" },
  unlink: { marginTop: 22, padding: 10 },
  unlinkText: { color: "rgba(255,255,255,0.55)", fontSize: 13 },
});
