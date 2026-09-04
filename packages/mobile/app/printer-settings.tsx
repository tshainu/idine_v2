import { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView,
  StatusBar, Alert, ActivityIndicator, Switch, KeyboardAvoidingView, Platform,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  DEFAULT_CONFIG, loadPrinterConfig, savePrinterConfig, printTest,
  directPrintAvailable, type PrinterConfig, type Transport,
} from "../lib/printer";
import { kotPreviewText } from "../lib/escpos";

const C = {
  navy: "#0D1B6E",
  navy2: "#162280",
  navy3: "#0A1255",
  accent: "#4F6EF7",
  white: "#FFFFFF",
  light: "#EEF0FB",
  muted: "#8891B8",
  red: "#EF4444",
  green: "#22C55E",
  amber: "#F59E0B",
  gold: "#F5A623",
  card: "#F7F8FE",
  border: "#DDE1F5",
};

const TRANSPORTS: { key: Transport; label: string; icon: keyof typeof Ionicons.glyphMap; hint: string }[] = [
  { key: "lan", label: "Wi-Fi / LAN", icon: "wifi-outline", hint: "Network thermal printer on port 9100" },
  { key: "bluetooth", label: "Bluetooth", icon: "bluetooth-outline", hint: "Paired portable ESC/POS printer" },
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
  const insets = useSafeAreaInsets();
  const [cfg, setCfg] = useState<PrinterConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    loadPrinterConfig().then((c) => {
      setCfg(c);
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
      Alert.alert(result.ok ? "Test sent ✅" : "Test failed ⚠️", result.message);
    } catch (e) {
      Alert.alert("Test failed ⚠️", (e as Error)?.message ?? "Unknown error");
    } finally {
      setTesting(false);
    }
  }, [cfg]);

  const nativeReady = directPrintAvailable(cfg.transport);

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={["left", "right", "bottom"]}>
      <StatusBar barStyle="light-content" backgroundColor={C.navy3} />

      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.headerIconBtn}>
          <Ionicons name="arrow-back" size={19} color={C.white} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>KOT Printer</Text>
          <Text style={s.headerSub}>Print kitchen tickets from this phone</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }} keyboardShouldPersistTaps="handled">
          {/* Transport picker */}
          <View style={s.card}>
            <Text style={s.cardTitle}>How should this phone print?</Text>
            {TRANSPORTS.map((t) => {
              const active = cfg.transport === t.key;
              return (
                <TouchableOpacity
                  key={t.key}
                  style={[s.option, active && s.optionActive]}
                  onPress={() => patch({ transport: t.key })}
                >
                  <View style={[s.optionIcon, active && { backgroundColor: C.accent }]}>
                    <Ionicons name={t.icon} size={17} color={active ? C.white : C.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.optionLabel, active && { color: C.navy }]}>{t.label}</Text>
                    <Text style={s.optionHint}>{t.hint}</Text>
                  </View>
                  {active && <Ionicons name="checkmark-circle" size={20} color={C.green} />}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Availability warning */}
          {!nativeReady && (
            <View style={s.warn}>
              <Ionicons name="alert-circle-outline" size={18} color={C.amber} />
              <Text style={s.warnTxt}>
                {cfg.transport === "lan" ? "Wi-Fi" : "Bluetooth"} printing needs the installed APK build.
                In the browser preview or Expo Go, tickets fall back to the kitchen queue automatically.
              </Text>
            </View>
          )}

          {/* LAN fields */}
          {cfg.transport === "lan" && (
            <View style={s.card}>
              <Text style={s.cardTitle}>Printer address</Text>
              <Text style={s.label}>IP address</Text>
              <TextInput
                style={s.input}
                value={cfg.host}
                onChangeText={(v) => patch({ host: v.trim() })}
                placeholder="192.168.1.50"
                placeholderTextColor={C.muted}
                keyboardType="numbers-and-punctuation"
                autoCapitalize="none"
              />
              <Text style={s.label}>Port</Text>
              <TextInput
                style={s.input}
                value={String(cfg.port)}
                onChangeText={(v) => patch({ port: Number(v.replace(/\D/g, "")) || 9100 })}
                placeholder="9100"
                placeholderTextColor={C.muted}
                keyboardType="number-pad"
              />
              <Text style={s.help}>Almost every network thermal printer listens on 9100.</Text>
            </View>
          )}

          {/* Bluetooth fields */}
          {cfg.transport === "bluetooth" && (
            <View style={s.card}>
              <Text style={s.cardTitle}>Paired printer</Text>
              <Text style={s.label}>Printer name</Text>
              <TextInput
                style={s.input}
                value={cfg.btName}
                onChangeText={(v) => patch({ btName: v })}
                placeholder="RPP02N"
                placeholderTextColor={C.muted}
              />
              <Text style={s.label}>Bluetooth MAC address</Text>
              <TextInput
                style={s.input}
                value={cfg.btAddress}
                onChangeText={(v) => patch({ btAddress: v.trim().toUpperCase() })}
                placeholder="00:11:22:33:44:55"
                placeholderTextColor={C.muted}
                autoCapitalize="characters"
              />
              <Text style={s.help}>
                Pair the printer in Android Bluetooth settings first, then copy its MAC address here.
              </Text>
            </View>
          )}

          {/* Paper width */}
          <View style={s.card}>
            <Text style={s.cardTitle}>Paper width</Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              {([32, 48] as const).map((w) => {
                const active = cfg.paperWidth === w;
                return (
                  <TouchableOpacity
                    key={w}
                    style={[s.chip, active && s.chipActive]}
                    onPress={() => patch({ paperWidth: w })}
                  >
                    <Text style={[s.chipTxt, active && { color: C.white }]}>
                      {w === 32 ? "58 mm" : "80 mm"}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Also queue on server */}
          <View style={[s.card, { flexDirection: "row", alignItems: "center", gap: 12 }]}>
            <View style={{ flex: 1 }}>
              <Text style={s.cardTitle}>Also send to kitchen queue</Text>
              <Text style={s.help}>
                Keeps the kitchen station printing its own copy even when this phone prints one.
              </Text>
            </View>
            <Switch
              value={cfg.alsoQueueOnServer}
              onValueChange={(v) => patch({ alsoQueueOnServer: v })}
              trackColor={{ true: C.accent, false: C.border }}
              thumbColor={C.white}
            />
          </View>

          {/* Preview */}
          <View style={s.card}>
            <Text style={s.cardTitle}>Ticket preview</Text>
            <View style={s.preview}>
              <Text style={s.previewTxt}>{SAMPLE}</Text>
            </View>
          </View>

          {/* Test */}
          <TouchableOpacity style={[s.testBtn, testing && { opacity: 0.6 }]} onPress={runTest} disabled={testing}>
            {testing ? (
              <ActivityIndicator size="small" color={C.white} />
            ) : (
              <>
                <Ionicons name="print-outline" size={17} color={C.white} />
                <Text style={s.testBtnTxt}>Print test ticket</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.light },
  header: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: C.navy, paddingHorizontal: 14, paddingBottom: 14,
  },
  headerIconBtn: {
    width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  headerTitle: { color: C.white, fontSize: 17, fontWeight: "700" },
  headerSub: { color: "rgba(255,255,255,0.7)", fontSize: 11, marginTop: 1 },

  card: { backgroundColor: C.white, borderRadius: 14, padding: 14, gap: 8, borderWidth: 1, borderColor: C.border },
  cardTitle: { fontSize: 14, fontWeight: "700", color: C.navy },

  option: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 11, borderRadius: 11, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.card,
  },
  optionActive: { borderColor: C.accent, backgroundColor: "#EEF2FF" },
  optionIcon: {
    width: 34, height: 34, borderRadius: 9, alignItems: "center", justifyContent: "center",
    backgroundColor: "#E5EAFF",
  },
  optionLabel: { fontSize: 13.5, fontWeight: "700", color: C.navy2 },
  optionHint: { fontSize: 11, color: C.muted, marginTop: 1 },

  label: { fontSize: 11.5, fontWeight: "600", color: C.muted, marginTop: 4 },
  input: {
    borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12,
    paddingVertical: 10, fontSize: 14, color: C.navy, backgroundColor: C.card,
  },
  help: { fontSize: 11, color: C.muted, lineHeight: 15 },

  chip: {
    paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999,
    borderWidth: 1.5, borderColor: C.border, backgroundColor: C.card,
  },
  chipActive: { backgroundColor: C.accent, borderColor: C.accent },
  chipTxt: { fontSize: 13, fontWeight: "700", color: C.navy2 },

  warn: {
    flexDirection: "row", gap: 10, alignItems: "flex-start",
    backgroundColor: "#FEF3C7", borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: "#FCD34D",
  },
  warnTxt: { flex: 1, fontSize: 11.5, color: "#92400E", lineHeight: 16 },

  preview: { backgroundColor: "#111827", borderRadius: 10, padding: 12 },
  previewTxt: {
    color: "#E5E7EB", fontSize: 11, lineHeight: 15,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },

  testBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: C.navy, borderRadius: 12, paddingVertical: 14,
  },
  testBtnTxt: { color: C.white, fontSize: 14.5, fontWeight: "700" },
});
