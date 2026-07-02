import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, Alert as RNAlert, Animated, Easing, Image, AccessibilityInfo } from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import { childAgent } from "@/api";
import { formatDuration } from "@/theme";
import { isBedtimeNow, nextBedtimeStart } from "@/schedule";
import * as storage from "@/storage";
import * as sosQueue from "@/sos-queue";
import * as AppUsage from "../modules/app-usage";
import { startBackgroundLocation, stopBackgroundLocation } from "@/location-task";

const SYNC_MS = 60_000;

// LOCAL calendar date "YYYY-MM-DD" (not UTC) so usage buckets by the family's
// local day, matching the server (which reads the tzOffset we report).
function localDay(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

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
  const [denied, setDenied] = useState(false); // parent refused the pending request
  const [welcome, setWelcome] = useState(false); // first-launch greeting banner
  const [parentMsg, setParentMsg] = useState<string | null>(null); // a "message" command from a parent
  const [remoteLocked, setRemoteLocked] = useState(false); // a "lock" command from a parent (best-effort)
  const [syncError, setSyncError] = useState(false); // last sync failed (offline) → status shown in red, not green
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const syncing = useRef(false); // re-entrancy guard so an overlapping sync can't double-ack
  const mounted = useRef(true); // set false on unmount → skip post-await setState
  // Commands already applied, keyed by id, with the ack we produced — so a
  // re-delivered command (e.g. from a race) doesn't re-fire its side effect but
  // is still re-acked in case the earlier ack was lost.
  const handledCmds = useRef<Map<string, { status: "done" | "failed"; result?: string }>>(new Map());
  // Command results to ack on the next sync (so delivered commands don't hang).
  const pendingResults = useRef<{ id: string; status: "done" | "failed"; result?: string }[]>([]);
  // Per-app cumulative-usage baseline, persisted so it survives app restarts —
  // otherwise the first sync after a cold start would resend the whole day's
  // cumulative usage as a "delta" and the server would double-count it.
  const prevUsage = useRef<Record<string, number>>({});
  const usageDate = useRef<string | null>(null);
  const prevBonus = useRef<number | null>(null);
  const prevPendingReq = useRef<number | null>(null); // to detect a pending request being resolved
  const sosInFlight = useRef(false);
  const reqInFlight = useRef(false);
  const grantTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deniedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const welcomeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    // First-launch greeting, shown once then remembered.
    storage.get("kidsWelcomed").then((seen) => {
      if (!seen) {
        setWelcome(true);
        welcomeTimer.current = setTimeout(() => setWelcome(false), 4500);
        storage.set("kidsWelcomed", "1").catch(() => undefined);
      }
    }).catch(() => undefined);
    // Restore the usage baseline before the first sync so a restart doesn't
    // resend the day's cumulative usage as a delta.
    (async () => {
      try {
        const raw = await storage.get("kidsUsageBaseline");
        const today = localDay();
        if (raw) {
          const parsed = JSON.parse(raw) as { date?: string; perApp?: Record<string, number> };
          if (parsed?.date === today && parsed.perApp) {
            prevUsage.current = parsed.perApp;
            usageDate.current = today;
          }
        }
      } catch { /* start fresh */ }
      // Restore the last-known policy so a cold OFFLINE start shows real limits /
      // pause / bedtime instead of a blank screen (refreshed on the first sync).
      try {
        const rawPol = await storage.get("kidsPolicy");
        if (rawPol) {
          const pol = JSON.parse(rawPol) as { paused?: boolean; screenTime?: { enabled?: boolean; dailyLimits?: Record<string, number>; bonusMinutesToday?: number; bedtimes?: { days: string[]; start: string; end: string }[] } };
          setPaused(!!pol.paused);
          const st = pol.screenTime;
          const dayKey = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date().getDay()];
          const baseMin = st?.enabled ? (st.dailyLimits?.[dayKey] ?? 0) : 0;
          setLimitMin(baseMin > 0 ? baseMin + (st?.bonusMinutesToday ?? 0) : 0);
          if (st?.bedtimes) setBedtime(isBedtimeNow(st.bedtimes));
        }
      } catch { /* no cached policy */ }
      start();
    })();
    return () => {
      mounted.current = false;
      if (timer.current) clearInterval(timer.current);
      if (grantTimer.current) clearTimeout(grantTimer.current);
      if (deniedTimer.current) clearTimeout(deniedTimer.current);
      if (welcomeTimer.current) clearTimeout(welcomeTimer.current);
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
    if (syncing.current) return; // don't let an overlapping run double-ack / race
    syncing.current = true;
    try {
      let location: { lat: number; lng: number; accuracy?: number } | undefined;
      try {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        location = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy ?? undefined };
      } catch { /* location may be unavailable momentarily */ }

      // Report CUMULATIVE daily totals (usageToday), not deltas: the server SETs
      // the total monotonically, so a sync whose response is lost — the server
      // committed the write but the client never advanced its baseline — is a
      // no-op on retry instead of double-counting screen time (the increment
      // `usage` path is not idempotent). Only apps that grew since the last sent
      // total are included, to keep the payload small.
      let usageToday: { appId: string; appName: string; date: string; seconds: number }[] = [];
      let nextBaseline: { date: string; perApp: Record<string, number> } | null = null;
      if (AppUsage.isAvailable) {
        const granted = await AppUsage.hasPermission();
        setNeedsUsagePerm(!granted);
        if (granted) {
          const today = localDay();
          // New local day → reset the baseline (native cumulative resets at midnight).
          if (usageDate.current !== today) { prevUsage.current = {}; usageDate.current = today; }
          const entries = await AppUsage.getUsageToday();
          let totalToday = 0;
          const perApp: Record<string, number> = { ...prevUsage.current };
          for (const e of entries) {
            totalToday += e.totalSeconds;
            const prev = prevUsage.current[e.packageName] ?? 0;
            perApp[e.packageName] = e.totalSeconds;
            // Send the cumulative total for any app that advanced. Re-sending the
            // same total is idempotent server-side; the baseline is only committed
            // on success (below), so a dropped response re-sends the same total.
            if (e.totalSeconds > prev) {
              usageToday.push({ appId: e.packageName, appName: e.appName, date: today, seconds: e.totalSeconds });
            }
          }
          setUsedTodaySec(totalToday);
          nextBaseline = { date: today, perApp };
        }
      }

      const toAck = pendingResults.current.slice();
      // Flush any SOS queued while offline as panic events (server → critical
      // alert; deduped by id if re-flushed).
      const queuedSos = await sosQueue.list();
      const res = await childAgent.sync({
        online: true,
        tzOffset: -new Date().getTimezoneOffset(), // minutes to add to UTC → local
        location,
        usageToday,
        events: [{ type: "location", title: "Position mise à jour" }, ...sosQueue.toEvents(queuedSos)],
        ...(toAck.length ? { commandResults: toAck } : {}),
      });
      // Sync succeeded → the queued SOS were delivered; clear them.
      if (queuedSos.length) sosQueue.removeIds(queuedSos.map((e) => e.id)).catch(() => undefined);
      // Sync succeeded → NOW commit the usage baseline (a restart won't re-send).
      if (nextBaseline) {
        prevUsage.current = nextBaseline.perApp;
        storage.set("kidsUsageBaseline", JSON.stringify(nextBaseline)).catch(() => undefined);
      }
      if (!mounted.current) return; // unmounted mid-sync → don't touch state
      setSyncError(false);
      // Drop the results we just acknowledged (keep any added since).
      pendingResults.current = pendingResults.current.filter((r) => !toAck.includes(r));
      // Apply remote commands the parent issued (lock / message / locate…).
      processCommands(res.commands);
      // Cache the policy so a cold offline start shows real limits/pause (above).
      storage.set("kidsPolicy", JSON.stringify(res.policy)).catch(() => undefined);
      setPaused(res.policy.paused);
      // today's screen-time allowance (daily limit for this weekday + bonus granted)
      const st = res.policy.screenTime;
      const dayKey = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date().getDay()];
      // Bonus only extends an EXISTING limit — a free-time day (no base limit)
      // stays free even after a grant (mirrors the server's computeScreenTimeToday).
      const baseMin = st?.enabled ? (st.dailyLimits?.[dayKey] ?? 0) : 0;
      setLimitMin(baseMin > 0 ? baseMin + (st?.bonusMinutesToday ?? 0) : 0);
      // Celebrate when a parent grants extra time (bonus went up since last sync).
      const bonus = st?.enabled ? (st.bonusMinutesToday ?? 0) : 0;
      const bonusIncreased = prevBonus.current != null && bonus > prevBonus.current;
      if (bonusIncreased) {
        setGranted(bonus - prevBonus.current!);
        setReqStatus("idle");
        pop.setValue(0);
        Animated.spring(pop, { toValue: 1, friction: 5, tension: 130, useNativeDriver: true }).start();
        if (grantTimer.current) clearTimeout(grantTimer.current);
        grantTimer.current = setTimeout(() => setGranted(null), 10_000);
      }
      prevBonus.current = bonus;
      const nowPending = res.pendingTimeRequest ? res.pendingTimeRequest.minutes : null;
      // A pending request that disappeared WITHOUT a bonus bump was refused —
      // give the child closure instead of the banner silently vanishing.
      if (prevPendingReq.current != null && nowPending == null && !bonusIncreased) {
        setDenied(true);
        setReqStatus("idle");
        if (deniedTimer.current) clearTimeout(deniedTimer.current);
        deniedTimer.current = setTimeout(() => setDenied(false), 8_000);
      }
      prevPendingReq.current = nowPending;
      setPendingReq(nowPending);
      // Request resolved (approved → grant branch above, or denied → no pending
      // request and no bonus change): clear the lingering "sent" state.
      if (!res.pendingTimeRequest) setReqStatus((s) => (s === "sent" ? "idle" : s));
      setBedtime(isBedtimeNow(st?.bedtimes));
      setBedtimeAt(nextBedtimeStart(st?.bedtimes));
      setLastSync(new Date().toLocaleTimeString("fr-FR"));
      setStatus(res.policy.paused ? "⏸ Mis en pause par un parent" : "Protection active 🛡️");
    } catch {
      if (mounted.current) {
        setSyncError(true);
        setStatus("Hors ligne — nouvelle tentative bientôt");
      }
    } finally {
      syncing.current = false;
    }
  }

  // Handle remote commands the parent issued from the dashboard/app, and queue an
  // ack for each so it isn't left "delivered" forever. Mobile can't truly lock a
  // phone, so lock/message are surfaced as banners (best-effort).
  function processCommands(commands?: { id: string; type: string; payload?: Record<string, unknown> }[]) {
    for (const cmd of commands ?? []) {
      // Already applied (e.g. re-delivered by a race)? Don't re-run its side
      // effect (a dismissed parent message must not pop back up) — just re-ack.
      const prior = handledCmds.current.get(cmd.id);
      if (prior) {
        pendingResults.current.push({ id: cmd.id, ...prior });
        continue;
      }
      let status: "done" | "failed" = "done";
      let result: string | undefined;
      switch (cmd.type) {
        case "message": {
          const text = typeof cmd.payload?.text === "string" ? cmd.payload.text : "";
          if (text) setParentMsg(text);
          break;
        }
        case "lock":
        case "pause":
          setRemoteLocked(true);
          break;
        case "unlock":
        case "resume":
          setRemoteLocked(false);
          break;
        case "locate":
          break; // position is already sent on every sync
        case "screenshot":
          status = "failed";
          result = "Capture d'écran non disponible sur ce téléphone";
          break;
        default:
          status = "failed";
          result = "Commande non supportée";
      }
      const ack = { status, ...(result ? { result } : {}) };
      handledCmds.current.set(cmd.id, ack);
      pendingResults.current.push({ id: cmd.id, ...ack });
    }
  }

  async function triggerSOS() {
    if (sosInFlight.current) return; // ignore rapid double-taps → no alert spam
    sosInFlight.current = true;
    try {
      let location: { lat: number; lng: number; accuracy?: number } | undefined;
      try {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        location = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy ?? undefined };
      } catch { /* send without location if unavailable */ }
      // SOS as a panic EVENT with a stable id (deduped server-side, queue-able).
      const sos = { id: sosQueue.newId(), lat: location?.lat, lng: location?.lng, accuracy: location?.accuracy, ts: new Date().toISOString() };
      const sosEvent = {
        id: sos.id,
        type: "panic" as const,
        title: "SOS déclenché",
        detail: location ? JSON.stringify({ lat: location.lat, lng: location.lng }) : undefined,
      };
      // The server marks EVERY pending command "delivered" on any sync — so this
      // SOS sync must also carry pending acks and process returned commands, or a
      // parent command issued just before an SOS would be silently lost.
      const toAck = pendingResults.current.slice();
      // Also flush anything queued from an earlier offline SOS.
      const queuedSos = await sosQueue.list();
      try {
        const res = await childAgent.sync({
          online: true,
          location,
          ...(toAck.length ? { commandResults: toAck } : {}),
          events: [sosEvent, ...sosQueue.toEvents(queuedSos)],
        });
        if (queuedSos.length) sosQueue.removeIds(queuedSos.map((e) => e.id)).catch(() => undefined);
        pendingResults.current = pendingResults.current.filter((r) => !toAck.includes(r));
        processCommands(res.commands);
        RNAlert.alert("SOS envoyé", "Tes parents ont été prévenus avec ta position.");
      } catch {
        // Offline → don't lose it: queue for delivery on the next successful sync.
        await sosQueue.enqueue(sos);
        RNAlert.alert("SOS enregistré", "Pas de réseau pour l'instant — ton SOS sera envoyé automatiquement dès que possible.");
      }
    } catch {
      RNAlert.alert("Erreur", "Impossible d'envoyer le SOS. Réessaie.");
    } finally { sosInFlight.current = false; }
  }

  async function requestTime(minutes: number) {
    if (reqInFlight.current) return; // ignore double-taps → no duplicate request
    reqInFlight.current = true;
    setReqStatus("sending");
    setPickTime(false);
    try {
      // Like SOS above: carry pending acks + process returned commands so a
      // command issued right before this request isn't lost to the server's
      // "mark all delivered on every sync" step.
      const toAck = pendingResults.current.slice();
      const res = await childAgent.sync({
        online: true,
        timeRequest: { minutes, reason: "Demande depuis l'appareil" },
        ...(toAck.length ? { commandResults: toAck } : {}),
        events: [{ type: "time_request", title: `Demande de +${minutes} min` }],
      });
      pendingResults.current = pendingResults.current.filter((r) => !toAck.includes(r));
      processCommands(res.commands);
      if (!mounted.current) return;
      setReqStatus("sent");
      pop.setValue(0);
      Animated.spring(pop, { toValue: 1, friction: 5, tension: 130, useNativeDriver: true }).start();
    } catch {
      setReqStatus("idle");
      RNAlert.alert("Oups", "La demande n'est pas partie. Réessaie dans un instant.");
    } finally { reqInFlight.current = false; }
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
        {welcome && (
          <View style={s.welcome}>
            <Text style={s.welcomeText}>🎉 Bienvenue dans Kidora !</Text>
            <Text style={s.welcomeSub}>Ici, tu es protégé·e. Bonne journée ! ✨</Text>
          </View>
        )}

        {remoteLocked && (
          <View style={{ backgroundColor: "rgba(254,226,226,0.96)", borderRadius: 18, paddingVertical: 14, paddingHorizontal: 18, marginBottom: 12, width: "100%", alignItems: "center" }}>
            <Text style={{ color: "#b91c1c", fontWeight: "800", fontSize: 15 }}>🔒 Ton téléphone est verrouillé par un parent</Text>
          </View>
        )}

        {parentMsg && (
          <View style={{ backgroundColor: "rgba(255,255,255,0.96)", borderRadius: 18, padding: 16, marginBottom: 12, width: "100%" }}>
            <Text style={{ color: "#4338ca", fontWeight: "800", fontSize: 13, marginBottom: 4 }}>💬 Message d'un parent</Text>
            <Text style={{ color: "#1e1b4b", fontSize: 15, lineHeight: 21 }}>{parentMsg}</Text>
            <Pressable onPress={() => setParentMsg(null)} accessibilityRole="button" accessibilityLabel="J'ai lu le message" style={{ alignSelf: "flex-end", marginTop: 10, backgroundColor: "#6366f1", borderRadius: 12, paddingVertical: 8, paddingHorizontal: 18 }}>
              <Text style={{ color: "#fff", fontWeight: "700" }}>J'ai lu 💜</Text>
            </Pressable>
          </View>
        )}

        <View style={[s.badge, { backgroundColor: paused ? "rgba(254,243,199,0.95)" : (active && !syncError) ? "rgba(220,252,231,0.95)" : "rgba(254,226,226,0.95)" }]}>
          <Text style={[s.badgeText, { color: paused ? "#b45309" : (active && !syncError) ? "#15803d" : "#b91c1c" }]}>{status}</Text>
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
              source={paused ? require("../assets/mascot-pause.png") : bedtime ? require("../assets/mascot-sleep.png") : require("../assets/mascot.png")}
              style={s.mascot}
              resizeMode="contain"
              accessibilityLabel={paused ? "Mascotte Kidora qui fait une pause" : bedtime ? "Mascotte Kidora endormie" : "Mascotte Kidora"}
            />
          </Animated.View>
          {paused && <Text style={s.mascotBadge}>⏸</Text>}
        </View>

        <Text style={s.title}>{paused ? "C'est l'heure d'une petite pause 😌" : "Tu es protégé·e ✨"}</Text>
        <Text style={s.desc}>
          {paused
            ? "Tes parents ont mis l'appareil en pause. Ça reviendra vite — profites-en pour souffler 😊"
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
            <Image source={require("../assets/freetime.png")} style={s.freetimeImg} resizeMode="contain" accessibilityLabel="Temps libre : joue et amuse-toi" />
            <Text style={s.stRemain}>☀️  Temps libre aujourd'hui</Text>
            <Text style={s.stMeta}>Pas de limite — profite et amuse-toi !</Text>
            <Text style={s.stCheer}>{formatDuration(usedTodaySec)} d'écran · pense à bouger 💚</Text>
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

        {denied && (
          <View style={s.denied}>
            <Text style={s.deniedText}>Ta demande de temps a été refusée cette fois 💛</Text>
          </View>
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
  welcome: { marginBottom: 20, backgroundColor: "rgba(187,247,208,0.96)", borderRadius: 16, paddingHorizontal: 20, paddingVertical: 13, alignItems: "center" },
  welcomeText: { color: "#166534", fontWeight: "800", fontSize: 16 },
  welcomeSub: { color: "#15803d", fontWeight: "600", fontSize: 13, marginTop: 2, textAlign: "center" },
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
  freetimeImg: { width: 92, height: 92, marginBottom: 2 },
  stRemain: { color: "#fff", fontWeight: "800", fontSize: 19 },
  stTrack: { marginTop: 12, width: "100%", height: 12, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.22)", overflow: "hidden" },
  stFill: { height: "100%", borderRadius: 999 },
  stMeta: { color: "#c7d2fe", fontSize: 12.5, marginTop: 8 },
  stCheer: { color: "#e0e7ff", fontWeight: "700", fontSize: 13.5, marginTop: 6 },
  timeBtn: { marginTop: 16, backgroundColor: "#facc15", paddingHorizontal: 28, paddingVertical: 15, borderRadius: 16, minWidth: 240, alignItems: "center", shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 5 },
  pendingReq: { marginTop: 16, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 14, paddingHorizontal: 18, paddingVertical: 13, minWidth: 240, alignItems: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)" },
  pendingReqText: { color: "#e0e7ff", fontWeight: "700", fontSize: 14 },
  denied: { marginTop: 16, backgroundColor: "rgba(254,226,226,0.96)", borderRadius: 14, paddingHorizontal: 18, paddingVertical: 13, minWidth: 240, alignItems: "center" },
  deniedText: { color: "#b91c1c", fontWeight: "700", fontSize: 14, textAlign: "center" },
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
