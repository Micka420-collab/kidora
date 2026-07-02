import { useEffect, useRef } from "react";
import {
  View, Text, Pressable, ActivityIndicator, Animated, Easing, StyleSheet,
  ScrollView, type ViewStyle, type TextStyle, type StyleProp,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, radius, space, layout, fontCap } from "./theme";

type IoniconName = keyof typeof Ionicons.glyphMap;

// ── Screen wrapper ─────────────────────────────────────────────────────
export function Screen({
  children, scroll = true, refreshControl, edges = ["top"], style,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  refreshControl?: React.ReactElement;
  edges?: ("top" | "bottom" | "left" | "right")[];
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  const inner = (
    <View style={[{ width: "100%", maxWidth: layout.contentMax, alignSelf: "center", padding: space.lg, gap: space.lg }, style]}>
      {children}
    </View>
  );
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: c.bg }}>
      {scroll ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: space.xxxl }}
          refreshControl={refreshControl}
        >
          {inner}
        </ScrollView>
      ) : (
        inner
      )}
    </SafeAreaView>
  );
}

// ── Card ───────────────────────────────────────────────────────────────
export function Card({
  children, style, onPress, elevation = 1, padded = true, accessibilityLabel,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  elevation?: number;
  padded?: boolean;
  accessibilityLabel?: string;
}) {
  const { c, shadow } = useTheme();
  const body = (
    <View
      style={[
        {
          backgroundColor: c.card,
          borderRadius: radius.lg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: c.border,
          padding: padded ? space.lg : 0,
        },
        shadow(elevation),
        style,
      ]}
    >
      {children}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.99 : 1 }] })}
    >
      {body}
    </Pressable>
  );
}

// ── Text helpers ───────────────────────────────────────────────────────
export function H1({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const { c } = useTheme();
  return <Text style={[{ fontSize: 28, fontWeight: "800", color: c.text, letterSpacing: -0.5 }, style]}>{children}</Text>;
}
export function H2({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const { c } = useTheme();
  return <Text style={[{ fontSize: 18, fontWeight: "700", color: c.text }, style]}>{children}</Text>;
}
export function Muted({ children, style, numberOfLines }: { children: React.ReactNode; style?: StyleProp<TextStyle>; numberOfLines?: number }) {
  const { c } = useTheme();
  return <Text numberOfLines={numberOfLines} style={[{ fontSize: 13, color: c.textMuted }, style]}>{children}</Text>;
}

// ── Icon bubble ────────────────────────────────────────────────────────
export function IconBubble({ icon, color, size = 40, bg }: { icon: string; color: string; size?: number; bg?: string }) {
  // Decorative: always paired with a text label, so hide from screen readers.
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{ width: size, height: size, borderRadius: size / 3, backgroundColor: bg ?? color + "22", alignItems: "center", justifyContent: "center" }}
    >
      <Ionicons name={icon as IoniconName} size={size * 0.5} color={color} />
    </View>
  );
}

// ── Avatar (emoji) with optional online ring ───────────────────────────
export function Avatar({ emoji, size = 56, online }: { emoji?: string | null; size?: number; online?: boolean }) {
  const { c } = useTheme();
  return (
    <View>
      <View style={{ width: size, height: size, borderRadius: size / 2.6, backgroundColor: c.tint, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontSize: size * 0.5 }}>{emoji || "🧒"}</Text>
      </View>
      {online !== undefined && (
        <View style={{ position: "absolute", right: -2, bottom: -2, borderRadius: 99, borderWidth: 2.5, borderColor: c.card }}>
          <PulseDot on={online} />
        </View>
      )}
    </View>
  );
}

// ── Pulsing presence dot ───────────────────────────────────────────────
export function PulseDot({ on, size = 12 }: { on: boolean; size?: number }) {
  const { c } = useTheme();
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!on) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1100, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [on, pulse]);
  const color = on ? c.success : c.textFaint;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      {on && (
        <Animated.View
          style={{
            position: "absolute", width: size, height: size, borderRadius: size / 2, backgroundColor: color,
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
            transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] }) }],
          }}
        />
      )}
      <View style={{ width: size * 0.66, height: size * 0.66, borderRadius: size, backgroundColor: color }} />
    </View>
  );
}

// ── Pill / badge ───────────────────────────────────────────────────────
export function Pill({ label, tone = "neutral", icon }: { label: string; tone?: "neutral" | "success" | "warn" | "danger" | "brand"; icon?: string }) {
  const { c } = useTheme();
  const map = {
    neutral: { bg: c.surfaceAlt, fg: c.textMuted },
    success: { bg: c.successSoft, fg: c.success },
    warn: { bg: c.warnSoft, fg: c.warn },
    danger: { bg: c.dangerSoft, fg: c.danger },
    brand: { bg: c.tint, fg: c.primaryDark },
  }[tone];
  return (
    <View accessible accessibilityLabel={label} style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: map.bg, paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.pill, alignSelf: "flex-start" }}>
      {icon && <Ionicons name={icon as IoniconName} size={12} color={map.fg} />}
      <Text maxFontSizeMultiplier={fontCap.chip} style={{ color: map.fg, fontSize: 12, fontWeight: "700" }}>{label}</Text>
    </View>
  );
}

