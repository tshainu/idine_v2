import { useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Fonts, Radius, Space } from "../../constants/theme";
import { Card, Loading, EmptyState, ErrorBanner, Pill, PrimaryButton } from "../../components/ui";
import { useSession } from "../../hooks/use-session";
import { useOrders } from "../../queries/orders";
import { useTables } from "../../queries/tables";
import { useReprintKot } from "../../queries/print";
import { lkr, dateTimeOf, startOfDay, startOfWeek } from "../../lib/format";
import type { Order } from "../../lib/types";

const c = Colors.light;

const RANGES = [
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "all", label: "All" },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

const STATUS_TONE: Record<string, { fg: string; bg: string }> = {
  pending: { fg: c.warning, bg: c.warningSoft },
  confirmed: { fg: c.info, bg: c.infoSoft },
  ready: { fg: c.success, bg: c.successSoft },
  served: { fg: c.success, bg: c.successSoft },
  completed: { fg: c.success, bg: c.successSoft },
  paid: { fg: c.success, bg: c.successSoft },
  cancelled: { fg: c.destructive, bg: c.destructiveSoft },
  refunded: { fg: c.destructive, bg: c.destructiveSoft },
  hold: { fg: c.muted, bg: c.background },
};

export default function HistoryScreen() {
  const { branchId, waiterId, waiterName } = useSession();
  const orders = useOrders(branchId);
  const tables = useTables(branchId);
  const reprint = useReprintKot();

  const [range, setRange] = useState<RangeKey>("today");
  const [mineOnly, setMineOnly] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [printingId, setPrintingId] = useState<number | null>(null);

  const shown = useMemo(() => {
    const from =
      range === "today" ? startOfDay().getTime() : range === "week" ? startOfWeek().getTime() : 0;
    return (orders.data ?? [])
      .filter((o) => {
        const t = o.createdAt ? new Date(o.createdAt).getTime() : 0;
        return t >= from;
      })
      .filter((o) => (mineOnly ? o.waiterId === waiterId : true));
  }, [orders.data, range, mineOnly, waiterId]);

  const tableName = (o: Order) =>
    (tables.data ?? []).find((t) => t.id === o.tableId)?.name ?? null;

  async function doReprint(o: Order) {
    const items = o.items ?? [];
    if (!items.length) {
      Alert.alert("Nothing to print", "This order has no items.");
      return;
    }
    setPrintingId(o.id);
    try {
      const res = await reprint.mutateAsync({
        order: o,
        items,
        branchId: branchId ?? null,
        tableName: tableName(o),
        waiterName,
      });
      Alert.alert(res.ok ? "KOT reprinted" : "Reprint failed", res.message);
    } catch (e) {
      Alert.alert("Reprint failed", (e as Error)?.message ?? "Could not reprint the KOT.");
    } finally {
      setPrintingId(null);
    }
  }

  if (orders.isLoading) {
    return (
      <SafeAreaView style={s.safe} edges={["top", "left", "right"]}>
        <Loading label="Loading orders…" />
      </SafeAreaView>
    );
  }

  const total = shown
    .filter((o) => !["cancelled", "refunded"].includes(o.status))
    .reduce((sum, o) => sum + (o.total ?? 0), 0);

  return (
    <SafeAreaView style={s.safe} edges={["top", "left", "right"]}>
      <View style={s.head}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Order history</Text>
          <Text style={s.sub}>{shown.length} orders · {lkr(total)}</Text>
        </View>
        <TouchableOpacity
          onPress={() => setMineOnly((v) => !v)}
          activeOpacity={0.8}
          style={[s.mineBtn, mineOnly && { backgroundColor: c.foreground, borderColor: c.foreground }]}
        >
          <Ionicons name="person" size={13} color={mineOnly ? "#fff" : c.muted} />
          <Text style={[s.mineText, mineOnly && { color: "#fff" }]}>Mine</Text>
        </TouchableOpacity>
      </View>

      <View style={s.ranges}>
        {RANGES.map((r) => {
          const on = r.key === range;
          return (
            <TouchableOpacity
              key={r.key}
              onPress={() => setRange(r.key)}
              activeOpacity={0.8}
              style={[s.range, on && { backgroundColor: c.primarySoft, borderColor: c.primary }]}
            >
              <Text style={[s.rangeText, on && { color: c.primaryDark }]}>{r.label}</Text>
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
            onRefresh={() => orders.refetch()}
            tintColor={c.primary}
          />
        }
      >
        {orders.error ? (
          <ErrorBanner message={(orders.error as Error).message} onRetry={() => orders.refetch()} />
        ) : null}

        {shown.length === 0 ? (
          <EmptyState
            icon="receipt-outline"
            title="No orders yet"
            hint={range === "today" ? "Orders you take today will appear here." : "Nothing in this period."}
          />
        ) : (
          shown.map((o) => {
            const open = expanded === o.id;
            const tone = STATUS_TONE[o.status] ?? { fg: c.muted, bg: c.background };
            return (
              <Card key={o.id} style={{ marginBottom: Space.md }}>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setExpanded(open ? null : o.id)}
                >
                  <View style={s.row}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.orderNo}>{o.orderNumber}</Text>
                      <Text style={s.meta}>
                        {tableName(o) ?? o.type} · {o.items?.length ?? 0} items
                      </Text>
                      <Text style={s.metaDim}>{dateTimeOf(o.createdAt)}</Text>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 6 }}>
                      <Text style={s.total}>{lkr(o.total)}</Text>
                      <Pill label={o.status} fg={tone.fg} bg={tone.bg} />
                      {(o.tipAmount ?? 0) > 0 ? (
                        <Text style={s.tip}>tip {lkr(o.tipAmount)}</Text>
                      ) : null}
                    </View>
                    <Ionicons
                      name={open ? "chevron-up" : "chevron-down"}
                      size={17}
                      color={c.mutedSoft}
                      style={{ marginLeft: Space.sm }}
                    />
                  </View>
                </TouchableOpacity>

                {open ? (
                  <View style={s.detail}>
                    {(o.items ?? []).map((it) => (
                      <View key={it.id} style={s.itemRow}>
                        <Text style={s.itemQty}>{it.qty}×</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={s.itemName}>{it.name}</Text>
                          {it.note ? <Text style={s.itemNote}>{it.note}</Text> : null}
                        </View>
                        <Text style={s.itemPrice}>{lkr(it.total)}</Text>
                      </View>
                    ))}

                    <View style={s.sumRow}>
                      <Text style={s.sumLabel}>Subtotal</Text>
                      <Text style={s.sumValue}>{lkr(o.subtotal)}</Text>
                    </View>
                    {(o.discount ?? 0) > 0 ? (
                      <View style={s.sumRow}>
                        <Text style={s.sumLabel}>Discount</Text>
                        <Text style={s.sumValue}>-{lkr(o.discount)}</Text>
                      </View>
                    ) : null}
                    {(o.tipAmount ?? 0) > 0 ? (
                      <View style={s.sumRow}>
                        <Text style={s.sumLabel}>Tip (to waiter)</Text>
                        <Text style={[s.sumValue, { color: c.success }]}>{lkr(o.tipAmount)}</Text>
                      </View>
                    ) : null}

                    <PrimaryButton
                      label="Reprint KOT"
                      icon="print-outline"
                      variant="outline"
                      loading={printingId === o.id}
                      onPress={() => doReprint(o)}
                      style={{ marginTop: Space.lg }}
                    />
                  </View>
                ) : null}
              </Card>
            );
          })
        )}
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
  mineBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: Space.md, height: 34, borderRadius: Radius.pill,
    backgroundColor: c.card, borderWidth: 1, borderColor: c.border,
  },
  mineText: { fontFamily: Fonts.medium, fontSize: 12, color: c.muted },
  ranges: { flexDirection: "row", gap: Space.sm, paddingHorizontal: Space.lg, paddingBottom: Space.md },
  range: {
    paddingHorizontal: Space.lg, paddingVertical: 7, borderRadius: Radius.pill,
    backgroundColor: c.card, borderWidth: 1, borderColor: c.border,
  },
  rangeText: { fontFamily: Fonts.medium, fontSize: 12.5, color: c.muted },
  scroll: { padding: Space.lg, paddingTop: 0, paddingBottom: Space.xxl },
  row: { flexDirection: "row", alignItems: "center" },
  orderNo: { fontFamily: Fonts.semibold, fontSize: 15, color: c.foreground },
  meta: { fontFamily: Fonts.regular, fontSize: 12.5, color: c.muted, marginTop: 2 },
  metaDim: { fontFamily: Fonts.regular, fontSize: 11, color: c.mutedSoft, marginTop: 1 },
  total: { fontFamily: Fonts.bold, fontSize: 15, color: c.foreground },
  tip: { fontFamily: Fonts.medium, fontSize: 10.5, color: c.success },
  detail: { marginTop: Space.lg, borderTopWidth: 1, borderTopColor: c.border, paddingTop: Space.md },
  itemRow: { flexDirection: "row", alignItems: "flex-start", gap: Space.md, paddingVertical: 5 },
  itemQty: { fontFamily: Fonts.semibold, fontSize: 13, color: c.primaryDark, minWidth: 26 },
  itemName: { fontFamily: Fonts.regular, fontSize: 13.5, color: c.foreground },
  itemNote: { fontFamily: Fonts.regular, fontSize: 11.5, color: c.muted, marginTop: 1 },
  itemPrice: { fontFamily: Fonts.medium, fontSize: 13, color: c.foreground },
  sumRow: {
    flexDirection: "row", justifyContent: "space-between",
    marginTop: Space.sm, paddingTop: Space.sm,
  },
  sumLabel: { fontFamily: Fonts.regular, fontSize: 12.5, color: c.muted },
  sumValue: { fontFamily: Fonts.semibold, fontSize: 12.5, color: c.foreground },
});
