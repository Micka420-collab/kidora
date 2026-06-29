import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, Alert as RNAlert, ScrollView } from "react-native";
import { router } from "expo-router";
import Constants from "expo-constants";
import { parent, childAgent, getServer } from "@/api";

const ROLE = (Constants.expoConfig?.extra?.role as "parent" | "child") ?? "parent";
const isChild = ROLE === "child";

export default function Login() {
  const [server, setServer] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const srv = server.trim() || (await getServer());
      if (isChild) {
        await childAgent.enroll(token.trim(), srv, { model: "Mobile", agentVersion: "1.0.0" });
        router.replace("/child-mode");
      } else {
        await parent.login(email.trim(), password, srv);
        router.replace("/parent");
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
      <Text style={s.title}>{isChild ? "Kidora Kids" : "Kidora Parents"}</Text>
      <Text style={s.subtitle}>{isChild ? "Connecter cet appareil" : "Espace parent"}</Text>

      <TextInput
        style={s.input}
        placeholder="Serveur (https://…)"
        autoCapitalize="none"
        value={server}
        onChangeText={setServer}
        accessibilityLabel="Adresse du serveur Kidora"
      />

      {isChild ? (
        <TextInput
          style={s.input}
          placeholder="Jeton d'enrôlement"
          autoCapitalize="none"
          value={token}
          onChangeText={setToken}
          accessibilityLabel="Jeton d'enrôlement de l'appareil"
        />
      ) : (
        <>
          <TextInput style={s.input} placeholder="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} accessibilityLabel="Email" />
          <TextInput style={s.input} placeholder="Mot de passe" secureTextEntry value={password} onChangeText={setPassword} accessibilityLabel="Mot de passe" />
        </>
      )}

      <Pressable style={[s.button, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy} accessibilityRole="button">
        <Text style={s.buttonText}>{busy ? "…" : isChild ? "Connecter l'appareil" : "Se connecter"}</Text>
      </Pressable>

      <Text style={s.hint}>
        {isChild
          ? "Le jeton se trouve dans l'app parent : enfant → Appareils."
          : "Démo : demo@kidora.app / kidora1234"}
      </Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { padding: 24, alignItems: "center", paddingTop: 64 },
  logo: { width: 64, height: 64, borderRadius: 18, backgroundColor: "#4f46e5", alignItems: "center", justifyContent: "center" },
  logoText: { color: "#fff", fontSize: 32, fontWeight: "800" },
  title: { fontSize: 28, fontWeight: "800", marginTop: 12 },
  subtitle: { color: "#64748b", marginBottom: 24 },
  input: { width: "100%", backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, padding: 14, marginBottom: 12, fontSize: 15, minHeight: 48 },
  button: { width: "100%", backgroundColor: "#4f46e5", borderRadius: 10, padding: 16, alignItems: "center", marginTop: 4, minHeight: 52, justifyContent: "center" },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  hint: { color: "#94a3b8", fontSize: 13, marginTop: 16, textAlign: "center" },
});
