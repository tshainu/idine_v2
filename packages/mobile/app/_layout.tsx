import { Stack, useRouter } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { ActivityIndicator, Alert, AppState, Platform, Vibration, View } from "react-native";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from "@expo-google-fonts/poppins";
import { Colors } from "../constants/theme";
import { hasPin } from "../lib/session";
import { useSession } from "../hooks/use-session";
import { useOrders } from "../queries/orders";

// Shared cache tuning for the whole waiter app.
// Before: every screen used raw defaults, so each mount refired its request and
// four screens polled the VPS in parallel (10s/10s/15s/15s) even in the background.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data stays fresh long enough that navigating back to a screen is instant.
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      // A waiter on restaurant wifi gets dropouts — retry twice, fast, then give up.
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
      // Serve cache immediately, revalidate behind it.
      refetchOnMount: "always",
      refetchOnReconnect: true,
      // Polling must not continue while the app is backgrounded.
      refetchIntervalInBackground: false,
      networkMode: "offlineFirst",
    },
    mutations: {
      retry: 1,
      networkMode: "offlineFirst",
    },
  },
});

// Re-lock after this long in the background, so a phone left on a table is safe
// but stepping out to the kitchen for a minute doesn't force a PIN re-entry.
const LOCK_AFTER_MS = 2 * 60_000;

function ReadyOrderWatcher() {
  const { branchId, waiterId } = useSession();
  const orders = useOrders(branchId, { poll: 5_000, waiterId });
  const seenReady = useRef<Set<number>>(new Set());

  useEffect(() => {
    const ready = (orders.data ?? []).filter((order) => order.status === "ready");
    const fresh = ready.filter((order) => !seenReady.current.has(order.id));
    if (!fresh.length) return;

    for (const order of fresh) seenReady.current.add(order.id);
    if (Platform.OS !== "web") Vibration.vibrate([0, 250, 120, 250]);
    const first = fresh[0];
    Alert.alert(
      fresh.length === 1 ? "Order cooked" : `${fresh.length} orders cooked`,
      fresh.length === 1
        ? `${first.orderNumber}${first.tableId ? ` · Table ${first.tableId}` : ""} is ready for pickup.`
        : `${fresh.map((order) => order.orderNumber).join(", ")} are ready for pickup.`,
    );
  }, [orders.data]);

  return null;
}

function useAutoLock() {
  const router = useRouter();
  const backgroundedAt = useRef<number | null>(null);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const sub = AppState.addEventListener("change", async (state) => {
      focusManager.setFocused(state === "active");

      if (state === "background" || state === "inactive") {
        if (backgroundedAt.current === null) backgroundedAt.current = Date.now();
        return;
      }

      if (state === "active") {
        const since = backgroundedAt.current;
        backgroundedAt.current = null;
        if (since === null || Date.now() - since < LOCK_AFTER_MS) return;
        if (await hasPin()) router.replace("/pin");
      }
    });
    return () => sub.remove();
  }, [router]);
}

export default function RootLayout() {
  useAutoLock();

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  if (!fontsLoaded) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: Colors.light.background,
        }}
      >
        <ActivityIndicator color={Colors.light.primary} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="light" backgroundColor={Colors.light.chrome} translucent={false} />
        <ReadyOrderWatcher />
        <Stack screenOptions={{ headerShown: false, animation: "slide_from_right" }} />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
