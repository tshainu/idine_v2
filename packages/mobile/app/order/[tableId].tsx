import { useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal,
  FlatList, Alert, KeyboardAvoidingView, Platform, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Colors, Fonts, Radius, Shadow, Space } from "../../constants/theme";
import {
  ScreenHeader, Loading, EmptyState, ErrorBanner, PrimaryButton, QtyStepper, Pill,
} from "../../components/ui";
import { useSession } from "../../hooks/use-session";
import { useTables } from "../../queries/tables";
import { useCategories, useMenuItems, useModifiers, imageUri } from "../../queries/menu";
import { useCustomerSearch } from "../../queries/customers";
import { useOpenOrderForTable, useSendToKitchen, useUpdateRunningOrder } from "../../queries/orders";
import { useReprintKot, useSendKot } from "../../queries/print";
import { lkr, elapsed } from "../../lib/format";
import { http } from "../../lib/http";
import type { CartLine, Customer, MenuItem, Modifier, Order, OrderItem, Variation } from "../../lib/types";

const c = Colors.light;

/** Dine-in price wins when set, else the base price. */
function priceOf(item: MenuItem, variation: Variation | null): number {
  if (variation) return variation.priceDineIn || item.priceDineIn || item.price;
  return item.priceDineIn || item.price;
}

function lineKey(itemId: number, variation: Variation | null, mods: Modifier[], note: string) {
  return [itemId, variation?.id ?? 0, mods.map((m) => m.id).sort().join("."), note.trim()].join("|");
}

