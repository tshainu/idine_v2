import { useMemo, useState } from "react";
import { Alert, Modal, View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Fonts, Radius, Shadow, Space, TableStatus } from "../../constants/theme";
import { Card, StatCard, SectionTitle, Pill, ErrorBanner, PrimaryButton } from "../../components/ui";
import { useSession } from "../../hooks/use-session";
import { useTables } from "../../queries/tables";
import { useOrders, useUpdateOrder, useUpdateRunningOrder } from "../../queries/orders";
import { useReprintKot } from "../../queries/print";
import { useActiveShift } from "../../queries/shifts";
import { lkr, initials, elapsed } from "../../lib/format";
import type { Order, OrderItem } from "../../lib/types";

const c = Colors.light;

const OPEN_STATUSES = ["pending", "confirmed", "served", "ready", "hold"];

export default function DashboardScreen() {
  const router = useRouter();
  const { session, branchId, waiterId } = useSession();
  const tables = useTables(branchId);
  const orders = useOrders(branchId, { waiterId });
  const shift = useActiveShift(waiterId);
  const updateRunningOrder = useUpdateRunningOrder();
  const reprintKot = useReprintKot();
  const updateOrder = useUpdateOrder();
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [draftItems, setDraftItems] = useState<OrderItem[]>([]);
  const [savingOrder, setSavingOrder] = useState(false);

  const openOrderModal = (order: Order) => {
    setSelectedOrder(order);
    setDraftItems((order.items ?? []).map((item) => ({ ...item })));
  };

  const closeOrderModal = (force = false) => {
    if (savingOrder && !force) return;
    setSelectedOrder(null);
    setDraftItems([]);
  };

  const changeDraftQty = (itemId: number, delta: number) => {
    setDraftItems((items) => items.map((item) => item.id === itemId
      ? { ...item, qty: Math.max(0, item.qty + delta), total: Math.max(0, item.qty + delta) * item.price }
      : item));
  };

  const saveOrderChanges = async () => {
    if (!selectedOrder) return;
    const original = selectedOrder.items ?? [];
    const removed = draftItems.filter((item) => item.qty <= 0).map((item) => item.id);
    const changed = draftItems
      .filter((item) => item.qty > 0)
      .filter((item) => original.find((source) => source.id === item.id)?.qty !== item.qty)
      .map((item) => ({ id: item.id, qty: item.qty, note: item.note }));
    if (!removed.length && !changed.length) {
      closeOrderModal();
      return;
    }
    setSavingOrder(true);
    try {
      const result = await updateRunningOrder.mutateAsync({
        orderId: selectedOrder.id,
        customerId: selectedOrder.customerId,
        customerName: selectedOrder.customerName,
        updates: changed,
        removeIds: removed,
        additions: [],
      });
      const deltas = [
        ...changed.flatMap((item) => {
          const previous = original.find((source) => source.id === item.id);
          const delta = item.qty - (previous?.qty ?? 0);
          return delta === 0 ? [] : [{ itemId: item.id, name: previous?.name ?? "Item", qty: Math.abs(delta), delta, note: item.note }];
        }),
        ...removed.map((id) => {
          const previous = original.find((item) => item.id === id)!;
          return { itemId: id, name: previous.name, qty: previous.qty, delta: -previous.qty, note: previous.note };
        }),
      ];
      if (deltas.length) {
        const removedItems = original.filter((item) => removed.includes(item.id));
        const printItems = [...result.items, ...removedItems.filter((item) => !result.items.some((next) => next.id === item.id))];
        await reprintKot.mutateAsync({
          order: result.order,
          items: printItems,
          deltas,
          branchId: result.order.branchId ?? branchId ?? null,
          tableName: (tables.data ?? []).find((table) => table.id === result.order.tableId)?.name ?? null,
          tableId: result.order.tableId,
          waiterName: result.order.placedBy ?? session?.name ?? null,
          customerPhone: null,
        });
      }
      closeOrderModal(true);
      Alert.alert("Order updated", "The modified order was sent to the relevant KOT station(s).");
    } catch (error) {
      Alert.alert("Update failed", (error as Error)?.message ?? "Could not update this order.");
    } finally {
      setSavingOrder(false);
    }
  };

  const cancelSelectedOrder = () => {
    if (!selectedOrder) return;
    Alert.alert("Cancel order?", `Cancel ${selectedOrder.orderNumber}? This cannot be undone.`, [
      { text: "Keep order", style: "cancel" },
      {
        text: "Cancel order",
        style: "destructive",
        onPress: async () => {
          setSavingOrder(true);
          try {
            await updateOrder.mutateAsync({ id: selectedOrder.id, status: "cancelled" });
            closeOrderModal(true);
            Alert.alert("Order cancelled", `${selectedOrder.orderNumber} has been cancelled.`);
          } catch (error) {
            Alert.alert("Cancellation failed", (error as Error)?.message ?? "Could not cancel this order.");
          } finally {
            setSavingOrder(false);
          }
        },
      },
    ]);
  };

  const stats = useMemo(() => {
    const all = orders.data ?? [];
    const open = all.filter((o) => OPEN_STATUSES.includes(o.status));
    const ready = all.filter((o) => o.status === "ready");
    return { open, ready };
  }, [orders.data]);

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
          <StatCard label="Ready to serve" value={String(stats.ready.length)} icon="notifications-outline" tone="success" style={s.gridItem} />
        </View>

        {/* Quick actions */}
        <SectionTitle title="Quick actions" />
        <View style={s.actions}>
          <QuickAction icon="restaurant-outline" label="New order" accent="#19B796" onPress={() => router.push("/(tabs)/tables")} />
          <QuickAction icon="notifications-outline" label="Ready items" accent="#D98218" onPress={() => router.push("/ready-items")} badge={stats.ready.length} />
          <QuickAction icon="receipt-outline" label="Reprint KOT" accent="#3579C7" onPress={() => router.push("/(tabs)/history")} />
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
                onPress={() => openOrderModal(o)}
              >
                <Card style={{ marginBottom: Space.md }}>
                  <View style={s.orderRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.orderNo}>#{o.orderNumber}</Text>
                      <Text style={s.orderMeta}>
                        {table?.name ?? o.type} · {o.items?.length ?? 0} items · {elapsed(o.createdAt)} · {o.waiterName ?? o.placedBy ?? "Unknown waiter"}
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

      <Modal
        visible={!!selectedOrder}
        transparent
        animationType="slide"
        onRequestClose={() => closeOrderModal()}
      >
        <View style={s.modalBackdrop}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => closeOrderModal()} />
          <View style={s.orderModal}>
            <View style={s.modalHandle} />
            <View style={s.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={s.modalTitle}>Order #{selectedOrder?.orderNumber}</Text>
                <Text style={s.modalSub}>
                  {(tables.data ?? []).find((table) => table.id === selectedOrder?.tableId)?.name ?? "Open order"}
                  {selectedOrder ? ` · ${selectedOrder.items?.length ?? 0} items · ${selectedOrder.waiterName ?? selectedOrder.placedBy ?? "Unknown waiter"}` : ""}
                </Text>
              </View>
              <TouchableOpacity style={s.modalClose} onPress={() => closeOrderModal()} activeOpacity={0.75}>
                <Ionicons name="close" size={20} color={c.muted} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={s.modalScroll} showsVerticalScrollIndicator={false}>
              <View style={s.modalTotalRow}>
                <View>
                  <Text style={s.modalEyebrow}>CURRENT TOTAL</Text>
                  <Text style={s.modalTotal}>{lkr(draftItems.reduce((sum, item) => sum + item.price * item.qty, 0))}</Text>
                </View>
                {selectedOrder ? <Pill label={selectedOrder.status} fg={c.primaryDark} bg={c.primarySoft} /> : null}
              </View>

              <Text style={s.modalSectionTitle}>Edit items</Text>
              {draftItems.map((item) => (
                <View key={item.id} style={[s.editItem, item.qty <= 0 && s.editItemRemoved]}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.editItemName}>{item.name}</Text>
                    {item.note ? <Text style={s.editItemNote}>{item.note}</Text> : null}
                    <Text style={s.editItemPrice}>{lkr(item.price)} each</Text>
                  </View>
                  <View style={s.qtyControl}>
                    <TouchableOpacity style={s.qtyButton} onPress={() => changeDraftQty(item.id, -1)} activeOpacity={0.75}>
                      <Ionicons name="remove" size={16} color={c.foreground} />
                    </TouchableOpacity>
                    <Text style={s.qtyValue}>{item.qty}</Text>
                    <TouchableOpacity style={s.qtyButton} onPress={() => changeDraftQty(item.id, 1)} activeOpacity={0.75}>
                      <Ionicons name="add" size={16} color={c.foreground} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
              <View style={s.kotNotice}>
                <Ionicons name="print-outline" size={18} color={c.primaryDark} />
                <Text style={s.kotNoticeText}>Saving changes sends an updated KOT to the relevant kitchen stations.</Text>
              </View>
              {selectedOrder?.tableId ? (
                <TouchableOpacity
                  style={s.addItemsButton}
                  activeOpacity={0.8}
                  onPress={() => {
                    const target = selectedOrder.tableId;
                    closeOrderModal(true);
                    router.push(`/order/${target}`);
                  }}
                >
                  <Ionicons name="add-circle-outline" size={18} color={c.primaryDark} />
                  <Text style={s.addItemsText}>Add new items to this order</Text>
                </TouchableOpacity>
              ) : null}
            </ScrollView>

            <View style={s.modalFooter}>
              <TouchableOpacity style={s.cancelOrderButton} onPress={cancelSelectedOrder} activeOpacity={0.8} disabled={savingOrder}>
                <Ionicons name="close-circle-outline" size={18} color={c.destructive} />
                <Text style={s.cancelOrderText}>Cancel order</Text>
              </TouchableOpacity>
              <PrimaryButton
                label="Save changes & send KOT"
                icon="send-outline"
                loading={savingOrder}
                onPress={saveOrderChanges}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function QuickAction({ icon, label, onPress, badge, accent }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; badge?: number; accent: string;
}) {
  return (
    <TouchableOpacity style={s.action} onPress={onPress} activeOpacity={0.8}>
      <View style={s.actionIcon}>
        <View style={[s.actionIconCircle, { borderColor: accent, backgroundColor: `${accent}12` }]}>
          <Ionicons name={icon} size={21} color={accent} />
        </View>
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
  scroll: { padding: Space.lg, paddingBottom: 150 },
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
  actionIconCircle: {
    width: 42, height: 42, borderRadius: Radius.md, borderWidth: 1.5,
    alignItems: "center", justifyContent: "center",
  },
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
  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(10, 20, 35, 0.45)" },
  orderModal: {
    maxHeight: "88%", backgroundColor: c.background, borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl, paddingTop: Space.sm, overflow: "hidden",
  },
  modalHandle: { alignSelf: "center", width: 42, height: 4, borderRadius: Radius.pill, backgroundColor: c.border, marginBottom: Space.sm },
  modalHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: Space.lg, paddingVertical: Space.md, borderBottomWidth: 1, borderBottomColor: c.border },
  modalTitle: { fontFamily: Fonts.bold, fontSize: 19, color: c.foreground },
  modalSub: { fontFamily: Fonts.regular, fontSize: 12, color: c.muted, marginTop: 3 },
  modalClose: { width: 36, height: 36, borderRadius: Radius.pill, backgroundColor: c.card, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c.border },
  modalScroll: { padding: Space.lg, paddingBottom: Space.md },
  modalTotalRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: c.card, borderRadius: Radius.lg, padding: Space.lg, borderWidth: 1, borderColor: c.border },
  modalEyebrow: { fontFamily: Fonts.semibold, fontSize: 10, letterSpacing: 0.8, color: c.muted },
  modalTotal: { fontFamily: Fonts.bold, fontSize: 24, color: c.foreground, marginTop: 2 },
  modalSectionTitle: { fontFamily: Fonts.bold, fontSize: 15, color: c.foreground, marginTop: Space.xl, marginBottom: Space.sm },
  editItem: { flexDirection: "row", alignItems: "center", gap: Space.md, backgroundColor: c.card, borderRadius: Radius.md, borderWidth: 1, borderColor: c.border, padding: Space.md, marginBottom: Space.sm },
  editItemRemoved: { opacity: 0.48 },
  editItemName: { fontFamily: Fonts.semibold, fontSize: 14, color: c.foreground },
  editItemNote: { fontFamily: Fonts.regular, fontSize: 11, color: c.muted, marginTop: 2 },
  editItemPrice: { fontFamily: Fonts.regular, fontSize: 11, color: c.muted, marginTop: 4 },
  qtyControl: { flexDirection: "row", alignItems: "center", gap: 8 },
  qtyButton: { width: 30, height: 30, borderRadius: Radius.pill, backgroundColor: c.primarySoft, alignItems: "center", justifyContent: "center" },
  qtyValue: { minWidth: 18, textAlign: "center", fontFamily: Fonts.bold, fontSize: 14, color: c.foreground },
  kotNotice: { flexDirection: "row", alignItems: "center", gap: Space.sm, backgroundColor: c.primarySoft, borderRadius: Radius.md, padding: Space.md, marginTop: Space.md },
  kotNoticeText: { flex: 1, fontFamily: Fonts.regular, fontSize: 11.5, lineHeight: 17, color: c.primaryDark },
  addItemsButton: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: Space.sm,
    marginTop: Space.md, minHeight: 44, borderRadius: Radius.md,
    borderWidth: 1, borderColor: c.primary, backgroundColor: c.primarySoft,
  },
  addItemsText: { fontFamily: Fonts.semibold, fontSize: 12.5, color: c.primaryDark },
  modalFooter: { flexDirection: "row", alignItems: "center", gap: Space.md, padding: Space.lg, paddingBottom: Space.xl, backgroundColor: c.card, borderTopWidth: 1, borderTopColor: c.border },
  cancelOrderButton: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: Space.sm, minHeight: 48 },
  cancelOrderText: { fontFamily: Fonts.semibold, fontSize: 12, color: c.destructive },
});
