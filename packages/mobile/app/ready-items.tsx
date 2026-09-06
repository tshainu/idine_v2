import { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Fonts, Radius, Space } from "../constants/theme";
import { Card, ScreenHeader, Loading, EmptyState, ErrorBanner, PrimaryButton, Pill } from "../components/ui";
import { useSession } from "../hooks/use-session";
import { useReadyAlert } from "../components/ready-alert";
import { useOrders, useUpdateOrder } from "../queries/orders";
import { useTables } from "../queries/tables";
import { lkr, elapsed } from "../lib/format";

const c = Colors.light;

export default function ReadyItemsScreen() {
  const router = useRouter();
  const { branchId, waiterId } = useSession();
  // Kitchen marks orders ready — poll faster here, this is a live pickup queue.
  const orders = useOrders(branchId, { poll: 15_000, waiterId });
  const tables = useTables(branchId);
  const update = useUpdateOrder();
  const [busyId, setBusyId] = useState<number | null>(null);
  // Opening the pickup list is the acknowledgement — the ring stops here.
  const { acknowledge } = useReadyAlert();
  useEffect(() => { acknowledge(); }, [acknowledge]);

  const ready = useMemo(
    () =>
      (orders.data ?? [])
        .filter((o) => o.status === "ready")
        .sort((a, b) => {
          const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return ta - tb; // oldest first — that food is getting cold
        }),
    [orders.data],
  );

  async function markServed(id: number, orderNumber: string) {
    setBusyId(id);
    try {
      await update.mutateAsync({ id, status: "served" });
    } catch (e) {
      Alert.alert("Could not update", (e as Error)?.message ?? `${orderNumber} was not updated.`);
    } finally {
      setBusyId(null);
    }
  }

  if (orders.isLoading) {
    return (
      <SafeAreaView style={s.safe} edges={["top", "left", "right"]}>
        <ScreenHeader title="Ready items" onBack={() => router.back()} />
        <Loading label="Checking the kitchen…" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={["top", "left", "right"]}>
      <ScreenHeader
        title="Ready items"
        subtitle={ready.length ? `${ready.length} waiting for pickup` : "Nothing waiting"}
        onBack={() => router.back()}
      />

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={orders.isFetching} onRefresh={() => orders.refetch()} tintColor={c.primary} />
        }
      >
        {orders.error ? (
          <ErrorBanner message={(orders.error as Error).message} onRetry={() => orders.refetch()} />
        ) : null}

        {ready.length === 0 ? (
          <EmptyState
            icon="checkmark-done-outline"
            title="All caught up"
            hint="When the kitchen marks an order ready, it shows up here."
          />
        ) : (
          ready.map((o) => {
            const table = (tables.data ?? []).find((t) => t.id === o.tableId);
            const waited = o.createdAt ? Date.now() - new Date(o.createdAt).getTime() : 0;
            const late = waited > 15 * 60_000;
            return (
              <Card key={o.id} style={{ marginBottom: Space.md }}>
                <View style={s.head}>
                  <View style={s.iconWrap}>
                    <Ionicons name="restaurant" size={18} color={c.success} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.table}>{table?.name ?? o.type}</Text>
                    <Text style={s.order}>{o.orderNumber} · {lkr(o.total)}</Text>
                  </View>
                  <Pill
                    label={elapsed(o.createdAt)}
                    fg={late ? c.destructive : c.muted}
                    bg={late ? c.destructiveSoft : c.background}
                  />
                </View>

                <View style={s.items}>
                  {(o.items ?? []).map((it) => (
                    <View key={it.id} style={s.itemRow}>
                      <Text style={s.qty}>{it.qty}×</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={s.itemName}>{it.name}</Text>
                        {it.note ? <Text style={s.itemNote}>{it.note}</Text> : null}
                      </View>
                    </View>
                  ))}
                </View>

                <PrimaryButton
                  label="Mark as served"
                  icon="checkmark-circle-outline"
                  variant="success"
                  loading={busyId === o.id}
                  onPress={() => markServed(o.id, o.orderNumber)}
                />
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
  scroll: { padding: Space.lg, paddingBottom: Space.xxl },
  head: { flexDirection: "row", alignItems: "center", gap: Space.md },
  iconWrap: {
    width: 38, height: 38, borderRadius: Radius.md, backgroundColor: c.successSoft,
    alignItems: "center", justifyContent: "center",
  },
  table: { fontFamily: Fonts.semibold, fontSize: 15.5, color: c.foreground },
  order: { fontFamily: Fonts.regular, fontSize: 12.5, color: c.muted, marginTop: 1 },
  items: {
    marginTop: Space.md, marginBottom: Space.lg, paddingTop: Space.md,
    borderTopWidth: 1, borderTopColor: c.border,
  },
  itemRow: { flexDirection: "row", gap: Space.md, paddingVertical: 4 },
  qty: { fontFamily: Fonts.semibold, fontSize: 13, color: c.primaryDark, minWidth: 26 },
  itemName: { fontFamily: Fonts.regular, fontSize: 13.5, color: c.foreground },
  itemNote: { fontFamily: Fonts.regular, fontSize: 11.5, color: c.warning, marginTop: 1 },
});
