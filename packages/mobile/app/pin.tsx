import { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Fonts, Radius, Space } from "../constants/theme";
import { PinDots, PinPad, PIN_LENGTH } from "../components/pin-pad";
import { hasPin, verifyPin } from "../lib/session";
import { useSession, useSessionActions } from "../hooks/use-session";
import { initials } from "../lib/format";

const c = Colors.light;

export default function PinUnlockScreen() {
  const router = useRouter();
  const { session, isLoading } = useSession();
  const { signOut } = useSessionActions();

  const [entry, setEntry] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);

  // No session, or no PIN set: this screen has nothing to unlock.
  useEffect(() => {
    if (isLoading) return;
    if (!session) {
      router.replace("/");
      return;
    }
    (async () => {
      if (!(await hasPin())) router.replace("/pin-setup");
    })();
  }, [isLoading, session, router]);

  async function push(d: string) {
    if (entry.length >= PIN_LENGTH) return;
    const next = entry + d;
    setError(null);
    setEntry(next);
    if (next.length < PIN_LENGTH) return;

    if (await verifyPin(next)) {
      setEntry("");
      setAttempts(0);
      router.replace("/(tabs)");
      return;
    }

    const n = attempts + 1;
    setAttempts(n);
    setEntry("");
    setError(n >= 3 ? "Still wrong. Sign in with your password instead." : "Wrong PIN. Try again.");
  }

  async function usePassword() {
    await signOut();
    router.replace("/");
  }

  return (
    <SafeAreaView style={s.safe} edges={["top", "left", "right"]}>
      <View style={s.body}>
        <View style={s.avatar}>
          <Text style={s.avatarText}>{initials(session?.name)}</Text>
        </View>
        <Text style={s.name}>{session?.name ?? "Waiter"}</Text>
        <Text style={s.sub}>Enter your PIN to continue</Text>

        <View style={s.dotsWrap}>
          <PinDots filled={entry.length} error={!!error} />
          {error ? <Text style={s.err}>{error}</Text> : null}
        </View>

        <PinPad onDigit={push} onBackspace={() => { setError(null); setEntry((v) => v.slice(0, -1)); }} />

        <TouchableOpacity onPress={usePassword} style={s.alt} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="key-outline" size={15} color={c.muted} />
          <Text style={s.altText}>Use password instead</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.background },
  body: { flex: 1, padding: Space.xl, alignItems: "center", justifyContent: "center" },
  avatar: {
    width: 60, height: 60, borderRadius: Radius.pill, backgroundColor: c.primary,
    alignItems: "center", justifyContent: "center",
  },
  avatarText: { fontFamily: Fonts.bold, fontSize: 21, color: c.onPrimary },
  name: { fontFamily: Fonts.bold, fontSize: 20, color: c.foreground, marginTop: Space.lg },
  sub: { fontFamily: Fonts.regular, fontSize: 13.5, color: c.muted, marginTop: 4 },
  dotsWrap: { marginVertical: Space.xxl, alignItems: "center", minHeight: 60 },
  err: {
    fontFamily: Fonts.medium, fontSize: 12.5, color: c.destructive,
    marginTop: Space.lg, textAlign: "center",
  },
  alt: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: Space.xxl },
  altText: { fontFamily: Fonts.medium, fontSize: 13.5, color: c.muted },
});