export default function TakeOrderScreen() {
  const router = useRouter();
  const { tableId: rawId } = useLocalSearchParams<{ tableId: string }>();
  const tableId = Number(rawId);
  const { branchId, waiterId, waiterName } = useSession();

  const tables = useTables(branchId);
  const categories = useCategories(branchId);
  const menu = useMenuItems(branchId);
  const modifiers = useModifiers(branchId);
  // Not scoped to this waiter: a new round must append to whatever order is
  // running on the table, even one another waiter opened.
  const { order: openOrder, isLoading: orderLoading } = useOpenOrderForTable(branchId, tableId);
  const sendToKitchen = useSendToKitchen(branchId);
  const updateRunningOrder = useUpdateRunningOrder();
  const sendKot = useSendKot();
  const reprintKot = useReprintKot();

  const [cat, setCat] = useState<number | "all">("all");
  const [search, setSearch] = useState("");
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerOpen, setCustomerOpen] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [picking, setPicking] = useState<MenuItem | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [sending, setSending] = useState(false);

  const table = (tables.data ?? []).find((t) => t.id === tableId);
  const customerSearch = useCustomerSearch(customerName, branchId);
  const customerMatches = customerId
    ? []
    : (customerSearch.data ?? []).slice(0, 6);

  useEffect(() => {
    setCustomerId(openOrder?.customerId ?? null);
    setCustomerName(openOrder?.customerName ?? "");
  }, [openOrder?.id, openOrder?.customerId, openOrder?.customerName]);

  useEffect(() => {
    if (!customerId || customerPhone) return;
    const match = (customerSearch.data ?? []).find((customer) => customer.id === customerId);
    if (match?.phone) setCustomerPhone(match.phone);
  }, [customerId, customerPhone, customerSearch.data]);

  const items = useMemo(() => {
    const term = search.trim().toLowerCase();
    const categoryNames = new Map(
      (categories.data ?? []).map((category) => [category.id, category.name.toLowerCase()]),
    );
    return (menu.data ?? [])
      .filter((item) => (cat === "all" ? true : item.categoryId === cat))
      .filter((item) => {
        if (!term) return true;
        const categoryMatch = categoryNames.get(item.categoryId ?? -1)?.includes(term) ?? false;
        return categoryMatch || item.name.toLowerCase().includes(term) || (item.code ?? "").toLowerCase().includes(term);
      });
  }, [menu.data, categories.data, cat, search]);

  const groupedSearch = useMemo(() => {
    if (!search.trim() || cat !== "all") return [];
    const byCategory = new Map<number | null, MenuItem[]>();
    for (const item of items) {
      const key = item.categoryId ?? null;
      if (!byCategory.has(key)) byCategory.set(key, []);
      byCategory.get(key)!.push(item);
    }
    return [...byCategory.entries()].map(([categoryId, categoryItems]) => ({
      categoryId,
      name: categories.data?.find((category) => category.id === categoryId)?.name ?? "Other dishes",
      items: categoryItems,
    }));
  }, [categories.data, items, search, cat]);

  const cartTotal = cart.reduce(
    (s, l) => s + (l.unitPrice + l.modifiers.reduce((m, x) => m + x.price, 0)) * l.qty,
    0,
  );
  const cartCount = cart.reduce((s, l) => s + l.qty, 0);

  function addLine(item: MenuItem, variation: Variation | null, mods: Modifier[], note: string, qty: number) {
    const key = lineKey(item.id, variation, mods, note);
    setCart((prev) => {
      const at = prev.findIndex((l) => l.key === key);
      if (at >= 0) {
        const next = [...prev];
        next[at] = { ...next[at], qty: next[at].qty + qty };
        return next;
      }
      return [
        ...prev,
        {
          key,
          menuItemId: item.id,
          name: variation ? `${item.name} (${variation.name})` : item.name,
          unitPrice: priceOf(item, variation),
          qty,
          printerId: item.printerId,
          variationName: variation?.name ?? null,
          modifiers: mods.map((m) => ({ id: m.id, name: m.name, price: m.price })),
          note,
          course: item.isBeverage ? "drinks" : "main",
        },
      ];
    });
  }

  function quickAdd(item: MenuItem) {
    // Items with choices always open the sheet; simple items go straight in.
    const hasVariations = (item.variations?.length ?? 0) > 0;
    if (hasVariations) {
      setPicking(item);
      return;
    }
    addLine(item, null, [], "", 1);
  }

  function setQty(key: string, qty: number) {
    setCart((prev) =>
      qty <= 0 ? prev.filter((l) => l.key !== key) : prev.map((l) => (l.key === key ? { ...l, qty } : l)),
    );
  }

  function selectCustomer(customer: Customer) {
    setCustomerId(customer.id);
    setCustomerName(customer.name);
    setCustomerPhone(customer.phone ?? "");
    setCustomerOpen(false);
  }

  async function beginEdit() {
    if (!openOrder || loadingEdit) return;
    setLoadingEdit(true);
    try {
      const fresh = await http.get<{ order: Order; items: OrderItem[] }>(`/orders/${openOrder.id}`);
      const snapshot: Order = { ...fresh.order, items: fresh.items ?? [] };
      setEditingOrder(snapshot);
      setCustomerId(snapshot.customerId ?? null);
      setCustomerName(snapshot.customerName ?? "");
      setCart(
        (snapshot.items ?? []).map((item) => ({
          key: `existing|${item.id}`,
          orderItemId: item.id,
          menuItemId: item.menuItemId ?? 0,
          name: item.name,
          unitPrice: item.price,
          qty: item.qty,
          printerId: item.printerId,
          variationName: null,
          modifiers: [],
          note: item.note ?? "",
          course: "main",
        })),
      );
      setEditMode(true);
      setCartOpen(true);
    } catch (error) {
      Alert.alert("Could not load order", (error as Error)?.message ?? "Please try again.");
    } finally {
      setLoadingEdit(false);
    }
  }

  async function submit() {
    if (!cart.length && !editMode) return;
    setSending(true);
    try {
      const targetOrder = editingOrder ?? openOrder;
      if (editMode && targetOrder) {
        const existingIds = new Set((targetOrder.items ?? []).map((item) => item.id));
        const updates = cart
          .filter((line) => line.orderItemId && existingIds.has(line.orderItemId))
          .map((line) => ({ id: line.orderItemId!, qty: line.qty, note: line.note || null }));
        const keepIds = new Set(updates.map((line) => line.id));
        const removeIds = [...existingIds].filter((id) => !keepIds.has(id));
        const additions = cart.filter((line) => !line.orderItemId);
        const res = await updateRunningOrder.mutateAsync({
          orderId: targetOrder.id,
          customerId,
          customerName,
          updates,
          removeIds,
          additions,
        });
        const print = updates.length || removeIds.length || additions.length
          ? await reprintKot.mutateAsync({
              order: res.order,
              items: res.items,
              branchId: branchId ?? null,
              tableName: table?.name ?? null,
              waiterName,
              customerPhone: customerPhone || null,
            })
          : { ok: true, message: "Order details updated." };
        setCart([]);
        setEditMode(false);
        setEditingOrder(null);
        setCartOpen(false);
        Alert.alert(
          `Updated · ${res.order.orderNumber}`,
          print.ok ? print.message : `Order saved, but updated KOT failed: ${print.message}`,
          [{ text: "OK", onPress: () => router.back() }],
        );
        return;
      }

      const res = await sendToKitchen.mutateAsync({
        existingOrderId: openOrder?.id,
        tableId,
        tableName: table?.name ?? null,
        lines: cart,
        waiterId: waiterId ?? null,
        waiterName,
        customerId,
        customerName: customerName.trim() || null,
      });

      const print = await sendKot.mutateAsync({
        order: res.order,
        items: res.items,
        branchId: branchId ?? null,
        tableName: table?.name ?? null,
        waiterName,
        customerPhone: customerPhone || null,
      });

      setCart([]);
      setCartOpen(false);
      Alert.alert(
        `Sent · ${res.order.orderNumber}`,
        print.ok ? print.message : `Order saved, but printing failed: ${print.message}`,
        [{ text: "OK", onPress: () => router.back() }],
      );
    } catch (e) {
      Alert.alert(editMode ? "Could not update order" : "Could not send order", (e as Error)?.message ?? "Please try again.");
    } finally {
      setSending(false);
    }
  }

  if (menu.isLoading || tables.isLoading || orderLoading) {
    return (
      <SafeAreaView style={s.safe} edges={["top", "left", "right"]}>
        <Loading label="Loading menu…" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={["top", "left", "right"]}>
      <ScreenHeader
        title={table?.name ?? `Table ${tableId}`}
        subtitle={
          openOrder
            ? `${openOrder.orderNumber} · ${openOrder.items?.length ?? 0} sent · ${elapsed(openOrder.createdAt)}`
            : "New order"
        }
        onBack={() => router.back()}
        right={
          <View style={s.headerActions}>
            {openOrder ? (
              <TouchableOpacity onPress={beginEdit} style={s.editOrderButton} activeOpacity={0.8}>
                <Ionicons name="create-outline" size={17} color={c.primary} />
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              onPress={() => setCartOpen(true)}
              style={[s.headerCart, cartCount > 0 && s.headerCartActive]}
              activeOpacity={0.8}
            >
              <View style={s.headerCartIcon}>
                <Ionicons name="cart-outline" size={18} color={cartCount > 0 ? c.chrome : c.onChrome} />
                {cartCount > 0 ? <Text style={s.headerCartBadge}>{cartCount}</Text> : null}
              </View>
              <View>
                <Text style={[s.headerCartLabel, cartCount > 0 && { color: c.chrome }]}>Cart</Text>
                <Text style={[s.headerCartTotal, cartCount > 0 && { color: c.chrome }]}>{lkr(cartTotal)}</Text>
              </View>
            </TouchableOpacity>
          </View>
        }
      />

      {menu.error ? (
        <ErrorBanner message={(menu.error as Error).message} onRetry={() => menu.refetch()} />
      ) : null}

      {/* Search */}
      <View style={s.searchWrap}>
        <Ionicons name="search" size={18} color={c.primaryDark} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search dish, category or code…"
          placeholderTextColor={c.mutedSoft}
          style={s.searchInput}
          returnKeyType="search"
        />
        {search ? (
          <Ionicons name="close-circle" size={18} color={c.mutedSoft} onPress={() => setSearch("")} suppressHighlighting />
        ) : null}
      </View>

      {/* Live customer lookup; the selected ID, name, and phone travel with the order/KOT. */}
      <View style={s.customerLookup}>
        <View style={s.customerField}>
          <Ionicons name="person-outline" size={17} color={c.primaryDark} />
          <TextInput
            value={customerName}
            onChangeText={(value) => {
              setCustomerId(null);
              setCustomerPhone("");
              setCustomerName(value);
              setCustomerOpen(true);
            }}
            onFocus={() => setCustomerOpen(true)}
            placeholder="Search customer name or phone…"
            placeholderTextColor={c.mutedSoft}
            style={s.customerInput}
            autoCapitalize="words"
            returnKeyType="done"
          />
          {customerSearch.isFetching && customerName.trim() ? (
            <ActivityIndicator size="small" color={c.primary} />
          ) : customerId ? (
            <Ionicons name="checkmark-circle" size={18} color={c.success} />
          ) : null}
        </View>
        {customerOpen && !customerId && customerName.trim() ? (
          <View style={s.customerDropdown}>
            {customerMatches.length ? customerMatches.map((customer) => (
              <TouchableOpacity
                key={customer.id}
                style={s.customerResult}
                activeOpacity={0.75}
                onPress={() => selectCustomer(customer)}
              >
                <View style={s.customerAvatar}>
                  <Text style={s.customerAvatarText}>{customer.name.slice(0, 1).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.customerResultName}>{customer.name}</Text>
                  <Text style={s.customerResultPhone}>{customer.phone || "No phone number"}</Text>
                </View>
                <Ionicons name="add-circle-outline" size={20} color={c.primary} />
              </TouchableOpacity>
            )) : !customerSearch.isFetching ? (
              <Text style={s.customerNoResult}>No saved customer found. The typed name can still be used.</Text>
            ) : null}
          </View>
        ) : null}
        {customerId ? (
          <View style={s.selectedCustomer}>
            <Text style={s.selectedCustomerText}>{customerName}{customerPhone ? ` · ${customerPhone}` : ""}</Text>
            <Ionicons
              name="close-circle"
              size={18}
              color={c.mutedSoft}
              onPress={() => {
                setCustomerId(null);
                setCustomerName("");
                setCustomerPhone("");
              }}
              suppressHighlighting
            />
          </View>
        ) : null}
      </View>

      {/* Categories */}
      <ScrollView
        horizontal
        style={s.categoryScroller}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.cats}
      >
        <Chip label="All" active={cat === "all"} onPress={() => setCat("all")} />
        {(categories.data ?? []).map((category) => (
          <Chip
            key={category.id}
            label={category.name}
            active={cat === category.id}
            onPress={() => setCat(category.id)}
          />
        ))}
      </ScrollView>

      {/* A stable one-column section list prevents Android from crashing while search changes. */}
      {items.length === 0 ? (
        <EmptyState icon="fast-food-outline" title="No dishes found" hint="Try another category or search term." />
      ) : (
        <FlatList
          data={search.trim() && cat === "all"
            ? groupedSearch
            : [{
                categoryId: cat === "all" ? null : cat,
                name: cat === "all"
                  ? "All dishes"
                  : (categories.data ?? []).find((category) => category.id === cat)?.name ?? "Dishes",
                items,
              }]}
          keyExtractor={(section) => `section-${section.categoryId ?? "all"}-${section.name}`}
          contentContainerStyle={s.groupedGrid}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          renderItem={({ item: section }) => (
            <View>
              {search.trim() ? (
                <View style={s.searchCategoryHeader}>
                  <View style={s.searchCategoryAccent} />
                  <Text style={s.searchCategoryTitle}>{section.name}</Text>
                  <Text style={s.searchCategoryCount}>{section.items.length} match{section.items.length === 1 ? "" : "es"}</Text>
                </View>
              ) : null}
              <View style={s.menuGrid}>
                {section.items.map((item) => (
                  <DishTile key={item.id} item={item} cart={cart} onPress={quickAdd} />
                ))}
              </View>
            </View>
          )}
        />
      )}

      {/* Item options sheet */}
      <ItemSheet
        item={picking}
        modifiers={modifiers.data ?? []}
        onClose={() => setPicking(null)}
        onAdd={(variation, mods, note, qty) => {
          if (picking) addLine(picking, variation, mods, note, qty);
          setPicking(null);
        }}
      />

      {/* Cart opens as a contained screen modal from the title-bar action. */}
      <Modal visible={cartOpen} animationType="slide" transparent onRequestClose={() => setCartOpen(false)}>
        <View style={s.cartModal}>
          <TouchableOpacity style={s.cartBackdrop} activeOpacity={1} onPress={() => setCartOpen(false)} />
          <View style={s.cartSheet}>
            <View style={s.sheetHead}>
              <View>
                <Text style={s.sheetTitle}>Cart · {table?.name ?? ""}</Text>
                <Text style={s.cartDrawerSub}>{cartCount} item{cartCount === 1 ? "" : "s"} · {lkr(cartTotal)}</Text>
              </View>
              <TouchableOpacity onPress={() => setCartOpen(false)} style={s.cartClose} activeOpacity={0.7}>
                <Ionicons name="chevron-up" size={22} color={c.muted} />
              </TouchableOpacity>
            </View>

            <ScrollView style={s.cartScroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {cart.length === 0 ? (
                <View style={s.emptyCart}>
                  <Ionicons name="cart-outline" size={28} color={c.mutedSoft} />
                  <Text style={s.emptyCartText}>No dishes selected yet.</Text>
                </View>
              ) : cart.map((line) => (
                <View key={line.key} style={s.cartLine}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.cartLineName}>{line.name}</Text>
                    {line.modifiers.length ? (
                      <Text style={s.cartLineMeta}>{line.modifiers.map((modifier) => modifier.name).join(", ")}</Text>
                    ) : null}
                    {line.note ? <Text style={s.cartLineNote}>“{line.note}”</Text> : null}
                    <Text style={s.cartLinePrice}>
                      {lkr(line.unitPrice + line.modifiers.reduce((sum, modifier) => sum + modifier.price, 0))} each
                    </Text>
                  </View>
                  <QtyStepper qty={line.qty} onChange={(quantity) => setQty(line.key, quantity)} compact />
                </View>
              ))}
            </ScrollView>

            <View style={s.sheetFoot}>
              <View style={s.totalRow}>
                <Text style={s.totalLabel}>Total</Text>
                <Text style={s.totalValue}>{lkr(cartTotal)}</Text>
              </View>
              {openOrder ? (
                <Text style={s.appendNote}>
                  {editMode ? `Editing ${openOrder.orderNumber}.` : `Adds to the open bill ${openOrder.orderNumber}.`}
                </Text>
              ) : null}
              <PrimaryButton
                label={sending ? (editMode ? "Updating…" : "Sending…") : editMode ? "Save changes & update KOT" : "Send to kitchen & print KOT"}
                icon={editMode ? "create-outline" : "print-outline"}
                loading={sending}
                disabled={!cart.length && !editMode}
                onPress={submit}
              />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function DishTile({ item, cart, onPress }: {
  item: MenuItem;
  cart: CartLine[];
  onPress: (item: MenuItem) => void;
}) {
  const inCart = cart.filter((line) => line.menuItemId === item.id).reduce((n, line) => n + line.qty, 0);
  const uri = imageUri(item.imageUrl);
  return (
    <TouchableOpacity
      style={[s.tile, inCart > 0 && s.tileSelected]}
      activeOpacity={0.85}
      onPress={() => onPress(item)}
    >
      <View style={s.imgWrap}>
        {uri ? (
          <Image source={{ uri }} style={s.img} contentFit="cover" transition={120} />
        ) : (
          <View style={[s.img, s.imgFallback]}>
            <Ionicons name="fast-food-outline" size={26} color={c.mutedSoft} />
          </View>
        )}
        {inCart > 0 ? (
          <View style={s.tileBadge}>
            <Text style={s.tileBadgeText}>{inCart}</Text>
          </View>
        ) : null}
        {item.isVeg ? <View style={s.vegDot} /> : null}
      </View>
      <Text style={s.tileName} numberOfLines={2}>{item.name}</Text>
      <View style={s.tileFoot}>
        <Text style={s.tilePrice}>{lkr(priceOf(item, null))}</Text>
        {(item.variations?.length ?? 0) > 0 ? (
          <Ionicons name="options-outline" size={14} color={c.mutedSoft} />
        ) : (
          <Ionicons name="add-circle" size={20} color={c.primary} />
        )}
      </View>
    </TouchableOpacity>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[s.chip, active && { backgroundColor: c.chrome, borderColor: c.chrome }]}
    >
      <Text style={[s.chipText, active && { color: c.onChrome }]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

/** Variation + modifier + note + qty picker. */
function ItemSheet({ item, modifiers, onClose, onAdd }: {
  item: MenuItem | null;
  modifiers: Modifier[];
  onClose: () => void;
  onAdd: (variation: Variation | null, mods: Modifier[], note: string, qty: number) => void;
}) {
  const [variation, setVariation] = useState<Variation | null>(null);
  const [mods, setMods] = useState<number[]>([]);
  const [note, setNote] = useState("");
  const [qty, setQty] = useState(1);

  // Reset after a different dish opens; never update state during render.
  useEffect(() => {
    if (!item) return;
    setVariation(item.variations?.length ? item.variations[0] : null);
    setMods([]);
    setNote("");
    setQty(1);
  }, [item]);

  const groups = useMemo(() => {
    const by = new Map<string, Modifier[]>();
    for (const m of modifiers) {
      const g = m.groupName || "Extras";
      if (!by.has(g)) by.set(g, []);
      by.get(g)!.push(m);
    }
    return [...by.entries()];
  }, [modifiers]);

  if (!item) return null;

  const chosen = modifiers.filter((m) => mods.includes(m.id));
  const unit = priceOf(item, variation) + chosen.reduce((s, m) => s + m.price, 0);

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.modalBg}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={0}
        >
          <View style={s.sheet}>
            <View style={s.sheetHead}>
              <Text style={s.sheetTitle} numberOfLines={1}>{item.name}</Text>
              <Ionicons name="close" size={22} color={c.muted} onPress={onClose} suppressHighlighting />
            </View>

            <ScrollView style={{ maxHeight: 400 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {item.variations?.length ? (
                <>
                  <Text style={s.groupLabel}>Size / portion</Text>
                  <View style={s.optRow}>
                    {item.variations.map((v) => {
                      const on = variation?.id === v.id;
                      return (
                        <TouchableOpacity
                          key={v.id}
                          onPress={() => setVariation(v)}
                          activeOpacity={0.8}
                          style={[s.opt, on && { backgroundColor: c.primarySoft, borderColor: c.primary }]}
                        >
                          <Text style={[s.optText, on && { color: c.primaryDark }]}>{v.name}</Text>
                          <Text style={[s.optPrice, on && { color: c.primaryDark }]}>
                            {lkr(v.priceDineIn || item.price)}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              ) : null}

              {groups.map(([g, list]) => (
                <View key={g}>
                  <Text style={s.groupLabel}>{g}</Text>
                  <View style={s.optRow}>
                    {list.map((m) => {
                      const on = mods.includes(m.id);
                      return (
                        <TouchableOpacity
                          key={m.id}
                          activeOpacity={0.8}
                          onPress={() =>
                            setMods((prev) => (on ? prev.filter((x) => x !== m.id) : [...prev, m.id]))
                          }
                          style={[s.opt, on && { backgroundColor: c.primarySoft, borderColor: c.primary }]}
                        >
                          <Text style={[s.optText, on && { color: c.primaryDark }]}>{m.name}</Text>
                          {m.price ? (
                            <Text style={[s.optPrice, on && { color: c.primaryDark }]}>+{lkr(m.price)}</Text>
                          ) : null}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ))}

              <Text style={s.groupLabel}>Kitchen note</Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="e.g. no chilli, less salt"
                placeholderTextColor={c.mutedSoft}
                style={s.noteInput}
                multiline
              />
            </ScrollView>

            <View style={s.sheetFoot}>
              <View style={s.qtyRow}>
                <Text style={s.totalLabel}>Quantity</Text>
                <QtyStepper qty={qty} onChange={(n) => setQty(Math.max(1, n))} min={1} />
              </View>
              <PrimaryButton
                label={`Add · ${lkr(unit * qty)}`}
                icon="add"
                onPress={() => onAdd(variation, chosen, note, qty)}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.background },
  searchWrap: {
    flexDirection: "row", alignItems: "center", gap: Space.md,
    marginHorizontal: Space.lg, paddingHorizontal: Space.lg, height: 48,
    backgroundColor: c.card, borderRadius: Radius.md, borderWidth: 1.5, borderColor: c.primarySoft,
    ...Shadow.card,
  },
  searchInput: { flex: 1, fontFamily: Fonts.regular, fontSize: 14.5, color: c.foreground, height: "100%" },
  customerLookup: { marginHorizontal: Space.lg, marginTop: Space.sm, zIndex: 20 },
  customerField: {
    flexDirection: "row", alignItems: "center", gap: Space.sm,
    paddingHorizontal: Space.md, height: 44,
    backgroundColor: c.primarySoft, borderRadius: Radius.md, borderWidth: 1, borderColor: "#BDEBDD",
  },
  customerInput: { flex: 1, fontFamily: Fonts.medium, fontSize: 13.5, color: c.foreground, height: "100%" },
  customerDropdown: {
    marginTop: 4, backgroundColor: c.card, borderRadius: Radius.md,
    borderWidth: 1, borderColor: c.border, overflow: "hidden", ...Shadow.raised,
  },
  customerResult: {
    minHeight: 52, flexDirection: "row", alignItems: "center", gap: Space.sm,
    paddingHorizontal: Space.md, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: c.border,
  },
  customerAvatar: {
    width: 32, height: 32, borderRadius: Radius.pill, backgroundColor: c.primarySoft,
    alignItems: "center", justifyContent: "center",
  },
  customerAvatarText: { fontFamily: Fonts.bold, fontSize: 12, color: c.primaryDark },
  customerResultName: { fontFamily: Fonts.semibold, fontSize: 13, color: c.foreground },
  customerResultPhone: { fontFamily: Fonts.regular, fontSize: 11.5, color: c.muted, marginTop: 1 },
  customerNoResult: { fontFamily: Fonts.regular, fontSize: 12, color: c.muted, padding: Space.md },
  selectedCustomer: {
    flexDirection: "row", alignItems: "center", gap: Space.sm,
    marginTop: 4, paddingHorizontal: Space.md, paddingVertical: 6,
    backgroundColor: c.successSoft, borderRadius: Radius.sm,
  },
  selectedCustomerText: { flex: 1, fontFamily: Fonts.medium, fontSize: 11.5, color: c.success },
  categoryScroller: { flexGrow: 0, flexShrink: 0 },
  cats: { paddingHorizontal: Space.lg, gap: Space.sm, paddingVertical: Space.md, alignItems: "center" },
  chip: {
    paddingHorizontal: Space.lg, minHeight: 38, borderRadius: Radius.pill,
    backgroundColor: c.card, borderWidth: 1, borderColor: c.border,
    alignItems: "center", justifyContent: "center",
  },
  chipText: { fontFamily: Fonts.medium, fontSize: 12.5, color: c.muted },
  grid: { paddingHorizontal: Space.lg, paddingBottom: 72, gap: Space.sm },
  groupedGrid: { paddingHorizontal: Space.lg, paddingBottom: 72, gap: Space.lg },
  searchCategoryHeader: {
    flexDirection: "row", alignItems: "center", gap: Space.sm,
    backgroundColor: c.primarySoft, borderRadius: Radius.md, paddingHorizontal: Space.md,
    paddingVertical: Space.sm, marginBottom: Space.sm,
  },
  searchCategoryAccent: { width: 5, height: 26, borderRadius: Radius.pill, backgroundColor: c.primary },
  searchCategoryTitle: { flex: 1, fontFamily: Fonts.bold, fontSize: 15, color: c.primaryDark },
  searchCategoryCount: { fontFamily: Fonts.medium, fontSize: 11, color: c.primaryDark },
  menuGrid: { flexDirection: "row", flexWrap: "wrap", gap: Space.sm },
  tile: {
    width: "31.5%", backgroundColor: c.card, borderRadius: Radius.md, borderWidth: 1.5,
    borderColor: c.border, padding: 6, ...Shadow.card,
  },
  tileSelected: { borderColor: c.success, backgroundColor: c.successSoft },
  imgWrap: { position: "relative" },
  img: { width: "100%", height: 68, borderRadius: Radius.sm, backgroundColor: c.background },
  imgFallback: { alignItems: "center", justifyContent: "center" },
  tileBadge: {
    position: "absolute", top: 6, right: 6, minWidth: 22, height: 22,
    borderRadius: Radius.pill, backgroundColor: c.primary,
    alignItems: "center", justifyContent: "center", paddingHorizontal: 5, ...Shadow.raised,
  },
  tileBadgeText: { fontFamily: Fonts.bold, fontSize: 11, color: c.onPrimary },
  vegDot: {
    position: "absolute", top: 8, left: 8, width: 9, height: 9,
    borderRadius: 2, backgroundColor: c.success, borderWidth: 1, borderColor: "#fff",
  },
  tileName: {
    fontFamily: Fonts.medium, fontSize: 10.5, color: c.foreground,
    marginTop: 6, marginHorizontal: 2, minHeight: 30, lineHeight: 14,
  },
  tileFoot: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginHorizontal: 4, marginBottom: 4,
  },
  tilePrice: { fontFamily: Fonts.bold, fontSize: 10.5, color: c.foreground },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 6 },
  editOrderButton: {
    width: 36, height: 36, borderRadius: Radius.md,
    backgroundColor: c.chromeSoft, borderWidth: 1, borderColor: "#36516F",
    alignItems: "center", justifyContent: "center",
  },
  headerCart: {
    minWidth: 82, height: 40, flexDirection: "row", alignItems: "center", gap: 7,
    paddingHorizontal: 9, borderRadius: Radius.md, backgroundColor: c.chromeSoft,
    borderWidth: 1, borderColor: "#36516F",
  },
  headerCartActive: { backgroundColor: c.primary, borderColor: c.primary },
  headerCartIcon: { position: "relative" },
  headerCartBadge: {
    position: "absolute", top: -9, right: -10, minWidth: 16, height: 16,
    borderRadius: Radius.pill, paddingHorizontal: 3, textAlign: "center",
    overflow: "hidden", backgroundColor: c.success, color: "#FFFFFF",
    fontFamily: Fonts.bold, fontSize: 9, lineHeight: 16,
  },
  headerCartLabel: { fontFamily: Fonts.semibold, fontSize: 10, lineHeight: 12, color: c.onChrome },
  headerCartTotal: { fontFamily: Fonts.bold, fontSize: 10.5, lineHeight: 13, color: c.onChrome },
  cartModal: { flex: 1, justifyContent: "flex-start" },
  cartBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#06101DB3",
  },
  cartSheet: {
    backgroundColor: c.card, borderBottomLeftRadius: Radius.xl, borderBottomRightRadius: Radius.xl,
    paddingHorizontal: Space.lg, paddingTop: Space.xl, paddingBottom: Space.xl, maxHeight: "82%",
    shadowColor: c.chrome, shadowOpacity: 0.28, shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 }, elevation: 16,
  },
  cartDrawerSub: { fontFamily: Fonts.regular, fontSize: 12, color: c.muted, marginTop: 2 },
  cartClose: {
    width: 38, height: 38, borderRadius: Radius.pill,
    backgroundColor: c.background, alignItems: "center", justifyContent: "center",
  },
  cartScroll: { maxHeight: 380 },
  emptyCart: { alignItems: "center", paddingVertical: Space.xxl, gap: Space.sm },
  emptyCartText: { fontFamily: Fonts.regular, fontSize: 13, color: c.muted },
  modalBg: { flex: 1, backgroundColor: "#0B102066", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: c.card, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
    padding: Space.lg, paddingBottom: Space.xxl,
  },
  sheetHead: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginBottom: Space.lg, gap: Space.md,
  },
  sheetTitle: { flex: 1, fontFamily: Fonts.bold, fontSize: 17, color: c.foreground },
  groupLabel: {
    fontFamily: Fonts.semibold, fontSize: 11.5, color: c.mutedSoft,
    textTransform: "uppercase", letterSpacing: 0.5, marginTop: Space.lg, marginBottom: Space.sm,
  },
  optRow: { flexDirection: "row", flexWrap: "wrap", gap: Space.sm },
  opt: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: Space.md, paddingVertical: 9, borderRadius: Radius.md,
    backgroundColor: c.background, borderWidth: 1, borderColor: c.border,
  },
  optText: { fontFamily: Fonts.medium, fontSize: 13, color: c.foreground },
  optPrice: { fontFamily: Fonts.regular, fontSize: 11.5, color: c.muted },
  noteInput: {
    backgroundColor: c.background, borderRadius: Radius.md, borderWidth: 1,
    borderColor: c.border, padding: Space.md, minHeight: 62,
    fontFamily: Fonts.regular, fontSize: 14, color: c.foreground, textAlignVertical: "top",
  },
  sheetFoot: { borderTopWidth: 1, borderTopColor: c.border, paddingTop: Space.lg, marginTop: Space.lg },
  qtyRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginBottom: Space.lg,
  },
  totalRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginBottom: Space.md,
  },
  totalLabel: { fontFamily: Fonts.medium, fontSize: 14, color: c.muted },
  totalValue: { fontFamily: Fonts.bold, fontSize: 20, color: c.foreground },
  appendNote: {
    fontFamily: Fonts.regular, fontSize: 11.5, color: c.muted,
    marginBottom: Space.md, textAlign: "center",
  },
  cartLine: {
    flexDirection: "row", alignItems: "center", gap: Space.md,
    paddingVertical: Space.md, borderBottomWidth: 1, borderBottomColor: c.border,
  },
  cartLineName: { fontFamily: Fonts.medium, fontSize: 14, color: c.foreground },
  cartLineMeta: { fontFamily: Fonts.regular, fontSize: 11.5, color: c.muted, marginTop: 1 },
  cartLineNote: { fontFamily: Fonts.regular, fontSize: 11.5, color: c.warning, marginTop: 1, fontStyle: "italic" },
  cartLinePrice: { fontFamily: Fonts.regular, fontSize: 11.5, color: c.mutedSoft, marginTop: 2 },
});
