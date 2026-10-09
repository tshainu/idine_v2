import { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Colors, Fonts, Radius, Space } from "../constants/theme";
import { ErrorBanner, Loading, PrimaryButton, ScreenHeader } from "../components/ui";
import { useSession } from "../hooks/use-session";
import { http } from "../lib/http";
import type { Table } from "../lib/types";
const c = Colors.light;
export default function WaiterSettingsScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { branchId, waiterId, allowedTableIds, linkedCashierId } = useSession();
  const [selected, setSelected] = useState<number[] | null>(allowedTableIds);
  const [cashier, setCashier] = useState<number | null>(linkedCashierId);
  useEffect(() => { setSelected(allowedTableIds); setCashier(linkedCashierId); }, [allowedTableIds, linkedCashierId]);
  const tables = useQuery({
    queryKey: ["waiter-settings-tables", branchId], enabled: !!branchId,
    queryFn: async () => (await http.get<{ tables: Table[] }>("/tables", { branchId })).tables.filter((t) => t.isActive),
  });
  const users = useQuery({
    queryKey: ["waiter-settings-users", branchId], enabled: !!branchId,
    queryFn: async () => (await http.get<{ users: Array<{ id: number; name: string; role: string }> }>("/users", { branchId })).users.filter((u) => u.role === "cashier"),
  });
  const save = async () => {
    if (!waiterId) return;
    try {
      await http.patch(`/users/${waiterId}`, { accessibleTableIds: selected == null ? null : JSON.stringify(selected), linkedCashierId: cashier });
      await qc.invalidateQueries({ queryKey: ["waiter-config", waiterId, branchId] });
      Alert.alert("Saved", "Your table access and cashier assignment are updated.");
    } catch (e) { Alert.alert("Could not save", (e as Error).message); }
  };
  const allSelected = selected == null;
  const toggle = (id: number) => setSelected((current) => {
    const base = current == null ? (tables.data ?? []).map((t) => t.id) : current;
    const next = base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
    return next.length === (tables.data ?? []).length ? null : next;
  });
  if (tables.isLoading || users.isLoading) return <SafeAreaView style={s.safe}><Loading label="Loading waiter settings…" /></SafeAreaView>;
  if (tables.error || users.error) return <SafeAreaView style={s.safe}><ErrorBanner message="Could not load waiter settings." onRetry={() => { tables.refetch(); users.refetch(); }} /></SafeAreaView>;
  return <SafeAreaView style={s.safe} edges={["top", "left", "right"]}>
    <ScreenHeader title="Waiter settings" subtitle="Choose where you can take orders" onBack={() => router.back()} />
    <ScrollView contentContainerStyle={s.scroll}>
      <Text style={s.section}>Accessible tables</Text>
      <Text style={s.hint}>Only selected tables will appear in your Tables screen.</Text>
      <TouchableOpacity style={s.allRow} onPress={() => setSelected(allSelected ? [] : null)}><Ionicons name={allSelected ? "checkbox" : "square-outline"} size={21} color={c.primary} /><Text style={s.label}>All tables</Text></TouchableOpacity>
      <View style={s.grid}>{(tables.data ?? []).map((table) => { const on = allSelected || selected?.includes(table.id); return <TouchableOpacity key={table.id} onPress={() => toggle(table.id)} style={[s.table, on && s.tableOn]}><Ionicons name={on ? "checkmark-circle" : "ellipse-outline"} size={18} color={on ? c.primary : c.mutedSoft} /><Text style={[s.tableText, on && { color: c.primaryDark }]}>{table.name}</Text></TouchableOpacity>; })}</View>
      <Text style={s.section}>Send my orders to cashier</Text>
      <Text style={s.hint}>New orders from this app will be assigned to this cashier’s POS registry.</Text>
      {(users.data ?? []).map((user) => { const on = cashier === user.id; return <TouchableOpacity key={user.id} onPress={() => setCashier(on ? null : user.id)} style={[s.cashier, on && s.tableOn]}><Ionicons name={on ? "radio-button-on" : "radio-button-off"} size={20} color={on ? c.primary : c.mutedSoft} /><Text style={s.tableText}>{user.name}</Text></TouchableOpacity>; })}
      <PrimaryButton label="Save settings" icon="checkmark" onPress={save} style={{ marginTop: Space.xl }} />
    </ScrollView>
  </SafeAreaView>;
}
const s = StyleSheet.create({ safe: { flex: 1, backgroundColor: c.background }, scroll: { padding: Space.lg, paddingBottom: 140 }, section: { fontFamily: Fonts.bold, fontSize: 17, color: c.foreground, marginTop: Space.lg }, hint: { fontFamily: Fonts.regular, fontSize: 12.5, color: c.muted, marginTop: 5, marginBottom: Space.md }, allRow: { flexDirection: "row", alignItems: "center", gap: Space.sm, paddingVertical: Space.md }, label: { fontFamily: Fonts.semibold, fontSize: 14, color: c.foreground }, grid: { flexDirection: "row", flexWrap: "wrap", gap: Space.sm }, table: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: Space.md, paddingVertical: 11, borderRadius: Radius.md, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, minWidth: "30%" }, tableOn: { borderColor: c.primary, backgroundColor: c.primarySoft }, tableText: { fontFamily: Fonts.medium, fontSize: 13, color: c.foreground }, cashier: { flexDirection: "row", alignItems: "center", gap: Space.md, padding: Space.md, borderRadius: Radius.md, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, marginBottom: Space.sm } });
