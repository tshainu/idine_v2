import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
import { useEffect } from "react";
import { AppState, Platform } from "react-native";

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

export default function RootLayout() {
  // Tell react-query when the app is actually in the foreground so
  // refetchIntervalInBackground: false can do its job on native.
  useEffect(() => {
    if (Platform.OS === "web") return;
    const sub = AppState.addEventListener("change", (state) => {
      focusManager.setFocused(state === "active");
    });
    return () => sub.remove();
  }, []);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <Stack screenOptions={{ headerShown: false, animation: "slide_from_right" }} />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
