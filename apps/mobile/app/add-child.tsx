import { useState } from "react";
import { View, Text, TextInput, ScrollView, Pressable, Alert as RNAlert } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { parent, getServer } from "@/api";
import { useTheme, space, radius } from "@/theme";
import { Btn } from "@/ui";

const AVATARS = ["🧒", "👧", "👦", "🧑", "👶", "🐣", "🦊", "🐼"];
const PLATFORMS: { key: string; label: string }[] = [
  { key: "windows", label: "Windows" },
  { key: "android", label: "Android" },
  { key: "ios", label: "iPhone / iPad" },
  { key: "macos", label: "macOS" },
];

// In-app onboarding: create a child, then a device, then show the enrollment
// token + deep-link — so a parent never has to open the web dashboard first.
export default function AddChild() {
  const { c } = useTheme();
  // When opened with ?childId=… we're adding a device to an EXISTING child, so we
  // skip the child-creation step.
  const params = useLocalSearchParams<{ childId?: string; childName?: string }>();
  const existing = !!params.childId;
  const [step, setStep] = useState<"child" | "device" | "done">(existing ? "device" : "child");
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState(params.childName ?? "");
  const [avatar, setAvatar] = useState(AVATARS[0]);
  const [childId, setChildId] = useState<string | null>(params.childId ?? null);

  const [deviceName, setDeviceName] = useState(existing && params.childName ? `PC de ${params.childName}` : "");
  const [platform, setPlatform] = useState("windows");
  const [token, setToken] = useState<string | null>(null);
  const [server, setServer] = useState("");

  const input = { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, color: c.text, paddingHorizontal: 14, minHeight: 50, fontSize: 15 } as const;

  async function createChild() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await parent.createChild(name.trim(), avatar);
      setChildId(res.child.id);
      setDeviceName(platform === "windows" ? "PC de " + name.trim() : "Appareil de " + name.trim());
      setStep("device");
    } catch (e) {
      RNAlert.alert("Erreur", e instanceof Error ? e.message : "Création impossible");
    } finally {
      setBusy(false);
    }
  }

  async function createDevice() {
    if (!childId || !deviceName.trim()) return;
    setBusy(true);
    try {
      const res = await parent.createDevice(childId, deviceName.trim(), platform);
      setToken(res.device.enrollToken);
      setServer(await getServer());
      setStep("done");
    } catch (e) {
      RNAlert.alert("Erreur", e instanceof Error ? e.message : "Création impossible");
    } finally {
      setBusy(false);
    }
  }

  const deepLink = token ? `kidorachild://enroll?token=${encodeURIComponent(token)}&server=${encodeURIComponent(server)}` : "";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: space.md }}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Retour"><Ionicons name="chevron-back" size={26} color={c.text} /></Pressable>
        <Text style={{ fontSize: 20, fontWeight: "800", color: c.text }}>{existing ? "Ajouter un appareil" : "Ajouter un enfant"}</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg }} keyboardShouldPersistTaps="handled">
        {step === "child" && (
          <>
            <Text style={{ color: c.textMuted }}>Comment s'appelle votre enfant ?</Text>
            <TextInput style={input} placeholder="Prénom" placeholderTextColor={c.textFaint} value={name} onChangeText={setName} autoFocus accessibilityLabel="Prénom de l'enfant" />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {AVATARS.map((a) => (
                <Pressable key={a} onPress={() => setAvatar(a)} accessibilityLabel={`Avatar ${a}`} style={{ width: 48, height: 48, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: avatar === a ? c.primarySoft : c.surface, borderWidth: 1, borderColor: avatar === a ? c.primary : c.border }}>
                  <Text style={{ fontSize: 24 }}>{a}</Text>
                </Pressable>
              ))}
            </View>
            <Btn title="Continuer" icon="arrow-forward" loading={busy} onPress={createChild} full />
          </>
        )}

        {step === "device" && (
          <>
            <Text style={{ color: c.textMuted }}>Sur quel appareil surveiller {name.trim()} ?</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {PLATFORMS.map((p) => (
                <Pressable key={p.key} onPress={() => setPlatform(p.key)} accessibilityLabel={p.label} style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.pill, backgroundColor: platform === p.key ? c.primarySoft : c.surface, borderWidth: 1, borderColor: platform === p.key ? c.primary : c.border }}>
                  <Text style={{ color: platform === p.key ? c.primary : c.text, fontWeight: "600" }}>{p.label}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput style={input} placeholder="Nom de l'appareil" placeholderTextColor={c.textFaint} value={deviceName} onChangeText={setDeviceName} accessibilityLabel="Nom de l'appareil" />
            <Btn title="Créer l'appareil" icon="checkmark" loading={busy} onPress={createDevice} full />
          </>
        )}

        {step === "done" && token && (
          <>
            <View style={{ alignItems: "center", gap: 8 }}>
              <Ionicons name="checkmark-circle" size={48} color={c.success} />
              <Text style={{ fontSize: 18, fontWeight: "800", color: c.text }}>Appareil créé 🎉</Text>
            </View>
            <Text style={{ color: c.textMuted }}>
              {platform === "windows"
                ? "Installez l'agent Kidora sur ce PC (installateur pré-configuré depuis le tableau de bord web, ou collez le jeton ci-dessous)."
                : "Ouvrez Kidora Kids sur l'appareil de l'enfant et saisissez ce jeton (ou le lien) pour le connecter."}
            </Text>
            <View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, padding: 14, gap: 8 }}>
              <Text style={{ color: c.textFaint, fontSize: 12 }}>Jeton d'enrôlement</Text>
              <Text selectable style={{ color: c.text, fontFamily: "monospace", fontSize: 14 }}>{token}</Text>
            </View>
            <View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, padding: 14, gap: 8 }}>
              <Text style={{ color: c.textFaint, fontSize: 12 }}>Lien d'appairage (à ouvrir sur l'appareil enfant)</Text>
              <Text selectable style={{ color: c.text, fontSize: 12 }}>{deepLink}</Text>
            </View>
            <Btn title="Terminé" icon="home" onPress={() => router.replace("/(parent)")} full />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
