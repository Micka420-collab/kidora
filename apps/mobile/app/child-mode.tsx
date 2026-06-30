import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, Alert as RNAlert, Animated, Easing, Image, AccessibilityInfo } from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import { childAgent } from "@/api";
import { formatDuration } from "@/theme";
import { isBedtimeNow, nextBedtimeStart } from "@/schedule";
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
  const [usedTodaySec, setUsedTodaySec] = useState<number | null>(null);
  const [limitMin, setLimitMin] = useState(0); // today's screen-time limit (+ bonus), 0 = none
  const [bedtime, setBedtime] = useState(false);
  const [bedtimeAt, setBedtimeAt] = useState<string | null>(null); // "HH:MM" of next bedtime today
  const [pickTime, setPickTime] = useState(false); // show the +15/+30 chips
  const [reqStatus, setReqStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [pendingReq, setPendingReq] = useState<number | null>(null); // minutes of a request awaiting a parent decision
  const [reduceMotion, setReduceMotion] = useState(false);
  const [granted, setGranted] = useState<number | null>(null); // celebration: parent just granted +X min
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevUsage = useRef<Record<string, number>>({});
  const prevBonus = useRef<number | null>(null);
  const grantTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Animations ──
  const fade = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(24)).current;
  const pulse = useRef(new Animated.Value(0)).current; // 0→1 loop for the halo
  const float = useRef(new Animated.Value(0)).current; // 0→1 loop: mascot idle float/breathe
  const sosScale = useRef(new Animated.Value(1)).current;
  const pop = useRef(new Animated.Value(0)).current; // celebration pop on "request sent"

  // Bootstrap (mount only): honour reduce-motion + start the sync loop.
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    start();
    return () => {
      if (timer.current) clearInterval(timer.current);
      if (grantTimer.current) clearTimeout(grantTimer.current);
      sub.remove();
    };
    // eslint-disable-next-line
  }, []);

  // Animations — skipped (snapped to final) when the user prefers reduced motion.
  useEffect(() => {
    if (reduceMotion) {
      fade.setValue(1);
      slide.setValue(0);
      pulse.setValue(0);
      float.setValue(0);
      return;
    }
    // entrance: fade + slide up
    const entrance = Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(slide, { toValue: 0, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]);
    // continuous protective pulse
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    // mascot idle: gentle float up/down + breathe (keeps the app feeling alive)
    const floatLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, { toValue: 1, duration: 1900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(float, { toValue: 0, duration: 1900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    entrance.start();
    pulseLoop.start();
    floatLoop.start();
    return () => {
      entrance.stop();
      pulseLoop.stop();
      floatLoop.stop();
    };
  }, [reduceMotion, fade, slide, pulse, float]);

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
          let totalToday = 0;
          for (const e of entries) {
            totalToday += e.totalSeconds;
            const prev = prevUsage.current[e.packageName] ?? 0;
            const delta = Math.max(0, e.totalSeconds - prev);
            prevUsage.current[e.packageName] = e.totalSeconds;
            if (delta > 0) usage.push({ appId: e.packageName, appName: e.appName, date: today, seconds: delta });
          }
          setUsedTodaySec(totalToday);
        }
      }

      const res = await childAgent.sync({
        online: true,
        location,
        usage,
        events: [{ type: "location", title: "Position mise à jour" }],
      });
      setPaused(res.policy.paused);
      // today's screen-time allowance (daily limit for this weekday + bonus granted)
      const st = res.policy.screenTime;
      const dayKey = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date().getDay()];
      setLimitMin(st?.enabled ? (st.dailyLimits?.[dayKey] ?? 0) + (st.bonusMinutesToday ?? 0) : 0);
      // Celebrate when a parent grants extra time (bonus went up since last sync).
      const bonus = st?.enabled ? (st.bonusMinutesToday ?? 0) : 0;
      if (prevBonus.current != null && bonus > prevBonus.current) {
        setGranted(bonus - prevBonus.current);
        setReqStatus("idle");
        pop.setValue(0);
        Animated.spring(pop, { toValue: 1, friction: 5, tension: 130, useNativeDriver: true }).start();
        if (grantTimer.current) clearTimeout(grantTimer.current);
        grantTimer.current = setTimeout(() => setGranted(null), 10_000);
      }
      prevBonus.current = bonus;
      setPendingReq(res.pendingTimeRequest ? res.pendingTimeRequest.minutes : null);
      setBedtime(isBedtimeNow(st?.bedtimes));
      setBedtimeAt(nextBedtimeStart(st?.bedtimes));
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

  async function requestTime(minutes: number) {
    setReqStatus("sending");
    setPickTime(false);
    try {
      await childAgent.sync({
        online: true,
        timeRequest: { minutes, reason: "Demande depuis l'appareil" },
        events: [{ type: "time_request", title: `Demande de +${minutes} min` }],
      });
      setReqStatus("sent");
      pop.setValue(0);
      Animated.spring(pop, { toValue: 1, friction: 5, tension: 130, useNativeDriver: true }).start();
    } catch {
      setReqStatus("idle");
      RNAlert.alert("Oups", "La demande n'est pas partie. Réessaie dans un instant.");
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
  const mascotAnim = {
    transform: [
      { translateY: float.interpolate({ inputRange: [0, 1], outputRange: [0, -10] }) },
      { scale: float.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }) },
    ],
  };

  // ── Screen-time logic (kid-friendly) ──
  const limitSec = limitMin * 60;
  const hasLimit = limitSec > 0 && usedTodaySec != null;
  const usedSec = usedTodaySec ?? 0;
  const remainingSec = hasLimit ? Math.max(0, limitSec - usedSec) : 0;
  const usedPct = hasLimit ? Math.min(1, usedSec / limitSec) : 0;
  const barColor = usedPct >= 1 ? "#f87171" : usedPct >= 0.85 ? "#fbbf24" : "#34d399";
  const cheer =
    remainingSec === 0 ? "Le temps d'écran est fini pour aujourd'hui 🌙"
    : usedPct < 0.5 ? "Profite bien ! 🎉"
    : usedPct < 0.85 ? "Encore un peu de temps ⏱"
    : "Bientôt la fin — pense à une pause 💚";

  return (
    <LinearGradient colors={["#4f46e5", "#3730a3", "#1e1b4b"]} style={s.container}>
      <Sparkle style={{ top: 70, left: 36 }} delay={0} size={16} reduce={reduceMotion} />
      <Sparkle style={{ top: 120, right: 44 }} delay={520} size={11} reduce={reduceMotion} />
      <Sparkle style={{ top: 210, left: 26 }} delay={1100} size={9} reduce={reduceMotion} />
      <Sparkle style={{ bottom: 170, right: 36 }} delay={300} size={13} reduce={reduceMotion} />
      <Sparkle style={{ bottom: 120, left: 54 }} delay={860} size={10} reduce={reduceMotion} />
      <Sparkle style={{ bottom: 90, right: 64 }} delay={1500} size={8} reduce={reduceMotion} />

      <Animated.View style={[s.content, { opacity: fade, transform: [{ translateY: slide }] }]}>
        <View style={[s.badge, { backgroundColor: paused ? "rgba(254,243,199,0.95)" : active ? "rgba(220,252,231,0.95)" : "rgba(254,226,226,0.95)" }]}>
          <Text style={[s.badgeText, { color: paused ? "#b45309" : active ? "#15803d" : "#b91c1c" }]}>{status}</Text>
        </View>

        {bedtime && !paused && (
          <View style={s.bedtime}>
            <Text style={s.bedtimeText}>🌙  C'est l'heure de dormir — repose-toi bien</Text>
          </View>
        )}

        {!bedtime && !paused && bedtimeAt && (
          <View style={s.bedtimeSoon}>
            <Text style={s.bedtimeSoonText}>🌙  Dodo à {bedtimeAt}</Text>
          </View>
        )}

        <View style={s.shieldWrap}>
          <Animated.View style={[s.halo, haloStyle]} />
          <Animated.View style={mascotAnim}>
            <Image
              source={bedtime && !paused ? require("../assets/mascot-sleep.png") : require("../assets/mascot.png")}
              style={[s.mascot, paused && { opacity: 0.85 }]}
              resizeMode="contain"
              accessibilityLabel={bedtime && !paused ? "Mascotte Kidora endormie" : "Mascotte Kidora"}
            />
          </Animated.View>
          {paused && <Text style={s.mascotBadge}>⏸</Text>}
        </View>

        <Text style={s.title}>{paused ? "Pause demandée par un parent" : "Tu es protégé·e ✨"}</Text>
        <Text style={s.desc}>
          {paused
            ? "Tes parents ont mis l'appareil en pause. Ça reviendra bientôt 😊"
            : "Kidora veille sur toi avec tes parents. Tout va bien — voici ta journée."}
        </Text>

        {hasLimit ? (
          <View style={s.stCard}>
            {usedPct < 0.5 && (
              <Image source={require("../assets/reward-star.png")} style={s.rewardStar} resizeMode="contain" accessibilityLabel="Récompense : bravo" />
            )}
            <Text style={s.stRemain}>⏳  Il te reste {formatDuration(remainingSec)}</Text>
            <View style={s.stTrack}>
              <View style={[s.stFill, { width: `${Math.round(usedPct * 100)}%`, backgroundColor: barColor }]} />
            </View>
            <Text style={s.stMeta}>{formatDuration(usedSec)} sur {formatDuration(limitSec)} aujourd'hui</Text>
            <Text style={s.stCheer}>{cheer}</Text>
          </View>
        ) : usedTodaySec != null ? (
          <View style={s.stCard}>
            <Text style={s.stRemain}>☀️  Temps libre aujourd'hui</Text>
            <Text style={s.stMeta}>{formatDuration(usedTodaySec)} d'écran jusqu'ici</Text>
            <Text style={s.stCheer}>Pense à faire des pauses 💚</Text>
          </View>
        ) : null}

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

        {granted != null && (
          <Animated.View
            style={[
              s.granted,
              { opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }] },
            ]}
          >
            <Text style={s.grantedEmoji}>🎉</Text>
            <Text style={s.grantedText}>Tes parents t&apos;ont accordé +{granted} min !</Text>
          </Animated.View>
        )}

        {/* Demander plus de temps d'écran à ses parents (vraie demande → alerte parent) */}
        {reqStatus === "sent" ? (
          <Animated.View
            style={[
              s.timeSent,
              { opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }] },
            ]}
          >
            <Text style={s.timeSentEmoji}>🎉</Text>
            <Text style={s.timeSentText}>Demande envoyée — tes parents vont décider 💜</Text>
          </Animated.View>
        ) : pickTime ? (
          <View style={s.timeRow}>
            {[15, 30].map((m) => (
              <Pressable
                key={m}
                style={s.timeChip}
                disabled={reqStatus === "sending"}
                onPress={() => requestTime(m)}
                accessibilityRole="button"
                accessibilityLabel={`Demander ${m} minutes de plus`}
              >
                <Text style={s.timeChipText}>+{m} min</Text>
              </Pressable>
            ))}
            <Pressable style={s.timeGhost} onPress={() => setPickTime(false)} accessibilityRole="button">
              <Text style={s.timeGhostText}>Annuler</Text>
            </Pressable>
          </View>
        ) : pendingReq != null ? (
          <View style={s.pendingReq}>
            <Text style={s.pendingReqText}>⏳  Demande de +{pendingReq} min en attente…</Text>
          </View>
        ) : (
          <Pressable
            style={s.timeBtn}
            onPress={() => setPickTime(true)}
            accessibilityRole="button"
            accessibilityLabel="Demander plus de temps d'écran à mes parents"
          >
            <Text style={s.timeBtnText}>⏰  Demander plus de temps</Text>
          </Pressable>
        )}

        {lastSync && <Text style={s.sync}>Dernière synchro : {lastSync}</Text>}

        <Pressable style={s.refresh} onPress={syncNow} accessibilityRole="button">
          <Text style={s.refreshText}>Actualiser</Text>
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

