import { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, Alert, Modal, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Fonts, Radius, Space } from "../constants/theme";
import {
  Card, ScreenHeader, Loading, EmptyState, ErrorBanner, PrimaryButton, Pill,
} from "../components/ui";
import { useSession } from "../hooks/use-session";
import { useCustomerSearch, useCustomerOrders, useCreateCustomer } from "../queries/customers";
import { lkr, dateOf, initials } from "../lib/format";
import type { Customer } from "../lib/types";

const c = Colors.light;

export default function CustomerLookupScreen() {
  const router = useRouter();
  const { branchId } = useSession();
  const [term, setTerm] = useState("");
  const [selected, setSelected] = useState<Customer | null>(null);
  const [adding, setAdding] = useState(false);

  const results = useCustomerSearch(term, branchId);

  return (
    <SafeAreaView style={s.safe} edges={["top", "left", "right"]}>
      <ScreenHeader
        title="Customer lookup"
        subtitle="Find a guest by name or phone"
        onBack={() => router.back()}
        right={
          <TouchableOpacity style={s.addBtn} activeOpacity={0.8} onPress={() => setAdding(true)}>
            <Ionicons name="person-add-outline" size={18} color={c.foreground} />
          </TouchableOpacity>
        }
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <View style={s.searchWrap}>
          <Ionicons name="search" size={17} color={c.mutedSoft} />
          <TextInput
            value={term}
            onChangeText={(value) => {
              setTerm(value);
              setSelected(null);
            }}
            placeholder="Name or phone number…"
            placeholderTextColor={c.mutedSoft}
            style={s.searchInput}
            autoCorrect={false}
            returnKeyType="search"
          />
          {results.isFetching && term.trim() ? (
            <ActivityIndicator size="small" color={c.primary} />
          ) : term ? (
            <Ionicons
              name="close-circle"
              size={17}
              color={c.mutedSoft}
              onPress={() => setTerm("")}
              suppressHighlighting
            />
          ) : null}
        </View>

        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {results.error ? (
            <ErrorBanner message={(results.error as Error).message} onRetry={() => results.refetch()} />
          ) : null}

          {term.trim().length < 1 ? (
            <EmptyState
              icon="people-outline"
              title="Search for a guest"
              hint="Start typing a name or phone number for live results."
            />
          ) : results.isLoading ? (
            <Loading label="Searching…" />
          ) : (results.data ?? []).length === 0 ? (
            <EmptyState
              icon="person-outline"
              title="No match"
              hint="No guest found. You can add them as a new customer."
              action="Add customer"
              onAction={() => setAdding(true)}
            />
          ) : (
            (results.data ?? []).map((cust) => (
              <TouchableOpacity key={cust.id} activeOpacity={0.85} onPress={() => setSelected(cust)}>
                <Card style={{ marginBottom: Space.md }}>
                  <View style={s.row}>
                    <View style={s.avatar}>
                      <Text style={s.avatarText}>{initials(cust.name)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.name}>{cust.name}</Text>
                      <Text style={s.meta}>{cust.phone ?? "No phone"}</Text>
                    </View>
                    {cust.loyaltyPoints ? (
                      <Pill label={`${cust.loyaltyPoints} pts`} fg={c.primaryDark} bg={c.primarySoft} />
                    ) : null}
                    <Ionicons name="chevron-forward" size={17} color={c.mutedSoft} />
                  </View>
                </Card>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <CustomerSheet customer={selected} onClose={() => setSelected(null)} />
      <AddCustomerSheet
        visible={adding}
        branchId={branchId}
        prefill={term}
        onClose={() => setAdding(false)}
        onCreated={(cust) => { setAdding(false); setSelected(cust); setTerm(cust.name); }}
      />
    </SafeAreaView>
  );
}

function CustomerSheet({ customer, onClose }: { customer: Customer | null; onClose: () => void }) {
  const { branchId } = useSession();
  const orders = useCustomerOrders(branchId, customer?.id);

  if (!customer) return null;

  const spend = (orders.data ?? []).reduce((sum, o) => sum + (o.total ?? 0), 0);

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.modalBg}>
        <View style={s.sheet}>
          <View style={s.sheetHead}>
            <View style={s.avatar}>
              <Text style={s.avatarText}>{initials(customer.name)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.sheetTitle}>{customer.name}</Text>
              <Text style={s.meta}>{customer.phone ?? "No phone"}</Text>
            </View>
            <Ionicons name="close" size={22} color={c.muted} onPress={onClose} suppressHighlighting />
          </View>

          <View style={s.statRow}>
            <View style={s.stat}>
              <Text style={s.statValue}>{orders.data?.length ?? 0}</Text>
              <Text style={s.statLabel}>Visits</Text>
            </View>
            <View style={s.stat}>
              <Text style={s.statValue}>{lkr(spend)}</Text>
              <Text style={s.statLabel}>Lifetime</Text>
            </View>
            <View style={s.stat}>
              <Text style={s.statValue}>{customer.loyaltyPoints ?? 0}</Text>
              <Text style={s.statLabel}>Points</Text>
            </View>
          </View>

          {customer.notes ? (
            <View style={s.noteBox}>
              <Ionicons name="information-circle-outline" size={15} color={c.info} />
              <Text style={s.noteText}>{customer.notes}</Text>
            </View>
          ) : null}

          <Text style={s.groupLabel}>Recent orders</Text>
          <ScrollView style={{ maxHeight: 240 }} showsVerticalScrollIndicator={false}>
            {orders.isLoading ? (
              <Loading />
            ) : (orders.data ?? []).length === 0 ? (
              <Text style={s.none}>No past orders for this guest.</Text>
            ) : (
              (orders.data ?? []).map((o) => (
                <View key={o.id} style={s.orderRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.orderNo}>{o.orderNumber}</Text>
                    <Text style={s.meta}>
                      {dateOf(o.createdAt)} · {o.items?.length ?? 0} items
                    </Text>
                  </View>
                  <Text style={s.orderTotal}>{lkr(o.total)}</Text>
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function AddCustomerSheet({ visible, branchId, prefill, onClose, onCreated }: {
  visible: boolean;
  branchId: number | undefined;
  prefill: string;
  onClose: () => void;
  onCreated: (c: Customer) => void;
}) {
  const create = useCreateCustomer(branchId);
  // A phone-shaped search term is a phone, otherwise treat it as a name.
  const isPhone = /^[\d+][\d\s-]{5,}$/.test(prefill.trim());
  const [name, setName] = useState(isPhone ? "" : prefill);
  const [phone, setPhone] = useState(isPhone ? prefill.trim() : "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const phoneLike = /^[\d+][\d\s-]{5,}$/.test(prefill.trim());
    setName(phoneLike ? "" : prefill);
    setPhone(phoneLike ? prefill.trim() : "");
  }, [visible, prefill]);

  async function submit() {
    if (!name.trim()) {
      Alert.alert("Name required", "Enter the guest's name.");
      return;
    }
    setBusy(true);
    try {
      const cust = await create.mutateAsync({ name: name.trim(), phone: phone.trim() || null });
      onCreated(cust);
    } catch (e) {
      Alert.alert("Could not add customer", (e as Error)?.message ?? "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!visible) return null;

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.modalBg}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={s.sheet}>
            <View style={s.sheetHead}>
              <Text style={[s.sheetTitle, { flex: 1 }]}>New customer</Text>
              <Ionicons name="close" size={22} color={c.muted} onPress={onClose} suppressHighlighting />
            </View>

            <Text style={s.groupLabel}>Name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Guest name"
              placeholderTextColor={c.mutedSoft}
              style={s.input}
            />

            <Text style={s.groupLabel}>Phone (optional)</Text>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="07XXXXXXXX"
              placeholderTextColor={c.mutedSoft}
              keyboardType="phone-pad"
              style={s.input}
            />

            <PrimaryButton
              label="Save customer"
              icon="checkmark"
              loading={busy}
              onPress={submit}
              style={{ marginTop: Space.xl }}
            />
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.background },
  addBtn: {
    width: 40, height: 40, borderRadius: Radius.md, backgroundColor: c.card,
    borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center",
  },
  searchWrap: {
    flexDirection: "row", alignItems: "center", gap: Space.md,
    marginHorizontal: Space.lg, marginBottom: Space.md,
    paddingHorizontal: Space.lg, height: 48,
    backgroundColor: c.card, borderRadius: Radius.md, borderWidth: 1, borderColor: c.border,
  },
  searchInput: { flex: 1, fontFamily: Fonts.regular, fontSize: 14.5, color: c.foreground, height: "100%" },
  scroll: { padding: Space.lg, paddingTop: 0, paddingBottom: Space.xxl },
  row: { flexDirection: "row", alignItems: "center", gap: Space.md },
  avatar: {
    width: 42, height: 42, borderRadius: Radius.pill, backgroundColor: c.primary,
    alignItems: "center", justifyContent: "center",
  },
  avatarText: { fontFamily: Fonts.bold, fontSize: 15, color: c.onPrimary },
  name: { fontFamily: Fonts.semibold, fontSize: 15, color: c.foreground },
  meta: { fontFamily: Fonts.regular, fontSize: 12, color: c.muted, marginTop: 1 },
  modalBg: { flex: 1, backgroundColor: "#0B102066", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: c.card, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
    padding: Space.lg, paddingBottom: Space.xxl,
  },
  sheetHead: { flexDirection: "row", alignItems: "center", gap: Space.md, marginBottom: Space.lg },
  sheetTitle: { fontFamily: Fonts.bold, fontSize: 17, color: c.foreground },
  statRow: { flexDirection: "row", gap: Space.md },
  stat: {
    flex: 1, backgroundColor: c.background, borderRadius: Radius.md,
    padding: Space.md, alignItems: "center",
  },
  statValue: { fontFamily: Fonts.bold, fontSize: 15, color: c.foreground },
  statLabel: { fontFamily: Fonts.regular, fontSize: 11, color: c.muted, marginTop: 2 },
  noteBox: {
    flexDirection: "row", gap: Space.sm, backgroundColor: c.infoSoft,
    borderRadius: Radius.md, padding: Space.md, marginTop: Space.md,
  },
  noteText: { flex: 1, fontFamily: Fonts.regular, fontSize: 12.5, color: c.info, lineHeight: 18 },
  groupLabel: {
    fontFamily: Fonts.semibold, fontSize: 11.5, color: c.mutedSoft,
    textTransform: "uppercase", letterSpacing: 0.5, marginTop: Space.lg, marginBottom: Space.sm,
  },
  input: {
    backgroundColor: c.background, borderRadius: Radius.md, borderWidth: 1,
    borderColor: c.border, paddingHorizontal: Space.lg, height: 50,
    fontFamily: Fonts.regular, fontSize: 15, color: c.foreground,
  },
  none: { fontFamily: Fonts.regular, fontSize: 13, color: c.muted, textAlign: "center", paddingVertical: Space.lg },
  orderRow: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: Space.md, borderBottomWidth: 1, borderBottomColor: c.border,
  },
  orderNo: { fontFamily: Fonts.medium, fontSize: 13.5, color: c.foreground },
  orderTotal: { fontFamily: Fonts.semibold, fontSize: 13.5, color: c.foreground },
});
