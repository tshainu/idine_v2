import { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView,
  Alert, ActivityIndicator, Switch, KeyboardAvoidingView, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  DEFAULT_CONFIG, loadPrinterConfig, savePrinterConfig, printTest,
  directPrintAvailable, type PrinterConfig, type Transport,
} from "../lib/printer";
import { kotPreviewText } from "../lib/escpos";
import { Colors, Fonts, Radius, Shadow, Space } from "../constants/theme";
import { Card, Loading, PrimaryButton, ScreenHeader } from "../components/ui";

const c = Colors.light;

// Bluetooth is deliberately NOT offered: the APK is built without
// react-native-bluetooth-escpos-printer, so selecting it would silently fall back to the
// kitchen queue and look broken. printer.ts still carries the transport, so re-adding the
// package and an entry here is all that a future Bluetooth build needs.
const TRANSPORTS: { key: Transport; label: string; icon: keyof typeof Ionicons.glyphMap; hint: string }[] = [
  { key: "lan", label: "Wi-Fi / LAN", icon: "wifi-outline", hint: "Network thermal printer on port 9100" },
  { key: "server", label: "Kitchen queue", icon: "cloud-upload-outline", hint: "Send to the POS print queue" },
];

const SAMPLE = kotPreviewText({
  orderNumber: "TEST-0001",
  tableName: "T1",
  waiterName: "Printer test",
  customerName: "iDine v2",
  items: [
    { name: "Chicken Fried Rice", qty: 2, notes: "less spicy" },
    { name: "Lime Juice", qty: 1 },
  ],
});