// Soft twinkling sparkle for the background ambiance (pure Animated, no assets).
function Sparkle({ style, delay, size = 10, reduce = false }: { style: object; delay: number; size?: number; reduce?: boolean }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce) {
      a.setValue(0.5); // static, gentle glint — no looping animation
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(a, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(a, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [a, delay, reduce]);
  return (
    <Animated.Text
      style={[
        {
          position: "absolute",
          fontSize: size,
          opacity: a.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0.9] }),
          transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.15] }) }],
        },
        style,
      ]}
    >
      ✨
    </Animated.Text>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28 },
  content: { alignItems: "center", width: "100%" },
  badge: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, marginBottom: 28 },
  badgeText: { fontWeight: "700" },
  shieldWrap: { width: 148, height: 148, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  halo: { position: "absolute", width: 122, height: 122, borderRadius: 61, backgroundColor: "#a5b4fc" },
  mascot: { width: 140, height: 140 },
  mascotBadge: { position: "absolute", bottom: 2, right: 6, fontSize: 30 },
  title: { fontSize: 22, fontWeight: "800", textAlign: "center", color: "#fff" },
  desc: { color: "#c7d2fe", textAlign: "center", marginTop: 12, lineHeight: 20, maxWidth: 320 },
  sos: { marginTop: 28, backgroundColor: "#ef4444", paddingHorizontal: 44, paddingVertical: 20, borderRadius: 18, alignItems: "center", minWidth: 240, shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  sosText: { color: "#fff", fontWeight: "800", fontSize: 26, letterSpacing: 1 },
  sosSub: { color: "#fee2e2", fontSize: 13, marginTop: 2 },
  bedtime: { marginBottom: 22, backgroundColor: "rgba(199,210,254,0.16)", borderRadius: 14, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: "rgba(199,210,254,0.35)" },
  bedtimeText: { color: "#e0e7ff", fontWeight: "700", fontSize: 14 },
  bedtimeSoon: { marginBottom: 22, backgroundColor: "rgba(199,210,254,0.10)", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  bedtimeSoonText: { color: "#c7d2fe", fontWeight: "600", fontSize: 12.5 },
  stCard: { marginTop: 18, width: "100%", maxWidth: 340, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 18, paddingHorizontal: 18, paddingVertical: 16, alignItems: "center" },
  rewardStar: { width: 66, height: 66, marginBottom: 4 },
  stRemain: { color: "#fff", fontWeight: "800", fontSize: 19 },
  stTrack: { marginTop: 12, width: "100%", height: 12, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.22)", overflow: "hidden" },
  stFill: { height: "100%", borderRadius: 999 },
  stMeta: { color: "#c7d2fe", fontSize: 12.5, marginTop: 8 },
  stCheer: { color: "#e0e7ff", fontWeight: "700", fontSize: 13.5, marginTop: 6 },
  timeBtn: { marginTop: 16, backgroundColor: "#facc15", paddingHorizontal: 28, paddingVertical: 15, borderRadius: 16, minWidth: 240, alignItems: "center", shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 5 },
  pendingReq: { marginTop: 16, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 14, paddingHorizontal: 18, paddingVertical: 13, minWidth: 240, alignItems: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)" },
  pendingReqText: { color: "#e0e7ff", fontWeight: "700", fontSize: 14 },
  timeBtnText: { color: "#713f12", fontWeight: "800", fontSize: 16 },
  timeRow: { marginTop: 16, flexDirection: "row", gap: 10, alignItems: "center" },
  timeChip: { backgroundColor: "#facc15", paddingHorizontal: 22, paddingVertical: 14, borderRadius: 14, minHeight: 48, justifyContent: "center" },
  timeChipText: { color: "#713f12", fontWeight: "800", fontSize: 16 },
  timeGhost: { paddingHorizontal: 14, paddingVertical: 14 },
  timeGhostText: { color: "rgba(255,255,255,0.7)", fontWeight: "700" },
  granted: { marginTop: 16, backgroundColor: "rgba(187,247,208,0.96)", borderRadius: 14, paddingHorizontal: 18, paddingVertical: 13, alignItems: "center" },
  grantedEmoji: { fontSize: 26, marginBottom: 2 },
  grantedText: { color: "#166534", fontWeight: "800", textAlign: "center" },
  timeSent: { marginTop: 16, backgroundColor: "rgba(220,252,231,0.95)", borderRadius: 14, paddingHorizontal: 18, paddingVertical: 13, alignItems: "center" },
  timeSentEmoji: { fontSize: 26, marginBottom: 2 },
  timeSentText: { color: "#15803d", fontWeight: "800", textAlign: "center" },
  sync: { color: "#c7d2fe", marginTop: 22, fontSize: 13 },
  refresh: { marginTop: 14, backgroundColor: "rgba(255,255,255,0.15)", paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12, minHeight: 48, justifyContent: "center" },
  refreshText: { color: "#fff", fontWeight: "700" },
  permBtn: { marginTop: 12, backgroundColor: "#fef3c7", paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },
  permText: { color: "#b45309", fontWeight: "600" },
  unlink: { marginTop: 22, padding: 10 },
  unlinkText: { color: "rgba(255,255,255,0.55)", fontSize: 13 },
});
