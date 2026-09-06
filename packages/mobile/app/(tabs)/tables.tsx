import { useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Fonts, Radius, Shadow, Space, TableStatus, type TableStatusKey } from "../../constants/theme";
import { Loading, EmptyState, ErrorBanner, Pill } from "../../components/ui";
import { useSession } from "../../hooks/use-session";
import { useTables } from "../../queries/tables";
import { useOrders } from "../../queries/orders";
import { lkr, elapsed } from "../../lib/format";
import type { Table } from "../../lib/types";

const c = Colors.light;
const OPEN_STATUSES = ["pending", "confirmed", "served", "ready", "hold"];

function statusKey(s: string): TableStatusKey {
  return (["available", "occupied", "billed", "reserved"] as const).includes(s as TableStatusKey)
    ? (s as TableStatusKey)
    : "available";
}

export default function TablesScreen() {
  const router = useRouter();
  const { branchId, waiterId } = useSession();
  const tables = useTables(branchId);
  // Every waiter must see the whole floor: occupancy is derived from the branch's
  // live open orders, never from a single waiter's slice.
  const orders = useOrders(branchId);
  const [zone, setZone] = useState<string>("all");

  // Attach each table's open order so the tile can show the running total.
  // `tables.status` goes stale whenever the POS settles an order without resetting
  // the table, so the live order list is the source of truth for occupancy.
  const enriched = useMemo(() => {
    const open = (orders.data ?? []).filter((o) => OPEN_STATUSES.includes(o.status));
    return (tables.data ?? []).map((t) => {
      const order = open.find((o) => o.tableId === t.id) ?? null;
      const status = order
        ? (t.status === "billed" ? "billed" : "occupied")
        : (t.status === "reserved" ? "reserved" : "available");
      return { table: { ...t, status }, order };
    });
  }, [tables.data, orders.data]);

  const zones = useMemo(() => {
    const set = new Set<string>();
    for (const { table } of enriched) if (table.zone) set.add(table.zone);
    return ["all", ...[...set].sort()];
  }, [enriched]);

  const shown = zone === "all" ? enriched : enriched.filter((e) => e.table.zone === zone);

  const counts = useMemo(() => {
    const by: Record<string, number> = { available: 0, occupied: 0, billed: 0, reserved: 0 };
    for (const { table } of enriched) by[statusKey(table.status)] = (by[statusKey(table.status)] ?? 0) + 1;
    return by;
  }, [enriched]);

  if (tables.isLoading) {
    return (
      <SafeAreaView style={s.safe} edges={["top", "left", "right"]}>
        <Loading label="Loading floor plan…" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={["top", "left", "right"]}>
      <View style={s.head}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Tables</Text>
          <Text style={s.sub}>
            {counts.available} free · {counts.occupied} busy · {counts.billed} billed
          </Text>
        </View>
        <TouchableOpacity
          style={s.iconBtn}
          activeOpacity={0.8}
          onPress={() => { tables.refetch(); orders.refetch(); }}
        >
          <Ionicons name="refresh" size={19} color={c.foreground} />
        </TouchableOpacity>
      </View>

      {zones.length > 2 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.zones}>
          {zones.map((z) => {
            const on = z === zone;
            return (
              <TouchableOpacity
                key={z}
                onPress={() => setZone(z)}
                activeOpacity={0.8}
                style={[s.zone, on && { backgroundColor: c.chrome, borderColor: c.chrome }]}
              >
                <Text style={[s.zoneText, on && { color: c.onChrome }]}>
                  {z === "all" ? "All areas" : z}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : null}

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={tables.isFetching || orders.isFetching}
            onRefresh={() => { tables.refetch(); orders.refetch(); }}
            tintColor={c.primary}
          />
        }
      >
        {tables.error ? (
          <ErrorBanner message={(tables.error as Error).message} onRetry={() => tables.refetch()} />
        ) : null}

        {shown.length === 0 ? (
          <EmptyState
            icon="restaurant-outline"
            title="No tables here"
            hint="Ask your manager to add tables for this branch in the admin panel."
          />
        ) : (
          <View style={s.grid}>
            {shown.map(({ table, order }) => (
              <TableTile
                key={table.id}
                table={table}
                total={order?.total ?? null}
                itemCount={order?.items?.length ?? 0}
                since={order?.createdAt ?? null}
                mine={!!order && !!waiterId && order.waiterId === waiterId}
                owner={order?.placedBy ?? null}
                // Any waiter may add a round to a running order, whoever opened it.
                onPress={() => router.push(`/order/${table.id}`)}
              />
            ))}
          </View>
        )}

        <View style={s.legend}>
          {(["available", "occupied", "billed", "reserved"] as TableStatusKey[]).map((k) => (
            <View key={k} style={s.legendItem}>
              <View style={[s.legendDot, { backgroundColor: TableStatus[k].fg }]} />
              <Text style={s.legendText}>{TableStatus[k].label}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function TableTile({ table, total, itemCount, since, mine, owner, onPress }: {
  table: Table; total: number | null; itemCount: number;
  since: number | null; mine: boolean; owner: string | null; onPress: () => void;
}) {
  const key = statusKey(table.status);
  const tone = TableStatus[key];
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[s.tile, { backgroundColor: tone.bg, borderColor: tone.border }]}
    >
      <View style={s.tileTop}>
        <Text style={[s.tileName, { color: tone.fg }]} numberOfLines={1}>{table.name}</Text>
        {table.capacity ? (
          <View style={s.cap}>
            <Ionicons name="person" size={10} color={tone.fg} />
            <Text style={[s.capText, { color: tone.fg }]}>{table.capacity}</Text>
          </View>
        ) : null}
      </View>

      <Pill label={tone.label} fg={tone.fg} bg="#FFFFFF99" style={{ alignSelf: "flex-start" }} />

      {total !== null ? (
        <View style={s.tileFoot}>
          <Text style={[s.tileTotal, { color: tone.fg }]}>{lkr(total)}</Text>
          <Text style={s.tileMeta}>{itemCount} items · {elapsed(since)}</Text>
          {!mine && owner ? <Text style={s.tileMeta} numberOfLines={1}>Opened by {owner}</Text> : null}
        </View>
      ) : (
        <View style={s.tileFoot}>
          <Text style={s.tileMeta}>Tap to take an order</Text>
        </View>
      )}
    </TouchableOpacity>
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
  iconBtn: {
    width: 40, height: 40, borderRadius: Radius.md, backgroundColor: c.card,
    borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center",
  },
  zones: { paddingHorizontal: Space.lg, gap: Space.sm, paddingBottom: Space.md },
  zone: {
    paddingHorizontal: Space.lg, paddingVertical: 7, borderRadius: Radius.pill,
    backgroundColor: c.card, borderWidth: 1, borderColor: c.border,
  },
  zoneText: { fontFamily: Fonts.medium, fontSize: 12.5, color: c.muted },
  scroll: { padding: Space.lg, paddingTop: 0, paddingBottom: 150 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: Space.md },
  tile: {
    width: "48%", flexGrow: 1, minHeight: 108, borderRadius: Radius.lg,
    borderWidth: 1, padding: Space.lg, justifyContent: "space-between",
    gap: Space.sm, ...Shadow.card,
  },
  tileTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  tileName: { fontFamily: Fonts.bold, fontSize: 17, flex: 1 },
  cap: { flexDirection: "row", alignItems: "center", gap: 3, opacity: 0.75 },
  capText: { fontFamily: Fonts.medium, fontSize: 11 },
  tileFoot: { gap: 1 },
  tileTotal: { fontFamily: Fonts.bold, fontSize: 15 },
  tileMeta: { fontFamily: Fonts.regular, fontSize: 11, color: c.muted },
  legend: {
    flexDirection: "row", flexWrap: "wrap", gap: Space.lg,
    justifyContent: "center", marginTop: Space.xl,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 9, height: 9, borderRadius: Radius.pill },
  legendText: { fontFamily: Fonts.regular, fontSize: 11.5, color: c.muted },
});
