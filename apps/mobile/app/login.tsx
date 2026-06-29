import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, Alert as RNAlert, ScrollView } from "react-native";
import { router } from "expo-router";
import { parent, childAgent, getServer } from "@/api";

export default function Login() {
  const [mode, setMode] = useState<"parent" | "child">("parent");
  const [server, setServer] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const srv = server.trim() || (await getServer());
      if (mode === "parent") {
        await parent.login(email.trim(), password, srv);
        router.replace("/parent");
      } else {
        await childAgent.enroll(token.trim(), srv, { model: "Mobile", agentVersion: "1.0.0" });
        router.replace("/child-mode");
      }
    } catch (e) {
      RNAlert.alert("Erreur", e instanceof Error ? e.message : "Connexion impossible");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={s.container}>
      <View style={s.logo}><Text style={s.logoText}>K</Text></View>
      <Text style={s.title}>Kidora</Text>
      <Text style={s.subtitle}>Contrôle parental</Text>

      <View style={s.toggle}>
        <Pressable style={[s.toggleBtn, mode === "parent" && s.toggleOn]} onPress={() => setMode("parent")}>
          <Text style={[s.toggleText, mode === "parent" && s.toggleTextOn]}>Je suis parent</Text>
        </Pressable>
        <Pressable style={[s.toggleBtn, mode === "child" && s.toggleOn]} onPress={() => setMode("child")}>
          <Text style={[s.toggleText, mode === "child" && s.toggleTextOn]}>Appareil enfant</Text>
        </Pressable>
      </View>

      <TextInput style={s.input} placeholder="Serveur (https://…)" autoCapitalize="none" value={server} onChangeText={setServer} />

      {mode === "parent" ? (
        <>
          <TextInput style={s.input} placeholder="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
          <TextInput style={s.input} placeholder="Mot de passe" secureTextEntry value={password} onChangeText={setPassword} />
        </>
      ) : (
        <TextInput style={s.input} placeholder="Jeton d'enrôlement" autoCapitalize="none" value={token} onChangeText={setToken} />
      )}

      <Pressable style={[s.button, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy}>
        <Text style={s.buttonText}>{busy ? "…" : mode === "parent" ? "Se connecter" : "Connecter l'appareil"}</Text>
      </Pressable>

      <Text style={s.hint}>
        {mode === "parent"
          ? "Démo : demo@kidora.app / kidora1234"
          : "Le jeton se trouve dans le dashboard : enfant → Appareils."}
      </Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { padding: 24, alignItems: "center", paddingTop: 48 },
  logo: { width: 64, height: 64, borderRadius: 18, backgroundColor: "#4f46e5", alignItems: "center", justifyContent: "center" },
  logoText: { color: "#fff", fontSize: 32, fontWeight: "800" },
  title: { fontSize: 28, fontWeight: "800", marginTop: 12 },
  subtitle: { color: "#64748b", marginBottom: 24 },
  toggle: { flexDirection: "row", backgroundColor: "#e2e8f0", borderRadius: 12, padding: 4, marginBottom: 20, width: "100%" },
  toggleBtn: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: "center" },
  toggleOn: { backgroundColor: "#fff" },
  toggleText: { color: "#64748b", fontWeight: "600" },
  toggleTextOn: { color: "#0f172a" },
  input: { width: "100%", backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, padding: 14, marginBottom: 12, fontSize: 15 },
  button: { width: "100%", backgroundColor: "#4f46e5", borderRadius: 10, padding: 16, alignItems: "center", marginTop: 4 },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  hint: { color: "#94a3b8", fontSize: 13, marginTop: 16, textAlign: "center" },
});
