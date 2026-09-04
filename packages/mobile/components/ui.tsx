// Shared UI kit for the waiter app: white cards, soft shadows, Manjal yellow accent.
import React from "react";
import {
  View, Text, TouchableOpacity, ActivityIndicator, StyleSheet,
  type ViewStyle, type TextStyle, type StyleProp,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Radius, Shadow, Space, Fonts } from "../constants/theme";

const c = Colors.light;

// ── Card ──────────────────────────────────────────────────────────────────────
export function Card({ children, style, padded = true }: {
  children: React.ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean;
}) {
  return <View style={[s.card, padded && { padding: Space.lg }, style]}>{children}</View>;
}

// ── Section heading ───────────────────────────────────────────────────────────
export function SectionTitle({ title, action, onAction }: {
  title: string; action?: string; onAction?: () => void;
}) {
  return (
    <View style={s.sectionRow}>
      <Text style={s.sectionTitle}>{title}</Text>
      {action ? (
        <TouchableOpacity onPress={onAction} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={s.sectionAction}>{action}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

// ── Stat tile (dashboard / reports) ───────────────────────────────────────────
export function StatCard({ label, value, sub, icon, tone = "default", style }: {
  label: string; value: string; sub?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  tone?: "default" | "primary" | "success" | "warning" | "info";
  style?: StyleProp<ViewStyle>;
}) {
  const tones = {
    default: { bg: c.card, fg: c.foreground, chip: c.background, chipFg: c.muted },
    primary: { bg: c.card, fg: c.foreground, chip: c.primarySoft, chipFg: c.primaryDark },
    success: { bg: c.card, fg: c.foreground, chip: c.successSoft, chipFg: c.success },
    warning: { bg: c.card, fg: c.foreground, chip: c.warningSoft, chipFg: c.warning },
    info: { bg: c.card, fg: c.foreground, chip: c.infoSoft, chipFg: c.info },
  }[tone];

  return (
    <View style={[s.card, s.stat, { backgroundColor: tones.bg }, style]}>
      {icon ? (
        <View style={[s.statIcon, { backgroundColor: tones.chip }]}>
          <Ionicons name={icon} size={18} color={tones.chipFg} />
        </View>
      ) : null}
      <Text style={s.statValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={s.statLabel} numberOfLines={2}>{label}</Text>
      {sub ? <Text style={s.statSub} numberOfLines={1}>{sub}</Text> : null}
    </View>
  );
}

// ── Pill / badge ──────────────────────────────────────────────────────────────
export function Pill({ label, fg, bg, border, style, textStyle }: {
  label: string; fg?: string; bg?: string; border?: string;
  style?: StyleProp<ViewStyle>; textStyle?: StyleProp<TextStyle>;
}) {
  return (
    <View style={[
      s.pill,
      { backgroundColor: bg ?? c.background, borderColor: border ?? "transparent", borderWidth: border ? 1 : 0 },
      style,
    ]}>
      <Text style={[s.pillText, { color: fg ?? c.muted }, textStyle]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

// ── Buttons ───────────────────────────────────────────────────────────────────
export function PrimaryButton({ label, onPress, loading, disabled, icon, style, variant = "primary" }: {
  label: string; onPress?: () => void; loading?: boolean; disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap; style?: StyleProp<ViewStyle>;
  variant?: "primary" | "dark" | "outline" | "danger" | "success";
}) {
  const v = {
    primary: { bg: c.primary, fg: c.onPrimary, border: c.primary },
    dark: { bg: c.foreground, fg: "#FFFFFF", border: c.foreground },
    outline: { bg: "transparent", fg: c.foreground, border: c.border },
    danger: { bg: c.destructive, fg: "#FFFFFF", border: c.destructive },
    success: { bg: c.success, fg: "#FFFFFF", border: c.success },
  }[variant];
  const off = disabled || loading;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={off}
      activeOpacity={0.85}
      style={[s.btn, { backgroundColor: v.bg, borderColor: v.border }, off && { opacity: 0.5 }, style]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={v.fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={18} color={v.fg} style={{ marginRight: 8 }} /> : null}
          <Text style={[s.btnText, { color: v.fg }]} numberOfLines={1}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

// ── Quantity stepper ──────────────────────────────────────────────────────────
export function QtyStepper({ qty, onChange, min = 0, compact }: {
  qty: number; onChange: (n: number) => void; min?: number; compact?: boolean;
}) {
  const size = compact ? 30 : 38;
  return (
    <View style={s.stepper}>
      <TouchableOpacity
        onPress={() => onChange(Math.max(min, qty - 1))}
        style={[s.stepBtn, { width: size, height: size }]}
        activeOpacity={0.7}
      >
        <Ionicons name="remove" size={compact ? 15 : 18} color={c.foreground} />
      </TouchableOpacity>
      <Text style={[s.stepQty, compact && { fontSize: 14, minWidth: 22 }]}>{qty}</Text>
      <TouchableOpacity
        onPress={() => onChange(qty + 1)}
        style={[s.stepBtn, s.stepBtnPrimary, { width: size, height: size }]}
        activeOpacity={0.7}
      >
        <Ionicons name="add" size={compact ? 15 : 18} color={c.onPrimary} />
      </TouchableOpacity>
    </View>
  );
}

// ── Empty / loading / error states ────────────────────────────────────────────
export function EmptyState({ icon = "file-tray-outline", title, hint, action, onAction }: {
  icon?: keyof typeof Ionicons.glyphMap; title: string; hint?: string;
  action?: string; onAction?: () => void;
}) {
  return (
    <View style={s.empty}>
      <View style={s.emptyIcon}>
        <Ionicons name={icon} size={30} color={c.mutedSoft} />
      </View>
      <Text style={s.emptyTitle}>{title}</Text>
      {hint ? <Text style={s.emptyHint}>{hint}</Text> : null}
      {action ? <PrimaryButton label={action} onPress={onAction} variant="outline" style={{ marginTop: Space.lg, paddingHorizontal: 22 }} /> : null}
    </View>
  );
}

export function Loading({ label }: { label?: string }) {
  return (
    <View style={s.empty}>
      <ActivityIndicator color={c.primary} size="large" />
      {label ? <Text style={[s.emptyHint, { marginTop: Space.md }]}>{label}</Text> : null}
    </View>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={s.errBanner}>
      <Ionicons name="cloud-offline-outline" size={18} color={c.destructive} />
      <Text style={s.errText} numberOfLines={2}>{message}</Text>
      {onRetry ? (
        <TouchableOpacity onPress={onRetry} style={s.errRetry}>
          <Text style={s.errRetryText}>Retry</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

// ── Screen header (non-tab screens) ───────────────────────────────────────────
export function ScreenHeader({ title, subtitle, onBack, right }: {
  title: string; subtitle?: string; onBack?: () => void; right?: React.ReactNode;
}) {
  return (
    <View style={s.header}>
      {onBack ? (
        <TouchableOpacity onPress={onBack} style={s.backBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color={c.foreground} />
        </TouchableOpacity>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={s.headerTitle} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={s.headerSub} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: c.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: c.border,
    ...Shadow.card,
  },
  sectionRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginBottom: Space.md, marginTop: Space.xl,
  },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: c.foreground, letterSpacing: -0.2 },
  sectionAction: { fontSize: 13, fontWeight: "600", color: c.primaryDark },

  stat: { padding: Space.lg, flex: 1, minHeight: 108, justifyContent: "space-between" },
  statIcon: {
    width: 34, height: 34, borderRadius: Radius.sm,
    alignItems: "center", justifyContent: "center", marginBottom: Space.sm,
  },
  statValue: { fontSize: 22, fontWeight: "800", color: c.foreground, letterSpacing: -0.6 },
  statLabel: { fontSize: 12, color: c.muted, marginTop: 2, fontWeight: "500" },
  statSub: { fontSize: 11, color: c.mutedSoft, marginTop: 2 },

  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.pill, alignSelf: "flex-start" },
  pillText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.1 },

  btn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    height: 50, borderRadius: Radius.md, borderWidth: 1, paddingHorizontal: 16,
  },
  btnText: { fontSize: 15, fontWeight: "700", letterSpacing: -0.1 },

  stepper: { flexDirection: "row", alignItems: "center" },
  stepBtn: {
    alignItems: "center", justifyContent: "center", borderRadius: Radius.sm,
    backgroundColor: c.background, borderWidth: 1, borderColor: c.border,
  },
  stepBtnPrimary: { backgroundColor: c.primary, borderColor: c.primary },
  stepQty: { minWidth: 30, textAlign: "center", fontSize: 16, fontWeight: "700", color: c.foreground },

  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 48, paddingHorizontal: Space.xl },
  emptyIcon: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: c.background,
    alignItems: "center", justifyContent: "center", marginBottom: Space.lg,
  },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: c.foreground, textAlign: "center" },
  emptyHint: { fontSize: 13, color: c.muted, textAlign: "center", marginTop: 6, lineHeight: 19 },

  errBanner: {
    flexDirection: "row", alignItems: "center", gap: Space.sm,
    backgroundColor: c.destructiveSoft, borderRadius: Radius.md,
    padding: Space.md, marginBottom: Space.md,
  },
  errText: { flex: 1, fontSize: 12, color: "#8C1C24", fontWeight: "500" },
  errRetry: { paddingHorizontal: 10, paddingVertical: 5, backgroundColor: "#FFFFFF", borderRadius: Radius.sm },
  errRetryText: { fontSize: 12, fontWeight: "700", color: c.destructive },

  header: {
    flexDirection: "row", alignItems: "center", gap: Space.sm,
    paddingHorizontal: Space.lg, paddingTop: Space.md, paddingBottom: Space.md,
    backgroundColor: c.card, borderBottomWidth: 1, borderBottomColor: c.border,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: Radius.sm, backgroundColor: c.background,
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { fontSize: 17, fontWeight: "700", color: c.foreground, letterSpacing: -0.3 },
  headerSub: { fontSize: 12, color: c.muted, marginTop: 1 },
});

export { Fonts };