// ── Stat tile ──────────────────────────────────────────────────────────
export function Stat({ icon, value, label, color }: { icon: string; value: string; label: string; color?: string }) {
  const { c } = useTheme();
  const tint = color ?? c.primary;
  return (
    <View accessible accessibilityLabel={`${label} : ${value}`} style={{ flex: 1, backgroundColor: c.surfaceAlt, borderRadius: radius.md, padding: space.md, gap: 6 }}>
      <Ionicons name={icon as IoniconName} size={18} color={tint} />
      <Text maxFontSizeMultiplier={fontCap.tile} style={{ fontSize: 18, fontWeight: "800", color: c.text }} numberOfLines={1}>{value}</Text>
      <Text maxFontSizeMultiplier={fontCap.tile} style={{ fontSize: 11, color: c.textMuted, fontWeight: "600" }} numberOfLines={1}>{label}</Text>
    </View>
  );
}

// ── Progress bar ───────────────────────────────────────────────────────
export function Bar({ value, color, track }: { value: number; color?: string; track?: string }) {
  const { c } = useTheme();
  const pct = Math.max(0, Math.min(1, value));
  return (
    <View style={{ height: 8, borderRadius: 99, backgroundColor: track ?? c.surfaceAlt, overflow: "hidden" }}>
      <View style={{ width: `${pct * 100}%`, height: "100%", borderRadius: 99, backgroundColor: color ?? c.primary }} />
    </View>
  );
}

// ── Button ─────────────────────────────────────────────────────────────
export function Btn({
  title, onPress, variant = "primary", icon, loading, disabled, full,
}: {
  title: string;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  icon?: string;
  loading?: boolean;
  disabled?: boolean;
  full?: boolean;
}) {
  const { c, gradient } = useTheme();
  const content = (col: string) => (
    <>
      {loading ? <ActivityIndicator color={col} /> : icon ? <Ionicons name={icon as IoniconName} size={18} color={col} /> : null}
      <Text style={{ color: col, fontWeight: "700", fontSize: 15 }}>{title}</Text>
    </>
  );
  const base: ViewStyle = { minHeight: 50, borderRadius: radius.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: space.lg, opacity: disabled ? 0.5 : 1, alignSelf: full ? "stretch" : "auto" };
  const a11y = {
    accessibilityRole: "button" as const,
    accessibilityLabel: title,
    accessibilityState: { disabled: !!(disabled || loading), busy: !!loading },
  };
  if (variant === "primary") {
    return (
      <Pressable onPress={onPress} disabled={disabled || loading} {...a11y} style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.98 : 1 }], alignSelf: full ? "stretch" : "auto" })}>
        <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={base}>{content("#fff")}</LinearGradient>
      </Pressable>
    );
  }
  const styles = {
    secondary: { bg: c.tint, fg: c.primaryDark },
    ghost: { bg: "transparent", fg: c.text },
    danger: { bg: c.dangerSoft, fg: c.danger },
  }[variant];
  return (
    <Pressable onPress={onPress} disabled={disabled || loading} {...a11y} style={({ pressed }) => [base, { backgroundColor: styles.bg, borderWidth: variant === "ghost" ? StyleSheet.hairlineWidth : 0, borderColor: c.border, transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
      {content(styles.fg)}
    </Pressable>
  );
}

// ── Section header ─────────────────────────────────────────────────────
export function SectionHeader({ title, actionLabel, onAction }: { title: string; actionLabel?: string; onAction?: () => void }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
      <H2>{title}</H2>
      {actionLabel && (
        <Pressable onPress={onAction} accessibilityRole="button" accessibilityLabel={actionLabel} hitSlop={8}>
          <Text style={{ color: c.primary, fontWeight: "700", fontSize: 13 }}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

// ── Empty state ────────────────────────────────────────────────────────
export function Empty({ icon, title, subtitle }: { icon: string; title: string; subtitle?: string }) {
  const { c } = useTheme();
  return (
    <View style={{ alignItems: "center", paddingVertical: space.xxl, gap: 8 }}>
      <IconBubble icon={icon} color={c.primary} size={56} />
      <Text style={{ fontSize: 16, fontWeight: "700", color: c.text, marginTop: 4 }}>{title}</Text>
      {subtitle && <Text style={{ fontSize: 13, color: c.textMuted, textAlign: "center", maxWidth: 260 }}>{subtitle}</Text>}
    </View>
  );
}

// ── Error state (failed load, with retry) ─────────────────────────────
export function ErrorState({
  onRetry,
  title = "Connexion impossible",
  subtitle = "Impossible de charger les données. Vérifiez votre connexion, puis réessayez.",
  icon = "cloud-offline",
}: {
  onRetry?: () => void;
  title?: string;
  subtitle?: string;
  icon?: string;
}) {
  const { c } = useTheme();
  return (
    <View accessibilityRole="alert" style={{ alignItems: "center", paddingVertical: space.xxl, gap: 10 }}>
      <IconBubble icon={icon} color={c.danger} size={56} />
      <Text style={{ fontSize: 16, fontWeight: "700", color: c.text, marginTop: 4 }}>{title}</Text>
      <Text style={{ fontSize: 13, color: c.textMuted, textAlign: "center", maxWidth: 260 }}>{subtitle}</Text>
      {onRetry && (
        <View style={{ marginTop: 6 }}>
          <Btn title="Réessayer" icon="refresh" variant="secondary" onPress={onRetry} />
        </View>
      )}
    </View>
  );
}

// ── Skeleton ───────────────────────────────────────────────────────────
export function Skeleton({ height = 16, width = "100%", style }: { height?: number; width?: number | `${number}%`; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  const o = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(o, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(o, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [o]);
  return <Animated.View style={[{ height, width, borderRadius: radius.sm, backgroundColor: c.surfaceAlt, opacity: o }, style]} />;
}
