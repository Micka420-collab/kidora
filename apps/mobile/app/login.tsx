import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, KeyboardAvoidingView, Platform, Alert as RNAlert, ScrollView, Animated, Easing } from "react-native";
import { router } from "expo-router";
import Constants from "expo-constants";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { parent, childAgent, getServer } from "@/api";
import { useTheme, space, radius } from "@/theme";
import { Btn } from "@/ui";

const ROLE = (Constants.expoConfig?.extra?.role as "parent" | "child") ?? "parent";
const isChild = ROLE === "child";

export default function Login() {
  const { c, gradient } = useTheme();
  const [server, setServer] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const fade = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 550, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(slide, { toValue: 0, duration: 550, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [fade, slide]);

  async function submit() {
    setBusy(true);
    try {
      const srv = server.trim() || (await getServer());
      if (isChild) {
        await childAgent.enroll(token.trim(), srv, { model: "Mobile", agentVersion: "1.0.0" });
        router.replace("/child-mode");
      } else {
        await parent.login(email.trim(), password, srv);
        router.replace("/(parent)");
      }
    } catch (e) {
      RNAlert.alert("Erreur", e instanceof Error ? e.message : "Connexion impossible");
    } finally {
      setBusy(false);
    }
  }

  const inputStyle = { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, color: c.text, paddingHorizontal: 14, fontSize: 15, minHeight: 52, flex: 1 } as const;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: space.xl }} keyboardShouldPersistTaps="handled">
          <Animated.View style={{ opacity: fade, transform: [{ translateY: slide }], gap: space.lg }}>
            <View style={{ alignItems: "center", gap: 10, marginBottom: space.sm }}>
              <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 80, height: 80, borderRadius: 26, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 40 }}>🛡️</Text>
              </LinearGradient>
              <Text style={{ fontSize: 28, fontWeight: "800", color: c.text }}>{isChild ? "Kidora Kids" : "Kidora Parents"}</Text>
              <Text style={{ color: c.textMuted, fontSize: 14 }}>{isChild ? "Connecter cet appareil" : "Veillez sur votre famille, avec bienveillance."}</Text>
            </View>

            <Field icon="server-outline">
              <TextInput style={inputStyle} placeholder="Serveur (https://…)" placeholderTextColor={c.textFaint} autoCapitalize="none" value={server} onChangeText={setServer} accessibilityLabel="Adresse du serveur Kidora" />
            </Field>

            {isChild ? (
              <Field icon="key-outline">
                <TextInput style={inputStyle} placeholder="Jeton d'enrôlement" placeholderTextColor={c.textFaint} autoCapitalize="none" value={token} onChangeText={setToken} accessibilityLabel="Jeton d'enrôlement" />
              </Field>
            ) : (
              <>
                <Field icon="mail-outline">
                  <TextInput style={inputStyle} placeholder="Email" placeholderTextColor={c.textFaint} autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} accessibilityLabel="Email" />
                </Field>
                <Field icon="lock-closed-outline">
                  <TextInput style={inputStyle} placeholder="Mot de passe" placeholderTextColor={c.textFaint} secureTextEntry value={password} onChangeText={setPassword} accessibilityLabel="Mot de passe" />
                </Field>
              </>
            )}

            <Btn title={isChild ? "Connecter l'appareil" : "Se connecter"} icon="arrow-forward" loading={busy} onPress={submit} full />

            <Text style={{ color: c.textFaint, fontSize: 13, textAlign: "center", marginTop: 4 }}>
              {isChild ? "Le jeton est dans l'app parent : enfant → Appareils." : "Démo : demo@kidora.app / kidora1234"}
            </Text>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ icon, children }: { icon: string; children: React.ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <View style={{ position: "absolute", left: 0, zIndex: 1, width: 44, alignItems: "center" }} pointerEvents="none">
        <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={18} color={c.textFaint} />
      </View>
      <View style={{ flex: 1, paddingLeft: 30 }}>{children}</View>
    </View>
  );
}
