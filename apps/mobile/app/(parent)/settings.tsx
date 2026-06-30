import { useEffect, useState } from "react";
import { View, Text, ScrollView, TextInput, Alert as RNAlert } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { parent, getServer } from "@/api";
import * as storage from "@/storage";
import { useTheme, space, radius } from "@/theme";
import { Card, H1, Muted, Btn, IconBubble } from "@/ui";

export default function Settings() {
  const { c } = useTheme();
  const [server, setServer] = useState("");
  const [name, setName] = useState<string | null>(null);
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pwBusy, setPwBusy] = useState(false);

  useEffect(() => {
    (async () => {
      setServer(await getServer());
      setName(await storage.get("parentName"));
    })();
  }, []);

  async function changePassword() {
    if (curPw.length < 1 || newPw.length < 8) return;
    setPwBusy(true);
    try {
      await parent.changePassword(curPw, newPw);
      setCurPw("");
      setNewPw("");
      RNAlert.alert("Kidora", "Mot de passe mis à jour ✅");
    } catch (e) {
      RNAlert.alert("Erreur", e instanceof Error ? e.message : "Impossible de changer le mot de passe");
    } finally {
      setPwBusy(false);
    }
  }

  function confirmLogout() {
    RNAlert.alert("Déconnexion", "Se déconnecter de Kidora ?", [
      { text: "Annuler", style: "cancel" },
      { text: "Déconnexion", style: "destructive", onPress: async () => { await parent.logout(); router.replace("/login"); } },
    ]);
  }

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxxl, gap: space.lg }}>
        <H1>Réglages</H1>

        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
            <IconBubble icon="person-circle" color={c.primary} size={48} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: "800", color: c.text }}>{name ?? "Compte parent"}</Text>
              <Muted>Connecté à Kidora</Muted>
            </View>
          </View>
        </Card>

        <Card>
          <Text style={{ fontSize: 15, fontWeight: "800", color: c.text, marginBottom: 4 }}>🔒 Changer le mot de passe</Text>
          <Muted>Le nouveau mot de passe doit résister aux fuites connues.</Muted>
          <TextInput
            style={{ marginTop: space.md, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, color: c.text, paddingHorizontal: 14, minHeight: 48, fontSize: 15 }}
            placeholder="Mot de passe actuel" placeholderTextColor={c.textFaint} secureTextEntry autoCapitalize="none"
            value={curPw} onChangeText={setCurPw} accessibilityLabel="Mot de passe actuel"
          />
          <TextInput
            style={{ marginTop: space.sm, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, color: c.text, paddingHorizontal: 14, minHeight: 48, fontSize: 15 }}
            placeholder="Nouveau mot de passe (min. 8)" placeholderTextColor={c.textFaint} secureTextEntry autoCapitalize="none"
            value={newPw} onChangeText={setNewPw} accessibilityLabel="Nouveau mot de passe"
          />
          <View style={{ marginTop: space.md }}>
            <Btn title="Mettre à jour" icon="key" loading={pwBusy} disabled={curPw.length < 1 || newPw.length < 8} onPress={changePassword} full />
          </View>
        </Card>

        <View style={{ gap: space.sm }}>
          <Row icon="server" label="Serveur" value={server} />
          <Row icon="notifications" label="Notifications" value="Alertes critiques via web push" />
          <Row icon="shield-checkmark" label="Confidentialité" value="Vos données restent sur votre serveur" />
        </View>

        <Btn title="Déconnexion" variant="danger" icon="log-out" onPress={confirmLogout} full />

        <View style={{ alignItems: "center", marginTop: space.lg, gap: 4 }}>
          <Text style={{ fontSize: 28 }}>🛡️</Text>
          <Muted>Kidora Parents · v{Constants.expoConfig?.version ?? "1.0.0"}</Muted>
          <Muted style={{ fontSize: 11 }}>Protéger sans surveiller à l'excès.</Muted>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ icon, label, value }: { icon: string; label: string; value: string }) {
  const { c } = useTheme();
  return (
    <Card padded>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
        <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={20} color={c.textMuted} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: c.text }}>{label}</Text>
          <Muted numberOfLines={1}>{value}</Muted>
        </View>
      </View>
    </Card>
  );
}