export default function PrinterSettingsScreen() {
  const router = useRouter();
  const [cfg, setCfg] = useState<PrinterConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    loadPrinterConfig().then((saved) => {
      setCfg(saved);
      setLoading(false);
    });
  }, []);

  const patch = useCallback((next: Partial<PrinterConfig>) => {
    setCfg((prev) => {
      const merged = { ...prev, ...next };
      // Persist immediately — a waiter should never lose printer setup to a back-swipe.
      void savePrinterConfig(merged);
      return merged;
    });
  }, []);

  const runTest = useCallback(async () => {
    setTesting(true);
    try {
      const result = await printTest(cfg);
      Alert.alert(result.ok ? "Test sent" : "Test failed", result.message);
    } catch (e) {
      Alert.alert("Test failed", (e as Error)?.message ?? "Unknown error");
    } finally {
      setTesting(false);
    }
  }, [cfg]);

  const nativeReady = directPrintAvailable(cfg.transport);

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <ScreenHeader title="KOT Printer" onBack={() => router.back()} />
        <Loading label="Loading printer setup…" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={["top", "left", "right"]}>
      <ScreenHeader
        title="KOT Printer"
        subtitle="Print kitchen tickets from this phone"
        onBack={() => router.back()}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Transport picker */}
          <Card style={s.gap}>
            <Text style={s.cardTitle}>How should this phone print?</Text>
            {TRANSPORTS.map((t) => {
              const active = cfg.transport === t.key;
              return (
                <TouchableOpacity
                  key={t.key}
                  style={[s.option, active && s.optionActive]}
                  onPress={() => patch({ transport: t.key })}
                  activeOpacity={0.8}
                >
                  <View style={[s.optionIcon, active && { backgroundColor: c.primary }]}>
                    <Ionicons name={t.icon} size={18} color={active ? c.onPrimary : c.muted} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.optionLabel}>{t.label}</Text>
                    <Text style={s.optionHint}>{t.hint}</Text>
                  </View>
                  {active ? (
                    <Ionicons name="checkmark-circle" size={22} color={c.success} />
                  ) : (
                    <View style={s.radioOff} />
                  )}
                </TouchableOpacity>
              );
            })}
          </Card>

          {/* Availability warning */}
          {!nativeReady && (
            <View style={s.warn}>
              <Ionicons name="alert-circle-outline" size={18} color={c.warning} />
              <Text style={s.warnTxt}>
                Wi-Fi printing needs the installed APK build. In the browser preview it is
                unavailable, so tickets fall back to the kitchen queue automatically.
              </Text>
            </View>
          )}

          {/* LAN fields */}
          {cfg.transport === "lan" && (
            <Card style={s.gap}>
              <Text style={s.cardTitle}>Printer address</Text>
              <Text style={s.label}>IP address</Text>
              <TextInput
                style={s.input}
                value={cfg.host}
                onChangeText={(v) => patch({ host: v.trim() })}
                placeholder="192.168.1.50"
                placeholderTextColor={c.mutedSoft}
                keyboardType="numbers-and-punctuation"
                autoCapitalize="none"
              />
              <Text style={s.label}>Port</Text>
              <TextInput
                style={s.input}
                value={String(cfg.port)}
                onChangeText={(v) => patch({ port: Number(v.replace(/\D/g, "")) || 9100 })}
                placeholder="9100"
                placeholderTextColor={c.mutedSoft}
                keyboardType="number-pad"
              />
              <Text style={s.help}>Almost every network thermal printer listens on 9100.</Text>
            </Card>
          )}

          {/* Paper width */}
          <Card style={s.gap}>
            <Text style={s.cardTitle}>Paper width</Text>
            <View style={{ flexDirection: "row", gap: Space.sm }}>
              {([32, 48] as const).map((w) => {
                const active = cfg.paperWidth === w;
                return (
                  <TouchableOpacity
                    key={w}
                    style={[s.chip, active && s.chipActive]}
                    onPress={() => patch({ paperWidth: w })}
                    activeOpacity={0.8}
                  >
                    <Text style={[s.chipTxt, active && { color: c.onPrimary }]}>
                      {w === 32 ? "58 mm" : "80 mm"}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Card>

          {/* Also queue on server */}
          <Card style={s.rowCard}>
            <View style={{ flex: 1, gap: Space.xs }}>
              <Text style={s.cardTitle}>Also send to kitchen queue</Text>
              <Text style={s.help}>
                Keeps the kitchen station printing its own copy even when this phone prints one.
              </Text>
            </View>
            <Switch
              value={cfg.alsoQueueOnServer}
              onValueChange={(v) => patch({ alsoQueueOnServer: v })}
              trackColor={{ true: c.primary, false: c.border }}
              thumbColor={c.card}
            />
          </Card>

          {/* Preview */}
          <Card style={s.gap}>
            <Text style={s.cardTitle}>Ticket preview</Text>
            <View style={s.preview}>
              <Text style={s.previewTxt}>{SAMPLE}</Text>
            </View>
          </Card>

          <PrimaryButton
            label="Print test ticket"
            icon="print-outline"
            onPress={runTest}
            loading={testing}
            variant="dark"
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.background },
  scroll: { padding: Space.lg, paddingBottom: Space.xxl + Space.xl, gap: Space.md },

  gap: { gap: Space.sm },
  rowCard: { flexDirection: "row", alignItems: "center", gap: Space.md },
  cardTitle: { fontFamily: Fonts.semibold, fontSize: 14.5, color: c.foreground },

  option: {
    flexDirection: "row", alignItems: "center", gap: Space.md,
    padding: Space.md, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: c.border, backgroundColor: c.cardAlt,
    minHeight: 60,
  },
  optionActive: { borderColor: c.primary, backgroundColor: c.primarySoft },
  optionIcon: {
    width: 38, height: 38, borderRadius: Radius.sm,
    alignItems: "center", justifyContent: "center", backgroundColor: c.background,
  },
  optionLabel: { fontFamily: Fonts.semibold, fontSize: 14, color: c.foreground },
  optionHint: { fontFamily: Fonts.regular, fontSize: 11.5, color: c.muted, marginTop: 1 },
  radioOff: {
    width: 20, height: 20, borderRadius: Radius.pill,
    borderWidth: 1.5, borderColor: c.border,
  },

  label: { fontFamily: Fonts.medium, fontSize: 12, color: c.muted, marginTop: Space.xs },
  input: {
    borderWidth: 1, borderColor: c.border, borderRadius: Radius.md,
    paddingHorizontal: Space.md, height: 48,
    fontFamily: Fonts.regular, fontSize: 15, color: c.foreground,
    backgroundColor: c.background,
  },
  help: { fontFamily: Fonts.regular, fontSize: 11.5, color: c.muted, lineHeight: 17 },

  chip: {
    paddingHorizontal: Space.xl, paddingVertical: Space.md, borderRadius: Radius.pill,
    borderWidth: 1.5, borderColor: c.border, backgroundColor: c.cardAlt,
  },
  chipActive: { backgroundColor: c.primary, borderColor: c.primary },
  chipTxt: { fontFamily: Fonts.semibold, fontSize: 13.5, color: c.muted },

  warn: {
    flexDirection: "row", gap: Space.sm, alignItems: "flex-start",
    backgroundColor: c.warningSoft, borderRadius: Radius.md, padding: Space.md,
    borderWidth: 1, borderColor: "#F5D9A8",
  },
  warnTxt: { flex: 1, fontFamily: Fonts.regular, fontSize: 12, color: "#8A5206", lineHeight: 17 },

  preview: {
    backgroundColor: "#15161A", borderRadius: Radius.md, padding: Space.md,
    ...Shadow.card,
  },
  previewTxt: {
    color: "#E9EAEE", fontSize: 11, lineHeight: 15,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
});
