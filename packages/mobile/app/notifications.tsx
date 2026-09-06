import { useEffect, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Fonts, Radius, Space } from "../constants/theme";
import { Card, ScreenHeader, Loading, EmptyState, ErrorBanner } from "../components/ui";
import { useSession } from "../hooks/use-session";
import { useReadyAlert } from "../components/ready-alert";
import { useOrders } from "../queries/orders";
import { useTables } from "../queries/tables";
import { usePendingPrintJobs } from "../queries/print";
import { elapsed, lkr } from "../lib/format";

const c = Colors.light;

type Alert = {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: "success" | "warning" | "danger" | "info";
  title: string;
  body: string;
  when: number;
  href?: string;
};

const TONES = {
  success: { fg: c.success, bg: c.successSoft },
  warning: { fg: c.warning, bg: c.warningSoft },
  danger: { fg: c.destructive, bg: c.destructiveSoft },
  info: { fg: c.info, bg: c.infoSoft },
};

// Waiting longer than this without being served is worth flagging.
const SLOW_MS = 20 * 60_000;

export default function NotificationsScreen() {
  const router = useRouter();
  const { branchId, waiterId } = useSession();
  const orders = useOrders(branchId, { poll: 20_000, waiterId });
  const tables = useTables(branchId);
  const jobs = usePendingPrintJobs(branchId);
  // Reading the notification list silences the cooked-order ring.
  const { acknowledge } = useReadyAlert();
  useEffect(() => { acknowledge(); }, [acknowledge]);

  const alerts = useMemo<Alert[]>(() => {
    const out: Alert[] = [];
    const tableName = (id: number | null) =>
      (tables.data ?? []).find((t) => t.id === id)?.name ?? "Takeaway";

    for (const o of orders.data ?? []) {
      const at = o.createdAt ? new Date(o.createdAt).getTime() : 0;

      if (o.status === "ready") {
        out.push({
          id: `ready-${o.id}`,
          icon: "restaurant",
          tone: "success",
          title: `${tableName(o.tableId)} — food ready`,
          body: `${o.orderNumber} · ${o.items?.length ?? 0} items · ${lkr(o.total)}`,
          when: at,
          href: "/ready-items",
        });
      }

      if (["pending", "confirmed"].includes(o.status) && at && Date.now() - at > SLOW_MS) {
        out.push({
          id: `slow-${o.id}`,
          icon: "hourglass-outline",
          tone: "warning",
          title: `${tableName(o.tableId)} waiting ${elapsed(at)}`,
          body: `${o.orderNumber} is still ${o.status}. Check with the kitchen.`,
          when: at,
        });
      }

      if (o.status === "billed" || o.status === "paid") {
        out.push({
          id: `paid-${o.id}`,
          icon: "card-outline",
          tone: "info",
          title: `${tableName(o.tableId)} settled`,
          body: `${o.orderNumber} · ${lkr(o.total)}${(o.tipAmount ?? 0) > 0 ? ` · tip ${lkr(o.tipAmount)}` : ""}`,
          when: at,
        });
      }
    }

    if ((jobs.data?.length ?? 0) > 0) {
      out.push({
        id: "print-queue",
        icon: "print-outline",
        tone: "danger",
        title: `${jobs.data!.length} print job${jobs.data!.length === 1 ? "" : "s"} stuck`,
        body: "Tickets are queued but not printed. Check the printer or the Windows helper.",
        when: Date.now(),
        href: "/printer-settings",
      });
    }

    return out.sort((a, b) => b.when - a.when);
  }, [orders.data, tables.data, jobs.data]);

  if (orders.isLoading) {
    return (
      <SafeAreaView style={s.safe} edges={["top", "left", "right"]}>
        <ScreenHeader title="Notifications" onBack={() => router.back()} />
        <Loading />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={["top", "left", "right"]}>
      <ScreenHeader
        title="Notifications"
        subtitle={alerts.length ? `${alerts.length} update${alerts.length === 1 ? "" : "s"}` : "Nothing new"}
        onBack={() => router.back()}
      />

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={orders.isFetching}
            onRefresh={() => { orders.refetch(); jobs.refetch(); }}
            tintColor={c.primary}
          />
        }
      >
        {orders.error ? (
          <ErrorBanner message={(orders.error as Error).message} onRetry={() => orders.refetch()} />
        ) : null}

        {alerts.length === 0 ? (
          <EmptyState
            icon="notifications-off-outline"
            title="No notifications"
            hint="Kitchen updates, slow tables and printer problems appear here."
          />
        ) : (
          alerts.map((a) => {
            const tone = TONES[a.tone];
            const body = (
              <Card key={a.id} style={{ marginBottom: Space.md }}>
                <View style={s.row}>
                  <View style={[s.icon, { backgroundColor: tone.bg }]}>
                    <Ionicons name={a.icon} size={18} color={tone.fg} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.title}>{a.title}</Text>
                    <Text style={s.body}>{a.body}</Text>
                  </View>
                  {a.href ? <Ionicons name="chevron-forward" size={17} color={c.mutedSoft} /> : null}
                </View>
              </Card>
            );
            return a.href ? (
              <TouchableOpacity key={a.id} activeOpacity={0.85} onPress={() => router.push(a.href as never)}>
                {body}
              </TouchableOpacity>
            ) : (
              body
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.background },
  scroll: { padding: Space.lg, paddingBottom: Space.xxl },
  row: { flexDirection: "row", alignItems: "center", gap: Space.md },
  icon: {
    width: 38, height: 38, borderRadius: Radius.md,
    alignItems: "center", justifyContent: "center",
  },
  title: { fontFamily: Fonts.semibold, fontSize: 14, color: c.foreground },
  body: { fontFamily: Fonts.regular, fontSize: 12.5, color: c.muted, marginTop: 2, lineHeight: 18 },
});
