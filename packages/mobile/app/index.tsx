import { useEffect, useState } from "react";
import {
  View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, ActivityIndicator, TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Colors, Fonts, Radius, Shadow, Space } from "../constants/theme";
import { PrimaryButton, ErrorBanner } from "../components/ui";
import { http, ApiError } from "../lib/http";
import { hasPin } from "../lib/session";
import { useSession, useSessionActions } from "../hooks/use-session";
import type { WaiterSession } from "../lib/session";

const c = Colors.light;

type LoginUser = {
  id: number;
  name: string;
  role: string;
  branchId: number | null;
  username: string | null;
};

export default function LoginScreen() {
  const router = useRouter();
  const { session, isLoading } = useSession();
  const { signIn } = useSessionActions();

  const [userId, setUserId] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);

  // Already signed in on this device: go straight to the PIN lock, or to the app
  // when no PIN has been set yet.
  useEffect(() => {
    if (isLoading || !session) return;
    (async () => {
      router.replace((await hasPin()) ? "/pin" : "/pin-setup");
    })();
  }, [isLoading, session, router]);

  async function submit() {
    if (!userId.trim() || !username.trim() || !password) {
      setError("Enter your User ID, username and password.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await http.post<{ user: LoginUser }>("/auth/login", {
        userId: userId.trim().toUpperCase(),
        username: username.trim(),
        password,
      });
      const u = res.user;
      const next: WaiterSession = {
        id: u.id,
        name: u.name,
        role: u.role ?? "waiter",
        branchId: u.branchId ?? 1,
        userId: userId.trim().toUpperCase(),
        username: u.username ?? username.trim(),
      };
      await signIn(next);
      router.replace("/pin-setup");
    } catch (e) {
      const msg =
        e instanceof ApiError && e.status === 401
          ? "Wrong User ID, username or password."
          : (e as Error)?.message ?? "Could not sign in.";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  if (isLoading || session) {
    return (
      <SafeAreaView style={st.loadingWrap} edges={["top", "left", "right"]}>
        <ActivityIndicator color={c.primary} size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={st.safe} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          contentContainerStyle={st.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={st.logoWrap}>
            <View style={st.logo}>
              <Image source={require("../assets/login-icon.png")} style={st.logoImage} contentFit="contain" />
            </View>
            <Text style={st.brand}>iDine Waiter</Text>
            <Text style={st.tagline}>Sign in once — then unlock with a PIN.</Text>
          </View>

          <View style={st.card}>
            {error ? <ErrorBanner message={error} /> : null}

            <Text style={st.label}>Shop ID</Text>
            <View style={st.inputWrap}>
              <Ionicons name="business-outline" size={18} color={c.mutedSoft} />
              <TextInput
                value={userId}
                onChangeText={setUserId}
                placeholder="Enter shop ID"
                placeholderTextColor={c.mutedSoft}
                autoCapitalize="characters"
                autoCorrect={false}
                style={st.input}
                returnKeyType="next"
              />
            </View>

            <Text style={st.label}>Username</Text>
            <View style={st.inputWrap}>
              <Ionicons name="person-outline" size={18} color={c.mutedSoft} />
              <TextInput
                value={username}
                onChangeText={setUsername}
                placeholder="Your username"
                placeholderTextColor={c.mutedSoft}
                autoCapitalize="none"
                autoCorrect={false}
                style={st.input}
                returnKeyType="next"
              />
            </View>

            <Text style={st.label}>Password</Text>
            <View style={st.inputWrap}>
              <Ionicons name="lock-closed-outline" size={18} color={c.mutedSoft} />
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                placeholderTextColor={c.mutedSoft}
                secureTextEntry={!showPw}
                autoCapitalize="none"
                autoCorrect={false}
                style={[st.input, st.inputPw]}
                returnKeyType="go"
                onSubmitEditing={submit}
              />
              <TouchableOpacity
                onPress={() => setShowPw((v) => !v)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={st.eyeBtn}
              >
                <Ionicons
                  name={showPw ? "eye-off-outline" : "eye-outline"}
                  size={19}
                  color={c.mutedSoft}
                />
              </TouchableOpacity>
            </View>

            <PrimaryButton
              label="Sign in"
              onPress={submit}
              loading={busy}
              icon="arrow-forward"
              style={{ marginTop: Space.xl }}
            />
          </View>

          <Text style={st.foot}>Ask your manager for your login details.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.background },
  loadingWrap: { flex: 1, backgroundColor: c.background, alignItems: "center", justifyContent: "center" },
  scroll: { padding: Space.xl, paddingTop: Space.xxl, flexGrow: 1, justifyContent: "center" },
  logoWrap: { alignItems: "center", marginBottom: Space.xxl },
  logo: {
    width: 84, height: 84, borderRadius: Radius.xl, backgroundColor: "#FFFFFF",
    alignItems: "center", justifyContent: "center", overflow: "hidden", ...Shadow.raised,
  },
  logoImage: { width: 78, height: 78 },
  brand: { fontFamily: Fonts.bold, fontSize: 24, color: c.foreground, marginTop: Space.lg },
  tagline: { fontFamily: Fonts.regular, fontSize: 13.5, color: c.muted, marginTop: 4, textAlign: "center" },
  card: {
    backgroundColor: c.card, borderRadius: Radius.xl, padding: Space.xl,
    borderWidth: 1, borderColor: c.border, ...Shadow.card,
  },
  label: {
    fontFamily: Fonts.medium, fontSize: 12.5, color: c.muted,
    marginBottom: 6, marginTop: Space.lg,
  },
  inputWrap: {
    position: "relative", overflow: "hidden",
    flexDirection: "row", alignItems: "center", gap: Space.md,
    backgroundColor: c.background, borderRadius: Radius.md,
    borderWidth: 1, borderColor: c.border, paddingHorizontal: Space.lg,
    height: 52,
  },
  input: {
    flex: 1, minWidth: 0, fontFamily: Fonts.regular, fontSize: 15.5,
    color: c.foreground, height: "100%",
  },
  inputPw: { paddingRight: 30 },
  eyeBtn: {
    position: "absolute", right: Space.lg, top: 0, bottom: 0,
    width: 24, alignItems: "center", justifyContent: "center",
  },
  foot: {
    fontFamily: Fonts.regular, fontSize: 12.5, color: c.mutedSoft,
    textAlign: "center", marginTop: Space.xl,
  },
});
