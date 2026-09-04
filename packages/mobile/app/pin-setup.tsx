import { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Fonts, Radius, Space } from "../constants/theme";
import { PinDots, PinPad, PIN_LENGTH } from "../components/pin-pad";
import { setPin } from "../lib/session";
import { useSession } from "../hooks/use-session";

const c = Colors.light;

export default function PinSetupScreen() {
  const router = useRouter();
  const { session } = useSession();

  const [first, setFirst] = useState<string | null>(null);
  const [entry, setEntry] = useState("");
  const [error, setError] = useState<string | null>(null);

  const stage: "create" | "confirm" = first === null ? "create" : "confirm";

  async function push(d: string) {
    if (entry.length >= PIN_LENGTH) return;
    const next = entry + d;
    setError(null);
    setEntry(next);
    if (next.length < PIN_LENGTH) return;

    if (stage === "create") {
      // Hold the first entry and ask for it again — a mistyped PIN would lock the waiter out.
      setFirst(next);
      setEntry("");
      return;
    }

    if (next !== first) {
      setError("Those PINs did not match. Start again.");
      setFirst(null);
      setEntry("");
      return;
    }

    await setPin(next);
    router.replace("/(tabs)");
  }

  async function skip() {
    router.replace("/(tabs)");
  }

  return (
    <SafeAreaView style={s.safe} edges={["top", "left", "right"]}>
      <View style={s.body}>
        <View style={s.iconWrap}>
          <Ionicons name="keypad-outline" size={26} color={c.primaryDark} />
        </View>

        <Text style={s.title}>
          {stage === "create" ? "Create a 4-digit PIN" : "Re-enter your PIN"}
        </Text>
        <Text style={s.sub}>
          {stage === "create"
            ? `Hi ${session?.name ?? "there"} — you'll use this PIN to unlock the app during your shift.`
            : "Type the same 4 digits once more to confirm."}
        </Text>

        <View style={s.dotsWrap}>
          <PinDots filled={entry.length} error={!!error} />
          {error ? <Text style={s.err}>{error}</Text> : null}
        </View>

        <PinPad onDigit={push} onBackspace={() => { setError(null); setEntry((v) => v.slice(0, -1)); }} />

        <TouchableOpacity onPress={skip} style={s.skip} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={s.skipText}>Skip for now</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.background },
  body: { flex: 1, padding: Space.xl, alignItems: "center", justifyContent: "center" },
  iconWrap: {
    width: 54, height: 54, borderRadius: Radius.lg, backgroundColor: c.primarySoft,
    alignItems: "center", justifyContent: "center", marginBottom: Space.lg,
  },
  title: { fontFamily: Fonts.bold, fontSize: 21, color: c.foreground, textAlign: "center" },
  sub: {
    fontFamily: Fonts.regular, fontSize: 13.5, color: c.muted,
    textAlign: "center", marginTop: 6, maxWidth: 300, lineHeight: 20,
  },
  dotsWrap: { marginVertical: Space.xxl, alignItems: "center", minHeight: 60 },
  err: {
    fontFamily: Fonts.medium, fontSize: 12.5, color: c.destructive,
    marginTop: Space.lg, textAlign: "center",
  },
  skip: { marginTop: Space.xxl },
  skipText: { fontFamily: Fonts.medium, fontSize: 13.5, color: c.muted },
});
