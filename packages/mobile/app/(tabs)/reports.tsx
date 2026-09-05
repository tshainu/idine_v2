import { useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Fonts, Radius, Space } from "../../constants/theme";
import { Card, StatCard, SectionTitle, Loading, ErrorBanner, EmptyState } from "../../components/ui";
import { useSession } from "../../hooks/use-session";
import { useOrders } from "../../queries/orders";
import { useMyShifts } from "../../queries/shifts";
import { lkr, startOfDay, startOfWeek, startOfMonth, dateOf, elapsed } from "../../lib/format";

const c = Colors.light;

const PERIODS = [
  { key: "today", label: "Today" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
] as const;
type PeriodKey = (typeof PERIODS)[number]["key"];

const VOID = ["cancelled", "refunded"];

export default function ReportsScreen() {
  const { branchId, waiterId } = useSession();
  const orders = useOrders(branchId, { waiterId });
  const shifts = useMyShifts(waiterId, branchId);
  const [period, setPeriod] = useState<PeriodKey>("today");
  const [mineOnly, setMineOnly] = useState(true);

  const from = useMemo(() => {
    if (period === "today") return startOfDay().getTime();
    if (period === "week") return startOfWeek().getTime();
    return startOfMonth().getTime();
  }, [period]);

  const data = useMemo(() => {
    const rows = (orders.data ?? [])
      .filter((o) => {
        const t = o.createdAt ? new Date(o.createdAt).getTime() : 0;
        return t >= from;
      })
      .filter((o) => (mineOnly ? o.waiterId === waiterId : true));

    const valid = rows.filter((o) => !VOID.includes(o.status));
    const sales = valid.reduce((s, o) => s + (o.total ?? 0), 0);
    const tips = valid.reduce((s, o) => s + (o.tipAmount ?? 0), 0);
    const covers = valid.length;
    const avg = covers ? sales / covers : 0;

    // Top sellers by quantity across the period.
    const byItem = new Map<string, { name: string; qty: number; amount: number }>();
    for (const o of valid) {
      for (const it of o.items ?? []) {
        const cur = byItem.get(it.name) ?? { name: it.name, qty: 0, amount: 0 };
        cur.qty += it.qty;
        cur.amount += it.total ?? 0;
        byItem.set(it.name, cur);
      }
    }
    const top = [...byItem.values()].sort((a, b) => b.qty - a.qty).slice(0, 8);

    const byType = new Map<string, number>();
    for (const o of valid) byType.set(o.type, (byType.get(o.type) ?? 0) + (o.total ?? 0));

    const cancelled = rows.filter((o) => VOID.includes(o.status)).length;

    return { sales, tips, covers, avg, top, byType: [...byType.entries()], cancelled };
  }, [orders.data, from, mineOnly, waiterId]);

  const shiftHours = useMemo(() => {
    const rows = (shifts.data ?? []).filter((sh) => {
      const t = sh.clockIn ? new Date(sh.clockIn).getTime() : 0;
      return t >= from;
    });
    let ms = 0;
    for (const sh of rows) {
      const a = sh.clockIn ? new Date(sh.clockIn).getTime() : 0;
      const b = sh.clockOut ? new Date(sh.clockOut).getTime() : Date.now();
      if (a) ms += b - a;
    }
    return { hours: ms / 3_600_000, count: rows.length };
  }, [shifts.data, from]);

  if (orders.isLoading) {
    return (
      <SafeAreaView style={s.safe} edges={["top", "left", "right"]}>
        <Loading label="Crunching numbers…" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={["top", "left", "right"]}>
      <View style={s.head}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Reports</Text>
          <Text style={s.sub}>{mineOnly ? "Your performance" : "Whole branch"}</Text>
        </View>
        <TouchableOpacity
          onPress={() => setMineOnly((v) => !v)}
          activeOpacity={0.8}
          style={[s.toggle, mineOnly && { backgroundColor: c.chrome, borderColor: c.chrome }]}
        >
          <Ionicons name="person" size={13} color={mineOnly ? c.onChrome : c.muted} />
          <Text style={[s.toggleText, mineOnly && { color: c.onChrome }]}>Mine</Text>
        </TouchableOpacity>
      </View>

      <View style={s.periods}>
        {PERIODS.map((p) => {
          const on = p.key === period;
          return (
            <TouchableOpacity
              key={p.key}
              onPress={() => setPeriod(p.key)}
              activeOpacity={0.8}
              style={[s.period, on && { backgroundColor: c.primarySoft, borderColor: c.primary }]}
            >
              <Text style={[s.periodText, on && { color: c.primaryDark }]}>{p.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={orders.isFetching}
            onRefresh={() => { orders.refetch(); shifts.refetch(); }}
            tintColor={c.primary}
          />
        }
      >
        {orders.error ? (
          <ErrorBanner message={(orders.error as Error).message} onRetry={() => orders.refetch()} />
        ) : null}

        <View style={s.grid}>
          <StatCard label="Sales" value={lkr(data.sales)} icon="cash-outline" tone="info" style={s.gridItem} />
          <StatCard label="Orders" value={String(data.covers)} icon="receipt-outline" tone="primary" style={s.gridItem} />
          <StatCard label="Avg order" value={lkr(data.avg)} icon="trending-up-outline" style={s.gridItem} />
          <StatCard label="Tips earned" value={lkr(data.tips)} icon="wallet-outline" tone="success" style={s.gridItem} />
        </View>

        <Card style={{ marginTop: Space.lg }}>
          <View style={s.line}>
            <Ionicons name="time-outline" size={17} color={c.muted} />
            <Text style={s.lineLabel}>Hours worked</Text>
            <Text style={s.lineValue}>
              {shiftHours.hours.toFixed(1)}h · {shiftHours.count} shift{shiftHours.count === 1 ? "" : "s"}
            </Text>
          </View>
          <View style={[s.line, { borderTopWidth: 1, borderTopColor: c.border, paddingTop: Space.md, marginTop: Space.md }]}>
            <Ionicons name="close-circle-outline" size={17} color={c.destructive} />
            <Text style={s.lineLabel}>Cancelled / refunded</Text>
            <Text style={[s.lineValue, { color: data.cancelled ? c.destructive : c.foreground }]}>
              {data.cancelled}
            </Text>
          </View>
        </Card>

        {data.byType.length ? (
          <>
            <SectionTitle title="By order type" />
            <Card>
              {data.byType.map(([type, amount], i) => {
                const pct = data.sales ? (amount / data.sales) * 100 : 0;
                return (
                  <View key={type} style={[s.bar, i > 0 && { marginTop: Space.md }]}>
                    <View style={s.barTop}>
                      <Text style={s.barLabel}>{type}</Text>
                      <Text style={s.barValue}>{lkr(amount)}</Text>
                    </View>
                    <View style={s.barTrack}>
                      <View style={[s.barFill, { width: `${Math.max(2, pct)}%` }]} />
                    </View>
                  </View>
                );
              })}
            </Card>
          </>
        ) : null}

        <SectionTitle title="Top sellers" />
        {data.top.length === 0 ? (
          <EmptyState icon="stats-chart-outline" title="No sales in this period" />
        ) : (
          <Card>
            {data.top.map((it, i) => (
              <View key={it.name} style={[s.topRow, i > 0 && s.topDivider]}>
                <Text style={s.topRank}>{i + 1}</Text>
                <Text style={s.topName} numberOfLines={1}>{it.name}</Text>
                <Text style={s.topQty}>{it.qty}×</Text>
                <Text style={s.topAmount}>{lkr(it.amount)}</Text>
              </View>
            ))}
          </Card>
        )}

        <Text style={s.note}>
          Tips are credited to the waiter and excluded from branch revenue.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.background },
  head: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: Space.lg, paddingTop: Space.md, paddingBottom: Space.md,
  },
  title: { fontFamily: Fonts.bold, fontSize: 22, color: c.foreground },
  sub: { fontFamily: Fonts.regular, fontSize: 12.5, color: c.muted, marginTop: 2 },
  toggle: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: Space.md, height: 34, borderRadius: Radius.pill,
    backgroundColor: c.card, borderWidth: 1, borderColor: c.border,
  },
  toggleText: { fontFamily: Fonts.medium, fontSize: 12, color: c.muted },
  periods: { flexDirection: "row", gap: Space.sm, paddingHorizontal: Space.lg, paddingBottom: Space.md },
  period: {
    paddingHorizontal: Space.xl, paddingVertical: 7, borderRadius: Radius.pill,
    backgroundColor: c.card, borderWidth: 1, borderColor: c.border,
  },
  periodText: { fontFamily: Fonts.medium, fontSize: 12.5, color: c.muted },
  scroll: { padding: Space.lg, paddingTop: 0, paddingBottom: 150 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: Space.md },
  gridItem: { width: "48%", flexGrow: 1, padding: Space.lg },
  line: { flexDirection: "row", alignItems: "center", gap: Space.md },
  lineLabel: { flex: 1, fontFamily: Fonts.regular, fontSize: 13.5, color: c.muted },
  lineValue: { fontFamily: Fonts.semibold, fontSize: 13.5, color: c.foreground },
  bar: {},
  barTop: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  barLabel: { fontFamily: Fonts.medium, fontSize: 12.5, color: c.foreground, textTransform: "capitalize" },
  barValue: { fontFamily: Fonts.semibold, fontSize: 12.5, color: c.foreground },
  barTrack: { height: 7, borderRadius: Radius.pill, backgroundColor: c.background, overflow: "hidden" },
  barFill: { height: 7, borderRadius: Radius.pill, backgroundColor: c.primary },
  topRow: { flexDirection: "row", alignItems: "center", gap: Space.md, paddingVertical: 9 },
  topDivider: { borderTopWidth: 1, borderTopColor: c.border },
  topRank: {
    fontFamily: Fonts.bold, fontSize: 11.5, color: c.mutedSoft,
    width: 18, textAlign: "center",
  },
  topName: { flex: 1, fontFamily: Fonts.regular, fontSize: 13.5, color: c.foreground },
  topQty: { fontFamily: Fonts.semibold, fontSize: 12.5, color: c.primaryDark, minWidth: 32, textAlign: "right" },
  topAmount: { fontFamily: Fonts.medium, fontSize: 12.5, color: c.muted, minWidth: 76, textAlign: "right" },
  note: {
    fontFamily: Fonts.regular, fontSize: 11.5, color: c.mutedSoft,
    textAlign: "center", marginTop: Space.xl, paddingHorizontal: Space.lg, lineHeight: 17,
  },
});
