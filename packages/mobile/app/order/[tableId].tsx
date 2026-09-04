import { useMemo, useState } from "react";
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
import { useOpenOrderForTable, useSendToKitchen } from "../../queries/orders";
import { useSendKot } from "../../queries/print";
import { lkr, elapsed } from "../../lib/format";
import type { CartLine, MenuItem, Modifier, Variation } from "../../lib/types";

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
  const { order: openOrder, isLoading: orderLoading } = useOpenOrderForTable(branchId, tableId);
  const sendToKitchen = useSendToKitchen(branchId);
  const sendKot = useSendKot();

  const [cat, setCat] = useState<number | "all">("all");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [picking, setPicking] = useState<MenuItem | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const table = (tables.data ?? []).find((t) => t.id === tableId);

  const items = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (menu.data ?? [])
      .filter((i) => (cat === "all" ? true : i.categoryId === cat))
      .filter((i) =>
        term
          ? i.name.toLowerCase().includes(term) || (i.code ?? "").toLowerCase().includes(term)
          : true,
      );
  }, [menu.data, cat, search]);

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

  async function submit() {
    if (!cart.length) return;
    setSending(true);
    try {
      const res = await sendToKitchen.mutateAsync({
        existingOrderId: openOrder?.id,
        tableId,
        tableName: table?.name ?? null,
        lines: cart,
        waiterId: waiterId ?? null,
        waiterName,
      });

      // Print only the lines just sent, not the whole order.
      const print = await sendKot.mutateAsync({
        order: res.order,
        items: res.items,
        branchId: branchId ?? null,
        tableName: table?.name ?? null,
        waiterName,
      });

      setCart([]);
      setCartOpen(false);
      Alert.alert(
        `Sent · ${res.order.orderNumber}`,
        print.ok ? print.message : `Order saved, but printing failed: ${print.message}`,
        [{ text: "OK", onPress: () => router.back() }],
      );
    } catch (e) {
      Alert.alert("Could not send order", (e as Error)?.message ?? "Please try again.");
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
          openOrder ? (
            <Pill label="Open bill" fg={c.primaryDark} bg={c.primarySoft} border="#F5DFA0" />
          ) : null
        }
      />

      {menu.error ? (
        <ErrorBanner message={(menu.error as Error).message} onRetry={() => menu.refetch()} />
      ) : null}

      {/* Search */}
      <View style={s.searchWrap}>
        <Ionicons name="search" size={17} color={c.mutedSoft} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search dish or code…"
          placeholderTextColor={c.mutedSoft}
          style={s.searchInput}
          returnKeyType="search"
        />
        {search ? (
          <Ionicons name="close-circle" size={17} color={c.mutedSoft} onPress={() => setSearch("")} suppressHighlighting />
        ) : null}
      </View>

      {/* Categories */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.cats}>
        <Chip label="All" active={cat === "all"} onPress={() => setCat("all")} />
        {(categories.data ?? []).map((k) => (
          <Chip key={k.id} label={k.name} active={cat === k.id} onPress={() => setCat(k.id)} />
        ))}
      </ScrollView>

      {/* Grid */}
      {items.length === 0 ? (
        <EmptyState icon="fast-food-outline" title="No dishes found" hint="Try another category or search term." />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => String(i.id)}
          numColumns={2}
          columnWrapperStyle={{ gap: Space.md }}
          contentContainerStyle={s.grid}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const inCart = cart.filter((l) => l.menuItemId === item.id).reduce((n, l) => n + l.qty, 0);
            const uri = imageUri(item.imageUrl);
            return (
              <TouchableOpacity style={s.tile} activeOpacity={0.85} onPress={() => quickAdd(item)}>
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
          }}
        />
      )}

      {/* Cart bar */}
      {cartCount > 0 ? (
        <TouchableOpacity style={s.cartBar} activeOpacity={0.9} onPress={() => setCartOpen(true)}>
          <View style={s.cartCount}>
            <Text style={s.cartCountText}>{cartCount}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.cartLabel}>View cart</Text>
            <Text style={s.cartSub}>{cart.length} line{cart.length === 1 ? "" : "s"}</Text>
          </View>
          <Text style={s.cartTotal}>{lkr(cartTotal)}</Text>
          <Ionicons name="chevron-forward" size={19} color={c.onPrimary} />
        </TouchableOpacity>
      ) : null}

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

      {/* Cart sheet */}
      <Modal visible={cartOpen} animationType="slide" transparent onRequestClose={() => setCartOpen(false)}>
        <View style={s.modalBg}>
          <View style={s.sheet}>
            <View style={s.sheetHead}>
              <Text style={s.sheetTitle}>Cart · {table?.name ?? ""}</Text>
              <Ionicons name="close" size={22} color={c.muted} onPress={() => setCartOpen(false)} suppressHighlighting />
            </View>

            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              {cart.map((l) => (
                <View key={l.key} style={s.cartLine}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.cartLineName}>{l.name}</Text>
                    {l.modifiers.length ? (
                      <Text style={s.cartLineMeta}>{l.modifiers.map((m) => m.name).join(", ")}</Text>
                    ) : null}
                    {l.note ? <Text style={s.cartLineNote}>“{l.note}”</Text> : null}
                    <Text style={s.cartLinePrice}>
                      {lkr(l.unitPrice + l.modifiers.reduce((m, x) => m + x.price, 0))} each
                    </Text>
                  </View>
                  <QtyStepper qty={l.qty} onChange={(n) => setQty(l.key, n)} compact />
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
                  Adds to the open bill {openOrder.orderNumber}.
                </Text>
              ) : null}
              <PrimaryButton
                label={sending ? "Sending…" : "Send to kitchen & print KOT"}
                icon="print-outline"
                loading={sending}
                onPress={submit}
              />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[s.chip, active && { backgroundColor: c.foreground, borderColor: c.foreground }]}
    >
      <Text style={[s.chipText, active && { color: "#fff" }]} numberOfLines={1}>{label}</Text>
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

  // Reset whenever a different dish opens the sheet.
  const [lastId, setLastId] = useState<number | null>(null);
  if (item && item.id !== lastId) {
    setLastId(item.id);
    setVariation(item.variations?.length ? item.variations[0] : null);
    setMods([]);
    setNote("");
    setQty(1);
  }

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
    marginHorizontal: Space.lg, paddingHorizontal: Space.lg, height: 46,
    backgroundColor: c.card, borderRadius: Radius.md, borderWidth: 1, borderColor: c.border,
  },
  searchInput: { flex: 1, fontFamily: Fonts.regular, fontSize: 14.5, color: c.foreground, height: "100%" },
  cats: { paddingHorizontal: Space.lg, gap: Space.sm, paddingVertical: Space.md },
  chip: {
    paddingHorizontal: Space.lg, paddingVertical: 8, borderRadius: Radius.pill,
    backgroundColor: c.card, borderWidth: 1, borderColor: c.border, maxWidth: 170,
  },
  chipText: { fontFamily: Fonts.medium, fontSize: 12.5, color: c.muted },
  grid: { paddingHorizontal: Space.lg, paddingBottom: 110, gap: Space.md },
  tile: {
    flex: 1, backgroundColor: c.card, borderRadius: Radius.lg, borderWidth: 1,
    borderColor: c.border, padding: Space.sm, ...Shadow.card,
  },
  imgWrap: { position: "relative" },
  img: { width: "100%", height: 96, borderRadius: Radius.md, backgroundColor: c.background },
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
    fontFamily: Fonts.medium, fontSize: 12.5, color: c.foreground,
    marginTop: Space.sm, marginHorizontal: 4, minHeight: 34, lineHeight: 17,
  },
  tileFoot: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginHorizontal: 4, marginBottom: 4,
  },
  tilePrice: { fontFamily: Fonts.bold, fontSize: 13.5, color: c.foreground },
  cartBar: {
    position: "absolute", left: Space.lg, right: Space.lg, bottom: Space.lg,
    flexDirection: "row", alignItems: "center", gap: Space.md,
    backgroundColor: c.primary, borderRadius: Radius.lg,
    paddingHorizontal: Space.lg, paddingVertical: Space.md, ...Shadow.raised,
  },
  cartCount: {
    minWidth: 30, height: 30, borderRadius: Radius.pill, backgroundColor: "#00000018",
    alignItems: "center", justifyContent: "center", paddingHorizontal: 6,
  },
  cartCountText: { fontFamily: Fonts.bold, fontSize: 14, color: c.onPrimary },
  cartLabel: { fontFamily: Fonts.semibold, fontSize: 14.5, color: c.onPrimary },
  cartSub: { fontFamily: Fonts.regular, fontSize: 11.5, color: "#1A140099" },
  cartTotal: { fontFamily: Fonts.bold, fontSize: 16, color: c.onPrimary },
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
