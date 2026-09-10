import { Stack, useRouter } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { ActivityIndicator, AppState, Platform, View } from "react-native";
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
import { ReadyAlertProvider } from "../components/ready-alert";
import * as Notifications from "expo-notifications";
import { registerWaiterPush } from "../lib/push";
import { useSession } from "../hooks/use-session";

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

function PushRegistration() {
  const router = useRouter();
  const { session } = useSession();

  useEffect(() => {
    if (!session) return;
    registerWaiterPush(session).catch((error) => {
      // Push is an enhancement; polling and the foreground alert still work if
      // permission is denied or the device is offline during registration.
      console.warn("[push] registration failed:", error?.message ?? error);
    });
  }, [session]);

  useEffect(() => {
    const openReadyQueue = (response: Notifications.NotificationResponse) => {
      const data = response.notification.request.content.data as { screen?: string };
      if (data?.screen === "ready-items") router.push("/ready-items");
    };
    const sub = Notifications.addNotificationResponseReceivedListener(openReadyQueue);
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) openReadyQueue(response);
    }).catch(() => undefined);
    return () => sub.remove();
  }, [router]);
  return null;
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
        <PushRegistration />
        <StatusBar style="light" backgroundColor={Colors.light.chrome} translucent={false} />
        <ReadyAlertProvider>
          <Stack screenOptions={{ headerShown: false, animation: "slide_from_right" }} />
        </ReadyAlertProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
