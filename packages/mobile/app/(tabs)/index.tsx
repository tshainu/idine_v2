import { useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Fonts, Radius, Shadow, Space, TableStatus } from "../../constants/theme";
import { Card, StatCard, SectionTitle, Pill, ErrorBanner } from "../../components/ui";
import { useSession } from "../../hooks/use-session";
import { useTables } from "../../queries/tables";
import { useOrders } from "../../queries/orders";
import { useActiveShift } from "../../queries/shifts";
import { lkr, initials, startOfDay, elapsed } from "../../lib/format";

const c = Colors.light;

const OPEN_STATUSES = ["pending", "confirmed", "served", "ready", "hold"];

export default function DashboardScreen() {
  const router = useRouter();
  const { session, branchId, waiterId } = useSession();
  const tables = useTables(branchId);
  const orders = useOrders(branchId);
  const shift = useActiveShift(waiterId);

  const stats = useMemo(() => {
    const all = orders.data ?? [];
    const dayStart = startOfDay().getTime();
    const today = all.filter((o) => {
      const t = o.createdAt ? new Date(o.createdAt).getTime() : 0;
      return t >= dayStart;
    });
    const mine = today.filter((o) => o.waiterId === waiterId);
    const open = all.filter((o) => OPEN_STATUSES.includes(o.status));
    const ready = all.filter((o) => o.status === "ready");
    const sales = today
      .filter((o) => !["cancelled", "refunded"].includes(o.status))
      .reduce((s, o) => s + (o.total ?? 0), 0);
    const tips = mine.reduce((s, o) => s + (o.tipAmount ?? 0), 0);
    const occupied = (tables.data ?? []).filter((t) => t.status === "occupied").length;
    return { open, ready, sales, tips, occupied, myCount: mine.length };
  }, [orders.data, tables.data, waiterId]);

  const err = (orders.error ?? tables.error) as Error | null;
  const refreshing = orders.isFetching || tables.isFetching;

  return (
    <SafeAreaView style={s.safe} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { orders.refetch(); tables.refetch(); }}
            tintColor={c.primary}
          />
        }
      >
        {/* Greeting */}
        <View style={s.top}>
          <View style={{ flex: 1 }}>
            <Text style={s.hello}>Hi {session?.name?.split(" ")[0] ?? "there"}</Text>
            <Text style={s.role}>
              {shift.data ? `On shift · ${elapsed(shift.data.clockIn)}` : "Not clocked in"}
            </Text>
          </View>
          <TouchableOpacity onPress={() => router.push("/profile")} activeOpacity={0.8}>
            <View style={s.avatar}>
              <Text style={s.avatarText}>{initials(session?.name)}</Text>
            </View>
          </TouchableOpacity>
        </View>

        {err ? <ErrorBanner message={err.message} onRetry={() => { orders.refetch(); tables.refetch(); }} /> : null}

        {!shift.data ? (
          <TouchableOpacity onPress={() => router.push("/profile")} activeOpacity={0.9}>
            <View style={s.shiftBanner}>
              <Ionicons name="time-outline" size={19} color={c.warning} />
              <Text style={s.shiftText}>You're not clocked in. Tap to start your shift.</Text>
              <Ionicons name="chevron-forward" size={17} color={c.warning} />
            </View>
          </TouchableOpacity>
        ) : null}

        {/* Stats */}
        <View style={s.grid}>
          <StatCard label="Open orders" value={String(stats.open.length)} icon="receipt-outline" tone="primary" style={s.gridItem} />
          <StatCard label="Tables busy" value={String(stats.occupied)} icon="restaurant-outline" tone="warning" style={s.gridItem} />
          <StatCard label="Ready to serve" value={String(stats.ready.length)} icon="notifications-outline" tone="success" style={s.gridItem} />
          <StatCard label="Today's sales" value={lkr(stats.sales)} icon="cash-outline" tone="info" style={s.gridItem} />
        </View>

        <Card style={{ marginTop: Space.lg }}>
          <View style={s.tipRow}>
            <View style={s.tipIcon}>
              <Ionicons name="wallet-outline" size={18} color={c.success} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.tipLabel}>My tips today</Text>
              <Text style={s.tipHint}>{stats.myCount} order{stats.myCount === 1 ? "" : "s"} served by you</Text>
            </View>
            <Text style={s.tipValue}>{lkr(stats.tips)}</Text>
          </View>
        </Card>

        {/* Quick actions */}
        <SectionTitle title="Quick actions" />
        <View style={s.actions}>
          <QuickAction icon="add-circle-outline" label="New order" onPress={() => router.push("/(tabs)/tables")} />
          <QuickAction icon="notifications-outline" label="Ready items" onPress={() => router.push("/ready-items")} badge={stats.ready.length} />
          <QuickAction icon="print-outline" label="Reprint KOT" onPress={() => router.push("/(tabs)/history")} />
          <QuickAction icon="people-outline" label="Customers" onPress={() => router.push("/customer-lookup")} />
        </View>

        {/* Open orders */}
        <SectionTitle title="Open orders" action={stats.open.length ? "See all" : undefined} onAction={() => router.push("/(tabs)/history")} />
        {stats.open.length === 0 ? (
          <Card><Text style={s.noneText}>No open orders right now.</Text></Card>
        ) : (
          stats.open.slice(0, 5).map((o) => {
            const table = (tables.data ?? []).find((t) => t.id === o.tableId);
            const st = TableStatus[(o.status === "ready" ? "billed" : "occupied") as keyof typeof TableStatus];
            return (
              <TouchableOpacity
                key={o.id}
                activeOpacity={0.85}
                onPress={() => o.tableId && router.push(`/order/${o.tableId}`)}
              >
                <Card style={{ marginBottom: Space.md }}>
                  <View style={s.orderRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.orderNo}>{o.orderNumber}</Text>
                      <Text style={s.orderMeta}>
                        {table?.name ?? o.type} · {o.items?.length ?? 0} items · {elapsed(o.createdAt)}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 6 }}>
                      <Text style={s.orderTotal}>{lkr(o.total)}</Text>
                      <Pill label={o.status} fg={st.fg} bg={st.bg} border={st.border} />
                    </View>
                  </View>
                </Card>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function QuickAction({ icon, label, onPress, badge }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; badge?: number;
}) {
  return (
    <TouchableOpacity style={s.action} onPress={onPress} activeOpacity={0.8}>
      <View style={s.actionIcon}>
        <Ionicons name={icon} size={21} color={c.foreground} />
        {badge ? (
          <View style={s.badge}><Text style={s.badgeText}>{badge > 9 ? "9+" : badge}</Text></View>
        ) : null}
      </View>
      <Text style={s.actionLabel} numberOfLines={2}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.background },
  scroll: { padding: Space.lg, paddingBottom: Space.xxl },
  top: { flexDirection: "row", alignItems: "center", marginBottom: Space.lg },
  hello: { fontFamily: Fonts.bold, fontSize: 22, color: c.foreground },
  role: { fontFamily: Fonts.regular, fontSize: 13, color: c.muted, marginTop: 2 },
  avatar: {
    width: 44, height: 44, borderRadius: Radius.pill, backgroundColor: c.primary,
    alignItems: "center", justifyContent: "center",
  },
  avatarText: { fontFamily: Fonts.bold, fontSize: 15, color: c.onPrimary },
  shiftBanner: {
    flexDirection: "row", alignItems: "center", gap: Space.md,
    backgroundColor: c.warningSoft, borderRadius: Radius.md,
    borderWidth: 1, borderColor: "#F5D9A8", padding: Space.lg, marginBottom: Space.lg,
  },
  shiftText: { flex: 1, fontFamily: Fonts.medium, fontSize: 13, color: "#8A5A08" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: Space.md },
  gridItem: { width: "48%", flexGrow: 1, padding: Space.lg },
  tipRow: { flexDirection: "row", alignItems: "center", gap: Space.md },
  tipIcon: {
    width: 38, height: 38, borderRadius: Radius.md, backgroundColor: c.successSoft,
    alignItems: "center", justifyContent: "center",
  },
  tipLabel: { fontFamily: Fonts.semibold, fontSize: 14, color: c.foreground },
  tipHint: { fontFamily: Fonts.regular, fontSize: 12, color: c.muted, marginTop: 1 },
  tipValue: { fontFamily: Fonts.bold, fontSize: 17, color: c.success },
  actions: { flexDirection: "row", gap: Space.md },
  action: {
    flex: 1, backgroundColor: c.card, borderRadius: Radius.lg, borderWidth: 1,
    borderColor: c.border, paddingVertical: Space.lg, paddingHorizontal: 6,
    alignItems: "center", gap: 8, ...Shadow.card,
  },
  actionIcon: { position: "relative" },
  actionLabel: { fontFamily: Fonts.medium, fontSize: 11.5, color: c.foreground, textAlign: "center" },
  badge: {
    position: "absolute", top: -5, right: -9, minWidth: 17, height: 17,
    borderRadius: Radius.pill, backgroundColor: c.destructive,
    alignItems: "center", justifyContent: "center", paddingHorizontal: 4,
  },
  badgeText: { fontFamily: Fonts.bold, fontSize: 9.5, color: "#fff" },
  noneText: { fontFamily: Fonts.regular, fontSize: 13.5, color: c.muted, textAlign: "center" },
  orderRow: { flexDirection: "row", alignItems: "center" },
  orderNo: { fontFamily: Fonts.semibold, fontSize: 15, color: c.foreground },
  orderMeta: { fontFamily: Fonts.regular, fontSize: 12.5, color: c.muted, marginTop: 2 },
  orderTotal: { fontFamily: Fonts.bold, fontSize: 15, color: c.foreground },
});
