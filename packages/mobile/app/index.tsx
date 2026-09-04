import { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  StatusBar, TextInput, KeyboardAvoidingView, Platform, ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useMutation } from "@tanstack/react-query";
import Constants from "expo-constants";
import { loadUser, saveUser, WaiterUser } from "../lib/auth";
import { Ionicons } from "@expo/vector-icons";

// ── Design tokens ────────────────────────────────────────────────
const C = {
  navy:    "#0D1B6E",
  navy2:   "#162280",
  navy3:   "#0A1255",
  accent:  "#4F6EF7",
  white:   "#FFFFFF",
  light:   "#EEF0FB",
  muted:   "#8891B8",
  red:     "#EF4444",
  green:   "#22C55E",
  gold:    "#F5A623",
  card:    "#F7F8FE",
  border:  "#DDE1F5",
};

const baseUrl: string =
  Constants.expoConfig?.extra?.apiUrl ??
  process.env.EXPO_PUBLIC_API_URL ??
  "https://idinev2.69-169-97-195.sslip.io/";

export default function LoginScreen() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    loadUser().then((u) => {
      if (u) router.replace("/tables" as any);
      else setChecking(false);
    });
  }, []);

  const loginMutation = useMutation({
    mutationFn: async () => {
      const url = baseUrl.replace(/\/$/, "") + "/api/auth/login";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: userId.trim(), username: username.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data as any)?.error || "Login failed");
      return data as { user: WaiterUser };
    },
    onSuccess: async ({ user }) => {
      await saveUser({ ...user, branchId: user.branchId ?? 1 });
      router.replace("/tables" as any);
    },
    onError: (e: any) => {
      setError(e?.message || "Login failed. Check your details and try again.");
    },
  });

  const handleSubmit = () => {
    setError("");
    if (!userId.trim() || !username.trim() || !password) {
      setError("Please fill in all fields.");
      return;
    }
    loginMutation.mutate();
  };

  if (checking) {
    return (
      <View style={{ flex: 1, backgroundColor: C.navy, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color={C.accent} />
      </View>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.navy3} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, width: "100%" }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: "center", justifyContent: "center", paddingVertical: 32 }}
          keyboardShouldPersistTaps="handled">

          {/* ── Brand ── */}
          <View style={s.brandWrap}>
            <View style={s.logoCircle}>
              <Ionicons name="restaurant" size={28} color={C.white} />
            </View>
            <Text style={s.brandName}>iDINE</Text>
            <Text style={s.brandSub}>Waiter Portal</Text>
          </View>

          {/* ── Card ── */}
          <View style={s.card}>
            <Text style={s.cardTitle}>Sign In</Text>

            <View style={s.field}>
              <Text style={s.label}>Business User ID</Text>
              <TextInput style={s.input} value={userId} onChangeText={setUserId}
                placeholder="e.g. ELE5236" placeholderTextColor={C.muted} autoCapitalize="characters" autoCorrect={false} />
            </View>

            <View style={s.field}>
              <Text style={s.label}>Username</Text>
              <TextInput style={s.input} value={username} onChangeText={setUsername}
                placeholder="e.g. waiter1" placeholderTextColor={C.muted} autoCapitalize="none" autoCorrect={false} />
            </View>

            <View style={s.field}>
              <Text style={s.label}>Password</Text>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <TextInput style={[s.input, { flex: 1 }]} value={password} onChangeText={setPassword}
                  placeholder="Password" placeholderTextColor={C.muted} secureTextEntry={!showPw} autoCapitalize="none" />
                <TouchableOpacity onPress={() => setShowPw(v => !v)} style={{ paddingHorizontal: 10 }}>
                  <Ionicons name={showPw ? "eye-off-outline" : "eye-outline"} size={20} color={C.muted} />
                </TouchableOpacity>
              </View>
            </View>

            {error ? (
              <View style={s.errorRow}>
                <Ionicons name="alert-circle" size={14} color={C.red} />
                <Text style={s.errorTxt}>{error}</Text>
              </View>
            ) : null}

            <TouchableOpacity style={s.submitBtn} onPress={handleSubmit} disabled={loginMutation.isPending} activeOpacity={0.85}>
              {loginMutation.isPending ? (
                <ActivityIndicator color={C.white} size="small" />
              ) : (
                <Text style={s.submitTxt}>Sign In</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.navy },

  brandWrap: { alignItems: "center", marginBottom: 28 },
  logoCircle: {
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: C.accent, alignItems: "center", justifyContent: "center",
    marginBottom: 14,
    shadowColor: C.accent, shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  brandName: { color: C.white, fontSize: 22, fontWeight: "800", letterSpacing: 2 },
  brandSub: { color: C.muted, fontSize: 13, marginTop: 2, letterSpacing: 0.5 },

  card: {
    backgroundColor: C.white, borderRadius: 24, paddingHorizontal: 24, paddingVertical: 28,
    width: "88%",
    shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 20, shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  cardTitle: { color: C.navy, fontSize: 18, fontWeight: "700", marginBottom: 20, textAlign: "center" },

  field: { marginBottom: 14 },
  label: { color: C.muted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 },
  input: {
    backgroundColor: C.light, borderRadius: 10, borderWidth: 1, borderColor: C.border,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: C.navy,
  },

  errorRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2, marginBottom: 8 },
  errorTxt: { color: C.red, fontSize: 12, fontWeight: "600", flexShrink: 1 },

  submitBtn: {
    backgroundColor: C.accent, borderRadius: 12, paddingVertical: 14, alignItems: "center",
    marginTop: 6,
    shadowColor: C.accent, shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  submitTxt: { color: C.white, fontSize: 16, fontWeight: "700" },
});
