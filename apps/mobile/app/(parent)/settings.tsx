import { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, TextInput, Switch, Image, Pressable, Alert as RNAlert } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { parent, getServer, type Guardian } from "@/api";
import * as storage from "@/storage";
import { useTheme, space, radius } from "@/theme";
import { Card, H1, Muted, Btn, IconBubble } from "@/ui";

const NOTIF_LABELS: Record<string, string> = {
  new_app: "Nouvelle application détectée",
  limit_reached: "Limite de temps atteinte",
  blocked_attempt: "Tentative bloquée (site/app)",
  geofence: "Entrée / sortie de zone",
  keyword: "Mot-clé sensible",
  device_offline: "Appareil hors-ligne",
};

export default function Settings() {
  const { c } = useTheme();
  const [server, setServer] = useState("");
  const [name, setName] = useState<string | null>(null);
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailPw, setEmailPw] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [muted, setMuted] = useState<string[] | null>(null);
  const [mutable, setMutable] = useState<string[]>([]);
  const [tfaEnabled, setTfaEnabled] = useState<boolean | null>(null);
  const [tfaQr, setTfaQr] = useState<string | null>(null);
  const [tfaSecret, setTfaSecret] = useState<string | null>(null);
  const [tfaCode, setTfaCode] = useState("");
  const [tfaBusy, setTfaBusy] = useState(false);
  const [tfaDisarm, setTfaDisarm] = useState(false);
  const [tfaBackupCodes, setTfaBackupCodes] = useState<string[] | null>(null);
  const [guardians, setGuardians] = useState<Guardian[] | null>(null);
  const [coEmail, setCoEmail] = useState("");
  const [coBusy, setCoBusy] = useState(false);

  const loadGuardians = useCallback(async () => {
    try { setGuardians((await parent.guardians()).guardians); }
    catch { /* unavailable — hide the card */ }
  }, []);

  useEffect(() => {
    (async () => {
      setServer(await getServer());
      setName(await storage.get("parentName"));
      try {
        const p = await parent.notificationPrefs();
        setMuted(p.mutedTypes);
        setMutable(p.mutableTypes);
      } catch { /* prefs unavailable — hide the card */ }
      try {
        const s = await parent.twoFactorStatus();
        setTfaEnabled(s.enabled);
      } catch { /* 2FA status unavailable — hide the card */ }
      loadGuardians();
    })();
  }, [loadGuardians]);

  async function inviteGuardian() {
    if (!coEmail.includes("@")) return;
    setCoBusy(true);
    try {
      const r = await parent.addGuardian(coEmail.trim().toLowerCase());
      setCoEmail("");
      await loadGuardians();
      RNAlert.alert("Kidora", `${r.added} a désormais accès à ${r.children} enfant${r.children > 1 ? "s" : ""}.`);
    } catch (e) {
      RNAlert.alert("Erreur", e instanceof Error ? e.message : "Invitation impossible");
    } finally { setCoBusy(false); }
  }

  function confirmRevoke(g: Guardian) {
    RNAlert.alert("Retirer l'accès", `Retirer l'accès de ${g.name} (${g.email}) ?`, [
      { text: "Annuler", style: "cancel" },
      { text: "Retirer", style: "destructive", onPress: () => revokeGuardian(g) },
    ]);
  }
  async function revokeGuardian(g: Guardian) {
    const prev = guardians;
    setGuardians((gs) => (gs ? gs.filter((x) => x.id !== g.id) : gs)); // optimistic
    try { await parent.removeGuardian(g.id); }
    catch { setGuardians(prev); RNAlert.alert("Erreur", "Action impossible"); }
  }

  async function startEnroll() {
    setTfaBusy(true);
    try {
      const r = await parent.twoFactorEnroll();
      setTfaQr(r.qr);
      setTfaSecret(r.secret);
      setTfaCode("");
    } catch (e) {
      RNAlert.alert("Erreur", e instanceof Error ? e.message : "Impossible de démarrer la 2FA");
    } finally {
      setTfaBusy(false);
    }
  }

  async function confirmEnroll() {
    if (tfaCode.length < 6) return;
    setTfaBusy(true);
    try {
      const r = await parent.twoFactorVerify(tfaCode.trim());
      setTfaEnabled(true);
      setTfaQr(null);
      setTfaSecret(null);
      setTfaCode("");
      setTfaBackupCodes(r.backupCodes ?? null);
      RNAlert.alert("Kidora", "Double authentification activée ✅");
    } catch (e) {
      RNAlert.alert("Erreur", e instanceof Error ? e.message : "Code invalide");
    } finally {
      setTfaBusy(false);
    }
  }

  async function disable2fa() {
    if (tfaCode.trim().length < 6) return;
    setTfaBusy(true);
    try {
      await parent.twoFactorDisable(tfaCode.trim());
      setTfaEnabled(false);
      setTfaDisarm(false);
      setTfaCode("");
      RNAlert.alert("Kidora", "Double authentification désactivée.");
    } catch (e) {
      RNAlert.alert("Erreur", e instanceof Error ? e.message : "Code invalide");
    } finally {
      setTfaBusy(false);
    }
  }

  async function toggleNotif(type: string) {
    if (!muted) return;
    const next = muted.includes(type) ? muted.filter((t) => t !== type) : [...muted, type];
    const prev = muted;
    setMuted(next); // optimistic
    try {
      const r = await parent.setNotificationPrefs(next);
      setMuted(r.mutedTypes);
    } catch {
      setMuted(prev);
    }
  }

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

  async function changeEmail() {
    if (!newEmail.includes("@") || emailPw.length < 1) return;
    setEmailBusy(true);
    try {
      await parent.changeEmail(newEmail.trim(), emailPw);
      setNewEmail("");
      setEmailPw("");
      RNAlert.alert("Kidora", "Adresse email mise à jour ✅");
    } catch (e) {
      RNAlert.alert("Erreur", e instanceof Error ? e.message : "Impossible de changer l'email");
    } finally {
      setEmailBusy(false);
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

        <Card>
          <Text style={{ fontSize: 15, fontWeight: "800", color: c.text, marginBottom: 4 }}>✉️ Changer l&apos;adresse email</Text>
          <Muted>Confirmez avec votre mot de passe actuel.</Muted>
          <TextInput
            style={{ marginTop: space.md, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, color: c.text, paddingHorizontal: 14, minHeight: 48, fontSize: 15 }}
            placeholder="Nouvelle adresse email" placeholderTextColor={c.textFaint} keyboardType="email-address" autoCapitalize="none"
            value={newEmail} onChangeText={setNewEmail} accessibilityLabel="Nouvelle adresse email"
          />
          <TextInput
            style={{ marginTop: space.sm, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, color: c.text, paddingHorizontal: 14, minHeight: 48, fontSize: 15 }}
            placeholder="Mot de passe (confirmation)" placeholderTextColor={c.textFaint} secureTextEntry autoCapitalize="none"
            value={emailPw} onChangeText={setEmailPw} accessibilityLabel="Mot de passe de confirmation"
          />
          <View style={{ marginTop: space.md }}>
            <Btn title="Mettre à jour" icon="mail" loading={emailBusy} disabled={!newEmail.includes("@") || emailPw.length < 1} onPress={changeEmail} full />
          </View>
        </Card>

        {muted && mutable.length > 0 && (
          <Card>
            <Text style={{ fontSize: 15, fontWeight: "800", color: c.text, marginBottom: 4 }}>🔔 Notifications d&apos;alerte</Text>
            <Muted>Les alertes de sécurité (SOS, risque) restent toujours actives.</Muted>
            <View style={{ marginTop: space.sm }}>
              {mutable.map((type) => (
                <View key={type} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.border }}>
                  <Text style={{ flex: 1, fontSize: 14, color: c.text, paddingRight: 12 }}>{NOTIF_LABELS[type] ?? type}</Text>
                  <Switch
                    value={!muted.includes(type)}
                    onValueChange={() => toggleNotif(type)}
                    trackColor={{ false: c.border, true: c.primary }}
                    accessibilityLabel={NOTIF_LABELS[type] ?? type}
                  />
                </View>
              ))}
            </View>
          </Card>
        )}

        {tfaEnabled !== null && (
          <Card>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <Text style={{ fontSize: 15, fontWeight: "800", color: c.text }}>🔐 Double authentification</Text>
              {tfaEnabled && <Text style={{ fontSize: 12, fontWeight: "700", color: c.success }}>Activée ✓</Text>}
            </View>
            <Muted>Un code à usage unique (Google Authenticator, Authy…) en plus du mot de passe.</Muted>

            {tfaBackupCodes ? (
              <View style={{ marginTop: space.md, padding: space.md, borderRadius: radius.md, backgroundColor: c.warnSoft, borderWidth: 1, borderColor: c.warn + "55" }}>
                <Text style={{ fontSize: 14, fontWeight: "800", color: c.text, marginBottom: 4 }}>🔑 Vos codes de secours</Text>
                <Muted style={{ fontSize: 12 }}>À conserver précieusement : chacun sert une seule fois pour vous connecter ou désactiver la 2FA si vous perdez votre application. Ils ne seront plus affichés.</Muted>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.sm }}>
                  {tfaBackupCodes.map((bc) => (
                    <Text key={bc} selectable style={{ fontFamily: "monospace", fontSize: 14, fontWeight: "700", color: c.text, backgroundColor: c.surface, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.sm, letterSpacing: 1 }}>{bc}</Text>
                  ))}
                </View>
                <View style={{ marginTop: space.md }}>
                  <Btn title="J'ai noté ces codes" icon="checkmark" onPress={() => setTfaBackupCodes(null)} full />
                </View>
              </View>
            ) : tfaEnabled ? (
              tfaDisarm ? (
                <View style={{ marginTop: space.md }}>
                  <Muted style={{ fontSize: 12, marginBottom: space.sm }}>Saisissez un code de votre application ou un code de secours.</Muted>
                  <TextInput
                    style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, color: c.text, paddingHorizontal: 14, minHeight: 48, fontSize: 16, letterSpacing: 3, textAlign: "center" }}
                    placeholder="Code 2FA ou de secours" placeholderTextColor={c.textFaint} autoCapitalize="characters" maxLength={12}
                    value={tfaCode} onChangeText={setTfaCode} accessibilityLabel="Code de confirmation"
                  />
                  <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.md }}>
                    <View style={{ flex: 1 }}><Btn title="Annuler" variant="ghost" onPress={() => { setTfaDisarm(false); setTfaCode(""); }} full /></View>
                    <View style={{ flex: 1 }}><Btn title="Désactiver" variant="danger" loading={tfaBusy} disabled={tfaCode.trim().length < 6} onPress={disable2fa} full /></View>
                  </View>
                </View>
              ) : (
                <View style={{ marginTop: space.md }}>
                  <Btn title="Désactiver la 2FA" variant="danger" icon="lock-open" onPress={() => { setTfaCode(""); setTfaDisarm(true); }} full />
                </View>
              )
            ) : tfaQr ? (
              <View style={{ marginTop: space.md, alignItems: "center" }}>
                <Text style={{ fontSize: 13, color: c.text, alignSelf: "stretch", marginBottom: space.sm }}>1. Scannez ce QR code dans votre application d&apos;authentification :</Text>
                <Image source={{ uri: tfaQr }} style={{ width: 200, height: 200, borderRadius: radius.md, backgroundColor: "#fff" }} accessibilityLabel="QR code 2FA" />
                {tfaSecret && (
                  <Text selectable style={{ fontSize: 12, color: c.textFaint, marginTop: space.sm, fontFamily: "monospace" }}>{tfaSecret}</Text>
                )}
                <Text style={{ fontSize: 13, color: c.text, alignSelf: "stretch", marginTop: space.md, marginBottom: space.sm }}>2. Saisissez le code à 6 chiffres généré :</Text>
                <TextInput
                  style={{ alignSelf: "stretch", backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, color: c.text, paddingHorizontal: 14, minHeight: 48, fontSize: 18, letterSpacing: 6, textAlign: "center" }}
                  placeholder="123456" placeholderTextColor={c.textFaint} keyboardType="number-pad" maxLength={6}
                  value={tfaCode} onChangeText={setTfaCode} accessibilityLabel="Code de vérification"
                />
                <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.md, alignSelf: "stretch" }}>
                  <View style={{ flex: 1 }}><Btn title="Annuler" variant="ghost" onPress={() => { setTfaQr(null); setTfaSecret(null); setTfaCode(""); }} full /></View>
                  <View style={{ flex: 1 }}><Btn title="Activer" icon="checkmark" loading={tfaBusy} disabled={tfaCode.trim().length < 6} onPress={confirmEnroll} full /></View>
                </View>
              </View>
            ) : (
              <View style={{ marginTop: space.md }}>
                <Btn title="Activer la 2FA" icon="shield-checkmark" loading={tfaBusy} onPress={startEnroll} full />
              </View>
            )}
          </Card>
        )}

        {guardians !== null && (
          <Card>
            <Text style={{ fontSize: 15, fontWeight: "800", color: c.text, marginBottom: 4 }}>👨‍👩‍👧 Co-parents</Text>
            <Muted>Partagez l&apos;accès à tous vos enfants avec un autre compte Kidora (révocable).</Muted>

            {guardians.length > 0 && (
              <View style={{ marginTop: space.sm }}>
                {guardians.map((g) => (
                  <View key={g.id} style={{ flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.border }}>
                    <IconBubble icon="person" color={c.primary} size={36} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: "700", color: c.text }} numberOfLines={1}>{g.name}</Text>
                      <Muted style={{ fontSize: 12 }} numberOfLines={1}>{g.email} · {g.children.length} enfant{g.children.length > 1 ? "s" : ""}</Muted>
                    </View>
                    <Pressable onPress={() => confirmRevoke(g)} hitSlop={10} accessibilityLabel={`Retirer ${g.name}`} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
                      <Ionicons name="close-circle" size={22} color={c.textFaint} />
                    </Pressable>
                  </View>
                ))}
              </View>
            )}

            <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.md }}>
              <TextInput
                style={{ flex: 1, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, color: c.text, paddingHorizontal: 14, minHeight: 48, fontSize: 15 }}
                placeholder="email@du-co-parent" placeholderTextColor={c.textFaint} keyboardType="email-address" autoCapitalize="none"
                value={coEmail} onChangeText={setCoEmail} accessibilityLabel="Email du co-parent"
              />
              <Btn title="Inviter" icon="person-add" loading={coBusy} disabled={!coEmail.includes("@")} onPress={inviteGuardian} />
            </View>
          </Card>
        )}

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
