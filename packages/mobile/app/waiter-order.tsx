import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, StatusBar, ScrollView, TextInput,
  Alert, Image, KeyboardAvoidingView, Platform, Modal, FlatList,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../lib/api";
import { loadUser, WaiterUser } from "../lib/auth";
import { loadPrinterConfig, printKot, type PrinterConfig } from "../lib/printer";
import type { KotPayload } from "../lib/escpos";

// ── Design tokens ────────────────────────────────────────────────
const C = {
  navy:    "#0D1B6E",
  navy2:   "#162280",
  navy3:   "#0A1255",
  accent:  "#4F6EF7",
  white:   "#FFFFFF",
  light:   "#EEF0FB",
  muted:   "#8891B8",
  red:     "#EF4444",
  green:   "#22C55E",
  amber:   "#F59E0B",
  gold:    "#F5A623",
  card:    "#F7F8FE",
  border:  "#DDE1F5",
  navBg:   "#111A5C",
};

type Variation = { id: number; name: string; code?: string; priceDineIn: number };
type CartItem  = {
  menuItemId: number;
  name: string;
  price: number;
  qty: number;
  notes: string;
  variationId?: number;
  variationName?: string;
};

function cartKey(menuItemId: number, variationId?: number) {
  return `${menuItemId}_${variationId ?? "base"}`;
}
function getTime() {
  const n = new Date();
  return n.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

export default function WaiterOrderScreen() {
  const { tableId, name: tableName } = useLocalSearchParams<{
    tableId: string; name: string; status: string;
  }>();
  const router = useRouter();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();

  const [user, setUser] = useState<WaiterUser | null>(null);
  const [time, setTime] = useState(getTime());
  const [cart, setCart] = useState<Record<string, CartItem>>({});
  const [selectedCat, setSelectedCat] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [showCart, setShowCart] = useState(true);
  const [showHoldList, setShowHoldList] = useState(false);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerLocation, setNewCustomerLocation] = useState("");

  // Printer config is read once on mount so placing an order never waits on AsyncStorage.
  const [printerCfg, setPrinterCfg] = useState<PrinterConfig | null>(null);

  useEffect(() => {
    loadUser().then(setUser);
    loadPrinterConfig().then(setPrinterCfg);
    const iv = setInterval(() => setTime(getTime()), 30000);
    return () => clearInterval(iv);
  }, []);

  // Categories
  const { data: catData } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const res = await api.categories.$get();
      const json = await res.json() as any;
      return json.categories ?? [];
    },
  });
  const categories: any[] = catData ?? [];

  // Menu items with variations
  const { data: menuData, isLoading: menuLoading } = useQuery({
    queryKey: ["menu-items", selectedCat],
    queryFn: async () => {
      const res = await api["menu-items"].$get({
        query: selectedCat ? { categoryId: String(selectedCat) } : {},
      });
      const json = await res.json() as any;
      return json.menuItems ?? [];
    },
  });
  const allItems: any[] = menuData ?? [];
  const filteredItems = allItems
    .filter(i =>
      i.isActive !== false &&
      (search === "" || i.name.toLowerCase().includes(search.toLowerCase()))
    )
    .sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { sensitivity: "base", numeric: true }));

  // Held orders for this table
  const { data: holdData, refetch: refetchHold } = useQuery({
    queryKey: ["hold-orders", tableId],
    queryFn: async () => {
      const res = await api.orders.$get({ query: { branchId: String(user?.branchId ?? 1), status: "hold" } });
      const json = await res.json() as any;
      const all: any[] = json.orders ?? [];
      return all.filter((o: any) => String(o.tableId) === String(tableId));
    },
    enabled: !!user,
  });
  const holdOrders: any[] = holdData ?? [];

  // Cart helpers — memoised so the item grid doesn't re-derive totals on every render.
  const cartList = useMemo(() => Object.values(cart), [cart]);
  const totalQty = useMemo(() => cartList.reduce((s, c) => s + c.qty, 0), [cartList]);
  const totalAmt = useMemo(() => cartList.reduce((s, c) => s + c.price * c.qty, 0), [cartList]);

  function addItem(item: any, variationId?: number, variationName?: string, variationPrice?: number) {
    const price = variationPrice ?? Number(item.priceDineIn ?? item.price ?? 0);
    const key = cartKey(item.id, variationId);
    setCart(prev => {
      const ex = prev[key];
      if (ex) return { ...prev, [key]: { ...ex, qty: ex.qty + 1 } };
      return { ...prev, [key]: { menuItemId: item.id, name: item.name, price, qty: 1, notes: "", variationId, variationName } };
    });
  }

  function removeItem(key: string) {
    setCart(prev => {
      const ex = prev[key];
      if (!ex) return prev;
      if (ex.qty <= 1) { const n = { ...prev }; delete n[key]; return n; }
      return { ...prev, [key]: { ...ex, qty: ex.qty - 1 } };
    });
  }

  function getQty(menuItemId: number, variationId?: number) {
    return cart[cartKey(menuItemId, variationId)]?.qty ?? 0;
  }

  // ── Place order (sends to kitchen + prints KOT) ──────────────────
  const placeOrder = useMutation({
    mutationFn: async () => {
      if (cartList.length === 0) throw new Error("Cart is empty");

      // 1. Create order with confirmed status so it appears in KDS
      const orderRes = await api.orders.$post({
        json: {
          tableId: Number(tableId),
          branchId: user?.branchId ?? 1,
          customerName: customerName || `Table ${tableName}`,
          coverCount: 1,
          status: "confirmed",   // ← confirmed so KDS picks it up immediately
          source: "waiter",
          waiterId: user?.id,
          type: "dine-in",
        },
      });
      const oj = await orderRes.json() as any;
      const order = oj.order ?? oj;
      const orderId = order.id;

      // 2. Add items
      await api["order-items"].bulk.$post({
        json: {
          items: cartList.map(c => ({
            orderId,
            menuItemId: c.menuItemId,
            name: c.variationName ? `${c.name} (${c.variationName})` : c.name,
            price: c.price,
            qty: c.qty,
          })),
        },
      });

      // 3. Update table status to occupied
      try {
        await api.tables[":id"].$patch({
          param: { id: String(tableId) },
          json: { status: "occupied" },
        });
      } catch (_) {}

      // 4. KOT — print from this phone when a printer is configured, and fall back to
      //    the server print queue (drained by the kitchen print helper) if that fails.
      const kot: KotPayload = {
        orderNumber: order.orderNumber,
        type: "dine-in",
        tableName: tableName,
        waiterName: user?.name,
        customerName: customerName || `Table ${tableName}`,
        mode: "new",
        items: cartList.map(c => ({
          name: c.name,
          variationName: c.variationName,
          qty: c.qty,
          notes: c.notes,
        })),
      };

      const queueOnServer = async () => {
        await api["print-jobs"].$post({
          json: {
            orderId,
            branchId: user?.branchId ?? 1,
            type: "kot",
            status: "pending",
            idempotencyKey: `kot-${orderId}`,
            payload: JSON.stringify({
              orderNumber: kot.orderNumber,
              type: kot.type,
              tableName: kot.tableName,
              waiterName: kot.waiterName,
              customerName: kot.customerName,
              items: cartList.map(c => ({
                name: c.variationName ? `${c.name} (${c.variationName})` : c.name,
                qty: c.qty,
                notes: c.notes,
              })),
            }),
          },
        });
      };

      const cfg = printerCfg ?? (await loadPrinterConfig());
      const printResult = await printKot(kot, cfg, queueOnServer);

      return { orderId, printResult };
    },
    onSuccess: ({ printResult }) => {
      qc.invalidateQueries({ queryKey: ["tables"], exact: false });
      qc.invalidateQueries({ queryKey: ["kds-orders"] });
      qc.invalidateQueries({ queryKey: ["orders"], exact: false });
      Alert.alert(
        printResult.ok ? "Order Placed ✅" : "Order Placed — KOT failed ⚠️",
        printResult.message,
        [
          { text: "New Order", onPress: () => { setCart({}); setCustomerName(""); } },
          { text: "Back to Tables", onPress: () => { setCart({}); router.back(); } },
        ],
      );
    },
    onError: (e: any) => Alert.alert("Error", e?.message ?? "Failed to place order"),
  });

  // ── Hold order ───────────────────────────────────────────────────
  const holdOrder = useMutation({
    mutationFn: async () => {
      if (cartList.length === 0) throw new Error("Cart is empty");
      const orderRes = await api.orders.$post({
        json: {
          tableId: Number(tableId),
          branchId: user?.branchId ?? 1,
          customerName: customerName || `Table ${tableName}`,
          coverCount: 1,
          status: "hold",
          source: "waiter",
          waiterId: user?.id,
          type: "dine-in",
        },
      });
      const oj = await orderRes.json() as any;
      const orderId = oj.order?.id ?? oj.id;
      await api["order-items"].bulk.$post({
        json: {
          items: cartList.map(c => ({
            orderId,
            menuItemId: c.menuItemId,
            name: c.variationName ? `${c.name} (${c.variationName})` : c.name,
            price: c.price,
            qty: c.qty,
          })),
        },
      });
      return orderId;
    },
    onSuccess: () => {
      refetchHold();
      Alert.alert("On Hold", "Order saved.", [
        { text: "OK", onPress: () => { setCart({}); setCustomerName(""); } },
      ]);
    },
    onError: (e: any) => Alert.alert("Error", e?.message ?? "Failed"),
  });

  // ── Load held order into cart ────────────────────────────────────
  function loadHeldOrder(order: any) {
    const items: any[] = order.items ?? [];
    const newCart: Record<string, CartItem> = {};
    for (const it of items) {
      const key = `${it.menuItemId}_base`;
      newCart[key] = {
        menuItemId: it.menuItemId,
        name: it.name,
        price: Number(it.price),
        qty: it.qty,
        notes: it.notes ?? "",
      };
    }
    setCart(newCart);
    setCustomerName(order.customerName ?? "");
    setShowHoldList(false);
    // delete hold order
    api.orders[":id"].$patch({ param: { id: String(order.id) }, json: { status: "cancelled" } }).catch(() => {});
  }

  const busy = placeOrder.isPending || holdOrder.isPending;

  return (
    <SafeAreaView style={s.safe} edges={["left", "right", "bottom"]}>
      <StatusBar barStyle="light-content" backgroundColor={C.navy3} />

      {/* ── Header (absorbs top safe area) ── */}
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.headerIconBtn}>
          <Ionicons name="arrow-back" size={19} color={C.white} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push("/tables" as any)} style={s.headerIconBtn}>
          <Ionicons name="home" size={18} color={C.white} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Table {tableName}</Text>
          <Text style={s.headerSub}>{user?.name ?? "Waiter"}  ·  {time}</Text>
        </View>
        <TouchableOpacity onPress={() => router.push("/printer-settings" as any)} style={s.headerIconBtn}>
          <Ionicons name="print-outline" size={18} color={C.white} />
        </TouchableOpacity>
        {/* Cart badge */}
        <TouchableOpacity style={s.cartBadgeBtn} onPress={() => setShowCart(v => !v)}>
          <Ionicons name="cart-outline" size={22} color={C.white} />
          {totalQty > 0 && (
            <View style={s.cartBadge}><Text style={s.cartBadgeTxt}>{totalQty}</Text></View>
          )}
        </TouchableOpacity>
      </View>

      {/* ── Customer name — always visible ── */}
      <View style={s.customerBar}>
        <Ionicons name="person-outline" size={15} color={C.accent} />
        <TextInput
          style={s.customerBarInput}
          placeholder="Search or add customer"
          placeholderTextColor={C.muted}
          value={customerName}
          onChangeText={setCustomerName}
          returnKeyType="done"
        />
        {customerName !== "" && (
          <TouchableOpacity onPress={() => setCustomerName("")} hitSlop={8}>
            <Ionicons name="close-circle" size={15} color={C.muted} />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={s.addCustomerBtn}
          onPress={() => setShowNewCustomer(true)}
          hitSlop={6}
        >
          <Ionicons name="add" size={18} color={C.white} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" stickyHeaderIndices={[1]}>

          {/* ── Order Panel ── */}
          {showCart && (
            <View style={s.orderPanel}>
              {/* Table row */}
              <View style={s.panelHeader}>
                <View style={s.panelTitleRow}>
                  <Ionicons name="receipt-outline" size={16} color={C.accent} />
                  <Text style={s.panelTitle}>Order Summary</Text>
                  <View style={s.tablePill}>
                    <Ionicons name="grid-outline" size={12} color={C.accent} />
                    <Text style={s.tablePillTxt}>Table {tableName}</Text>
                  </View>
                </View>
              </View>

              {/* Cart items */}
              {cartList.length === 0 ? (
                <View style={s.emptyCart}>
                  <Ionicons name="fast-food-outline" size={28} color={C.muted} />
                  <Text style={s.emptyCartTxt}>No items added yet</Text>
                </View>
              ) : (
                <View style={s.cartList}>
                  <View style={s.cartHeader}>
                    <Text style={[s.cartHd, { flex: 4 }]}>Item</Text>
                    <Text style={[s.cartHd, { flex: 2, textAlign: "center" }]}>Qty</Text>
                    <Text style={[s.cartHd, { flex: 2, textAlign: "right" }]}>Price</Text>
                  </View>
                  {cartList.map(item => (
                    <View key={cartKey(item.menuItemId, item.variationId)} style={s.cartRow}>
                      <View style={{ flex: 4 }}>
                        <Text style={s.cartItemName} numberOfLines={1}>{item.name}</Text>
                        {item.variationName && <Text style={s.cartItemVar}>{item.variationName}</Text>}
                      </View>
                      <View style={[s.cartQtyRow, { flex: 2 }]}>
                        <TouchableOpacity style={s.cartQtyBtn} onPress={() => removeItem(cartKey(item.menuItemId, item.variationId))}>
                          <Text style={s.cartQtyBtnTxt}>−</Text>
                        </TouchableOpacity>
                        <Text style={s.cartQtyNum}>{item.qty}</Text>
                        <TouchableOpacity style={s.cartQtyBtn} onPress={() => addItem({ id: item.menuItemId, name: item.name, priceDineIn: item.price }, item.variationId, item.variationName, item.price)}>
                          <Text style={s.cartQtyBtnTxt}>+</Text>
                        </TouchableOpacity>
                      </View>
                      <Text style={[s.cartItemPrice, { flex: 2 }]}>
                        Rs. {(item.price * item.qty).toFixed(0)}
                      </Text>
                    </View>
                  ))}
                  <View style={s.totalRow}>
                    <Text style={s.totalLabel}>Total</Text>
                    <Text style={s.totalAmt}>Rs. {totalAmt.toFixed(2)}</Text>
                  </View>
                </View>
              )}

              {/* Action buttons */}
              <View style={s.actionBar}>
                <TouchableOpacity
                  style={[s.actionBtn, s.placeBtn, (busy || cartList.length === 0) && { opacity: 0.5 }]}
                  onPress={() => placeOrder.mutate()}
                  disabled={busy || cartList.length === 0}
                >
                  {placeOrder.isPending
                    ? <ActivityIndicator size="small" color={C.white} />
                    : <><Ionicons name="print-outline" size={15} color={C.white} /><Text style={s.placeBtnTxt}>Place Order</Text></>
                  }
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.actionBtn, s.holdBtn, busy && { opacity: 0.5 }]}
                  onPress={() => holdOrder.mutate()}
                  onLongPress={() => { refetchHold(); setShowHoldList(true); }}
                  disabled={busy}
                  delayLongPress={600}
                >
                  {holdOrder.isPending
                    ? <ActivityIndicator size="small" color={C.amber} />
                    : <><Ionicons name="pause-circle-outline" size={15} color={C.amber} /><Text style={s.holdBtnTxt}>Hold</Text></>
                  }
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.actionBtn, s.resetBtn, cartList.length === 0 && { opacity: 0.4 }]}
                  onPress={() => Alert.alert("Reset", "Clear all items?", [
                    { text: "Cancel", style: "cancel" },
                    { text: "Reset", style: "destructive", onPress: () => setCart({}) },
                  ])}
                  disabled={cartList.length === 0}
                >
                  <Ionicons name="trash-outline" size={15} color={C.red} />
                  <Text style={s.resetBtnTxt}>Clear</Text>
                </TouchableOpacity>
              </View>

              {/* Hold list hint */}
              <Text style={s.holdHint}>Long press "Hold" to see held orders</Text>
            </View>
          )}

          {/* ── Search ── */}
          <View style={s.searchWrap}>
            <View style={s.searchBar}>
              <Ionicons name="search-outline" size={16} color={C.muted} />
              <TextInput
                style={s.searchInput}
                placeholder="Search menu…"
                placeholderTextColor={C.muted}
                value={search}
                onChangeText={setSearch}
              />
              {search !== "" && (
                <TouchableOpacity onPress={() => setSearch("")}>
                  <Ionicons name="close-circle" size={16} color={C.muted} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* ── Category tabs ── */}
          <View style={s.catWrap}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 14, paddingVertical: 10 }}>
              <TouchableOpacity
                style={[s.catChip, selectedCat === null && s.catChipActive]}
                onPress={() => setSelectedCat(null)}
              >
                <Text style={[s.catChipTxt, selectedCat === null && s.catChipTxtActive]}>All</Text>
              </TouchableOpacity>
              {categories.filter(c => c.isActive !== false).map((cat: any) => (
                <TouchableOpacity
                  key={cat.id}
                  style={[s.catChip, selectedCat === cat.id && s.catChipActive]}
                  onPress={() => setSelectedCat(cat.id)}
                >
                  <Text style={[s.catChipTxt, selectedCat === cat.id && s.catChipTxtActive]}>{cat.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* ── Menu list ── */}
          {menuLoading ? (
            <View style={{ padding: 40, alignItems: "center" }}>
              <ActivityIndicator size="large" color={C.accent} />
            </View>
          ) : filteredItems.length === 0 ? (
            <View style={{ padding: 40, alignItems: "center", gap: 8 }}>
              <Ionicons name="search-outline" size={36} color={C.muted} />
              <Text style={{ color: C.muted }}>No items found</Text>
            </View>
          ) : (
            <View style={s.menuList}>
              {filteredItems.map((item: any) => {
                const variations: Variation[] = item.variations ?? [];
                const hasVar = variations.length > 0;
                const baseQty = getQty(item.id);
                const isInCart = baseQty > 0 || variations.some(v => getQty(item.id, v.id) > 0);

                return (
                  <View key={item.id} style={[s.menuListItem, isInCart && s.menuListItemActive]}>
                    {/* Left: image */}
                    <View style={s.menuListImgWrap}>
                      {item.imageUrl ? (
                        <Image source={{ uri: item.imageUrl }} style={s.menuListImg} />
                      ) : (
                        <View style={[s.menuListImg, s.menuImgPlaceholder]}>
                          <Ionicons name="fast-food-outline" size={20} color={C.muted} />
                        </View>
                      )}
                    </View>

                    {/* Center: name + price + variations */}
                    <View style={s.menuListInfo}>
                      <Text style={s.menuListName} numberOfLines={1}>{item.name}</Text>
                      {!hasVar && (
                        <Text style={s.menuListPrice}>
                          Rs. {Number(item.priceDineIn ?? item.price ?? 0).toFixed(0)}
                        </Text>
                      )}

                      {/* Variation chips — full width, equal size */}
                      {hasVar && (
                        <View style={s.varChipRow}>
                          {variations.map((v: Variation) => {
                            const qty = getQty(item.id, v.id);
                            return (
                              <View key={v.id} style={s.varChipGroup}>
                                <TouchableOpacity
                                  style={[s.varChip, qty > 0 && s.varChipActive]}
                                  onPress={() => addItem(item, v.id, v.name, v.priceDineIn)}
                                >
                                  <Text style={[s.varChipLabel, qty > 0 && s.varChipLabelActive]} numberOfLines={1}>
                                    {v.name}
                                  </Text>
                                  <Text style={[s.varChipPrice, qty > 0 && { color: C.white + "CC" }]}>
                                    Rs.{Number(v.priceDineIn).toFixed(0)}
                                  </Text>
                                </TouchableOpacity>
                                {qty > 0 && (
                                  <View style={s.varQtyRow}>
                                    <TouchableOpacity
                                      style={s.varQtyBtn}
                                      onPress={() => removeItem(cartKey(item.id, v.id))}
                                    >
                                      <Text style={s.varQtyBtnTxt}>−</Text>
                                    </TouchableOpacity>
                                    <Text style={s.varQtyNum}>{qty}</Text>
                                    <TouchableOpacity
                                      style={s.varQtyBtn}
                                      onPress={() => addItem(item, v.id, v.name, v.priceDineIn)}
                                    >
                                      <Text style={s.varQtyBtnTxt}>+</Text>
                                    </TouchableOpacity>
                                  </View>
                                )}
                              </View>
                            );
                          })}
                        </View>
                      )}
                    </View>

                    {/* Right: qty controls (no-variation items) */}
                    {!hasVar && (
                      <View style={s.menuListQty}>
                        <TouchableOpacity
                          style={[s.qtyBtn, baseQty === 0 && { opacity: 0.3 }]}
                          onPress={() => removeItem(cartKey(item.id))}
                          disabled={baseQty === 0}
                        >
                          <Ionicons name="remove" size={15} color={C.white} />
                        </TouchableOpacity>
                        <Text style={[s.qtyNum, baseQty > 0 && { color: C.accent }]}>
                          {baseQty}
                        </Text>
                        <TouchableOpacity style={s.qtyBtn} onPress={() => addItem(item)}>
                          <Ionicons name="add" size={15} color={C.white} />
                        </TouchableOpacity>
                      </View>
                    )}

                    {isInCart && <View style={s.activeDot} />}
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Bottom Nav ── */}
      <View style={[s.bottomNav, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
        <TouchableOpacity style={s.navItem} onPress={() => router.push("/history" as any)}>
          <Ionicons name="time-outline" size={21} color={C.muted} />
          <Text style={s.navLabel}>History</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.navItem} onPress={() => router.push("/notifications" as any)}>
          <Ionicons name="notifications-outline" size={21} color={C.muted} />
          <Text style={s.navLabel}>Alerts</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.navItem} onPress={() => router.push("/ready-items" as any)}>
          <Ionicons name="checkmark-circle-outline" size={21} color={C.muted} />
          <Text style={s.navLabel}>Ready</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.navItem} onPress={() => router.push("/tables" as any)}>
          <Ionicons name="grid-outline" size={21} color={C.muted} />
          <Text style={s.navLabel}>Tables</Text>
        </TouchableOpacity>
      </View>

      {/* ── Hold List Modal ── */}
      <Modal visible={showHoldList} transparent animationType="slide" onRequestClose={() => setShowHoldList(false)}>
        <View style={m.overlay}>
          <View style={m.sheet}>
            <View style={m.sheetHeader}>
              <Text style={m.sheetTitle}>Held Orders — Table {tableName}</Text>
              <TouchableOpacity onPress={() => setShowHoldList(false)}>
                <Ionicons name="close" size={22} color={C.muted} />
              </TouchableOpacity>
            </View>
            {holdOrders.length === 0 ? (
              <View style={{ padding: 30, alignItems: "center", gap: 8 }}>
                <Ionicons name="pause-circle-outline" size={36} color={C.muted} />
                <Text style={{ color: C.muted }}>No held orders for this table</Text>
              </View>
            ) : (
              <FlatList
                data={holdOrders}
                keyExtractor={o => String(o.id)}
                contentContainerStyle={{ paddingBottom: 20 }}
                renderItem={({ item: order }) => (
                  <TouchableOpacity style={m.holdItem} onPress={() => loadHeldOrder(order)}>
                    <View style={{ flex: 1 }}>
                      <Text style={m.holdOrderNum}>{order.orderNumber}</Text>
                      <Text style={m.holdCustomer}>{order.customerName}</Text>
                      <Text style={m.holdItems}>
                        {(order.items ?? []).length} item(s)
                      </Text>
                    </View>
                    <View style={m.loadBtn}>
                      <Text style={m.loadBtnTxt}>Load</Text>
                    </View>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* ── New Customer Modal ── */}
      <Modal visible={showNewCustomer} transparent animationType="fade" onRequestClose={() => setShowNewCustomer(false)}>
        <View style={m.centerOverlay}>
          <View style={m.centerCard}>
            <View style={m.sheetHeader}>
              <Text style={m.sheetTitle}>Add Customer</Text>
              <TouchableOpacity onPress={() => setShowNewCustomer(false)}>
                <Ionicons name="close" size={22} color={C.muted} />
              </TouchableOpacity>
            </View>
            <View style={{ padding: 18, gap: 12 }}>
              {/* Name */}
              <View style={s.newCustInputWrap}>
                <Ionicons name="person-outline" size={16} color={C.accent} />
                <TextInput
                  style={s.newCustInput}
                  placeholder="Name (optional)"
                  placeholderTextColor={C.muted}
                  value={newCustomerName}
                  onChangeText={setNewCustomerName}
                  autoFocus
                  returnKeyType="next"
                />
              </View>
              {/* Phone */}
              <View style={s.newCustInputWrap}>
                <Ionicons name="call-outline" size={16} color={C.accent} />
                <TextInput
                  style={s.newCustInput}
                  placeholder="Phone (optional)"
                  placeholderTextColor={C.muted}
                  value={newCustomerPhone}
                  onChangeText={setNewCustomerPhone}
                  keyboardType="phone-pad"
                  returnKeyType="next"
                />
              </View>
              {/* Location */}
              <View style={s.newCustInputWrap}>
                <Ionicons name="location-outline" size={16} color={C.accent} />
                <TextInput
                  style={s.newCustInput}
                  placeholder="Location (optional)"
                  placeholderTextColor={C.muted}
                  value={newCustomerLocation}
                  onChangeText={setNewCustomerLocation}
                  returnKeyType="done"
                />
              </View>
              <TouchableOpacity
                style={[s.actionBtn, s.placeBtn, { justifyContent: "center", marginTop: 4 }]}
                onPress={() => {
                  const parts = [newCustomerName.trim(), newCustomerPhone.trim(), newCustomerLocation.trim()].filter(Boolean);
                  const label = newCustomerName.trim() || newCustomerPhone.trim() || newCustomerLocation.trim() || "";
                  if (label) setCustomerName(label);
                  setNewCustomerName("");
                  setNewCustomerPhone("");
                  setNewCustomerLocation("");
                  setShowNewCustomer(false);
                }}
              >
                <Ionicons name="checkmark" size={16} color={C.white} />
                <Text style={s.placeBtnTxt}>Save Customer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.card },

  // Header
  header: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: C.navy, paddingHorizontal: 12, paddingVertical: 12, gap: 6,
  },
  headerIconBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: C.white + "18", alignItems: "center", justifyContent: "center",
  },
  headerTitle: { color: C.white, fontSize: 17, fontWeight: "800" },
  headerSub: { color: C.muted, fontSize: 12, marginTop: 1 },
  cartBadgeBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  cartBadge: {
    position: "absolute", top: 2, right: 2,
    minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: C.red, alignItems: "center", justifyContent: "center", paddingHorizontal: 3,
  },
  cartBadgeTxt: { color: C.white, fontSize: 10, fontWeight: "800" },

  // Customer bar (always visible) — compact
  customerBar: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: C.white, marginHorizontal: 12, marginTop: 8, marginBottom: 4,
    borderRadius: 10, borderWidth: 1, borderColor: C.border,
    paddingLeft: 12, paddingRight: 4, paddingVertical: 6, minHeight: 44,
  },
  customerBarInput: { flex: 1, fontSize: 13, color: C.navy, fontWeight: "600", paddingVertical: 2 },
  addCustomerBtn: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: C.accent, alignItems: "center", justifyContent: "center",
  },
  newCustInputWrap: {
    flexDirection: "row", alignItems: "center", gap: 8,
    borderWidth: 1, borderColor: C.border, borderRadius: 10,
    paddingHorizontal: 12, height: 46, backgroundColor: C.card,
  },
  newCustInput: { flex: 1, fontSize: 14, color: C.navy, fontWeight: "600" },

  // Order panel
  orderPanel: {
    backgroundColor: C.white, margin: 12, borderRadius: 16,
    shadowColor: C.navy, shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    elevation: 3,
    borderWidth: 2, borderColor: C.accent,
  },
  panelHeader: { padding: 14, gap: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  panelTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  panelTitle: { flex: 1, color: C.navy, fontSize: 15, fontWeight: "700" },
  tablePill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: C.light, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3,
  },
  tablePillTxt: { color: C.accent, fontSize: 11, fontWeight: "700" },
  customerRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    borderWidth: 1, borderColor: C.border, borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 4, backgroundColor: C.card,
  },
  customerInput: { flex: 1, fontSize: 13, color: C.navy, paddingVertical: 6 },

  emptyCart: { alignItems: "center", paddingVertical: 20, gap: 6 },
  emptyCartTxt: { color: C.muted, fontSize: 13 },

  cartList: { paddingHorizontal: 14, paddingBottom: 4 },
  cartHeader: { flexDirection: "row", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  cartHd: { color: C.muted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  cartRow: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border + "88",
  },
  cartItemName: { color: C.navy, fontSize: 13, fontWeight: "600" },
  cartItemVar: { color: C.muted, fontSize: 11, marginTop: 1 },
  cartQtyRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  cartQtyBtn: { width: 24, height: 24, borderRadius: 12, backgroundColor: C.light, alignItems: "center", justifyContent: "center" },
  cartQtyBtnTxt: { color: C.navy, fontSize: 16, fontWeight: "700", lineHeight: 20 },
  cartQtyNum: { color: C.accent, fontSize: 14, fontWeight: "800", minWidth: 18, textAlign: "center" },
  cartItemPrice: { color: C.navy, fontSize: 13, fontWeight: "700", textAlign: "right" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 10, paddingTop: 12 },
  totalLabel: { color: C.muted, fontSize: 13, fontWeight: "700" },
  totalAmt: { color: C.navy, fontSize: 16, fontWeight: "800" },

  // Action bar
  actionBar: {
    flexDirection: "row", gap: 8,
    padding: 12, backgroundColor: C.card,
    borderTopWidth: 1, borderTopColor: C.border,
  },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14 },
  placeBtn: { flex: 1, backgroundColor: C.navy, justifyContent: "center" },
  placeBtnTxt: { color: C.white, fontSize: 14, fontWeight: "700" },
  holdBtn: { borderWidth: 1.5, borderColor: C.amber, paddingHorizontal: 16 },
  holdBtnTxt: { color: C.amber, fontSize: 13, fontWeight: "700" },
  resetBtn: { borderWidth: 1.5, borderColor: C.red + "55" },
  resetBtnTxt: { color: C.red, fontSize: 13, fontWeight: "600" },
  holdHint: { color: C.muted, fontSize: 10, textAlign: "center", paddingBottom: 8 },

  // Search
  searchWrap: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4, backgroundColor: C.white },
  searchBar: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border,
    paddingHorizontal: 12, height: 40,
  },
  searchInput: { flex: 1, fontSize: 13, color: C.navy },

  // Categories
  catWrap: { backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.border },
  catChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.card },
  catChipActive: { backgroundColor: C.navy, borderColor: C.navy },
  catChipTxt: { color: C.muted, fontSize: 12, fontWeight: "600" },
  catChipTxtActive: { color: C.white },

  // Menu list
  menuList: { paddingHorizontal: 10, paddingTop: 8, paddingBottom: 120, gap: 8 },
  menuListItem: {
    flexDirection: "row", alignItems: "flex-start",
    backgroundColor: C.white, borderRadius: 14, padding: 12, gap: 12,
    shadowColor: C.navy, shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    elevation: 2, position: "relative",
  },
  menuListItemActive: {
    borderWidth: 1.5, borderColor: C.accent + "55",
    backgroundColor: "#F0F4FF",
  },
  menuListImgWrap: { alignItems: "center", justifyContent: "flex-start", paddingTop: 2 },
  menuListImg: { width: 50, height: 50, borderRadius: 10 },
  menuImgPlaceholder: { backgroundColor: C.light, alignItems: "center", justifyContent: "center" },
  menuListInfo: { flex: 1, gap: 6 },
  menuListName: { color: C.navy, fontSize: 14, fontWeight: "700" },
  menuListPrice: { color: C.muted, fontSize: 12, fontWeight: "600" },

  // Variation chips
  varChipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  varChipGroup: { alignItems: "center", gap: 4 },
  varChip: {
    minWidth: 72, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10,
    backgroundColor: C.light, borderWidth: 1.5, borderColor: C.border,
    alignItems: "center",
  },
  varChipActive: { backgroundColor: C.accent, borderColor: C.accent },
  varChipLabel: { color: C.navy, fontSize: 12, fontWeight: "700" },
  varChipPrice: { color: C.muted, fontSize: 10, fontWeight: "600", marginTop: 1 },
  varChipLabelActive: { color: C.white },
  varQtyRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  varQtyBtn: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: C.navy, alignItems: "center", justifyContent: "center",
  },
  varQtyBtnTxt: { color: C.white, fontSize: 15, fontWeight: "800", lineHeight: 20 },
  varQtyNum: { color: C.accent, fontSize: 13, fontWeight: "800", minWidth: 18, textAlign: "center" },

  menuListQty: { flexDirection: "row", alignItems: "center", gap: 6, paddingTop: 4 },
  qtyBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: C.navy, alignItems: "center", justifyContent: "center" },
  qtyNum: { width: 22, textAlign: "center", fontSize: 14, fontWeight: "800", color: C.muted },

  activeDot: {
    position: "absolute", top: 10, right: 10,
    width: 8, height: 8, borderRadius: 4, backgroundColor: C.green,
  },

  // Bottom nav
  bottomNav: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    flexDirection: "row",
    backgroundColor: C.navBg,
    paddingTop: 10,
    borderTopWidth: 1, borderTopColor: "#1E2D8A",
  },
  navItem: { flex: 1, alignItems: "center", gap: 3 },
  navLabel: { color: C.muted, fontSize: 10, fontWeight: "600" },
});

// ── Hold list modal styles ───────────────────────────────────────
const m = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "#00000066", justifyContent: "flex-end" },
  centerOverlay: { flex: 1, backgroundColor: "#00000066", justifyContent: "center", paddingHorizontal: 24 },
  centerCard: { backgroundColor: C.white, borderRadius: 18 },
  sheet: {
    backgroundColor: C.white, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: "60%", paddingBottom: 30,
  },
  sheetHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: 18, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  sheetTitle: { color: C.navy, fontSize: 16, fontWeight: "800" },
  holdItem: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 14, paddingHorizontal: 18,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  holdOrderNum: { color: C.navy, fontSize: 14, fontWeight: "800" },
  holdCustomer: { color: C.muted, fontSize: 12, marginTop: 2 },
  holdItems: { color: C.accent, fontSize: 11, marginTop: 2 },
  loadBtn: {
    backgroundColor: C.navy, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10,
  },
  loadBtnTxt: { color: C.white, fontSize: 13, fontWeight: "700" },
});
