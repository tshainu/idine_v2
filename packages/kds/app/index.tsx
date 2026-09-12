import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Ionicons } from "@expo/vector-icons";

const API = ((Constants.expoConfig?.extra as any)?.apiUrl ?? "https://idinev2.69-169-97-195.sslip.io/").replace(/\/+$/, "");
const C = { bg: "#111827", surface: "#1F2937", surface2: "#263548", border: "#374151", gold: "#D4A94F", text: "#F9FAFB", muted: "#A9B3C2", dim: "#748094", success: "#22C55E", warning: "#F59E0B", danger: "#EF4444", info: "#60A5FA", purple: "#C084FC" };
const TYPE: Record<string, string> = { "dine-in": C.gold, takeaway: C.purple, delivery: C.info };

type Branch = { id: number; name: string };
type Printer = { id: number; name: string; type?: string; ipAddress?: string; port?: number };
type Item = { id: number; menuItemId?: number | null; name: string; qty: number; note?: string | null; printerId?: number | null };
type MenuItem = { id: number; categoryId?: number | null; printerId?: number | null };
type Order = { id: number; orderNumber: string; type?: string; tableId?: number | null; tableName?: string | null; createdAt: string; updatedAt?: string | null; customerName?: string | null; placedBy?: string | null; waiterName?: string | null; notes?: string | null; items?: Item[] };

async function api<T>(path: string, options: RequestInit = {}, query?: Record<string, string | number | undefined>): Promise<T> {
  const qs = query ? "?" + Object.entries(query).filter(([, v]) => v !== undefined).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join("&") : "";
  const res = await fetch(`${API}/api${path}${qs}`, { ...options, headers: { "Content-Type": "application/json", ...options.headers } });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

function orderStart(order: Order) { return order.updatedAt || order.createdAt; }
function elapsed(order: Order) { const sec = Math.max(0, Math.floor((Date.now() - new Date(orderStart(order)).getTime()) / 1000)); return sec >= 60 ? `${Math.floor(sec / 60)}m ${sec % 60}s` : `${sec}s`; }
function urgency(order: Order) { const min = (Date.now() - new Date(orderStart(order)).getTime()) / 60000; return min >= 15 ? C.danger : min >= 8 ? C.warning : C.success; }

export default function KdsScreen() {
  const [branch, setBranch] = useState<Branch | null>(null);
  const [printer, setPrinter] = useState<number | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [itemPrinterMap, setItemPrinterMap] = useState<Record<number, number | null>>({});
  const [tableNames, setTableNames] = useState<Record<number, string>>({});
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [setupLoading, setSetupLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState("");

  const registerPush = useCallback(async (branchId: number) => {
    if (Platform.OS === "web" || !Device.isDevice) return;
    try {
      const permissions = await Notifications.getPermissionsAsync();
      const status = permissions.status === "granted" ? "granted" : (await Notifications.requestPermissionsAsync()).status;
      if (status !== "granted") return;
      const projectId = (Constants.easConfig as any)?.projectId ?? (Constants.expoConfig?.extra as any)?.eas?.projectId;
      if (!projectId) return;
      const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      await api("/kds-tokens", { method: "POST", body: JSON.stringify({ token, branchId, platform: Platform.OS, appVersion: Constants.expoConfig?.version }) });
    } catch { /* polling remains the safety net */ }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const saved = await AsyncStorage.getItem("idine-kds-selection");
        const b = await api<{ branches: Branch[] }>("/branches");
        if (!mounted) return;
        setBranches(b.branches || []);
        const savedBranch = saved ? JSON.parse(saved) as { branchId?: number; printerId?: number | null } : {};
        const chosen = (b.branches || []).find(x => x.id === savedBranch.branchId) || (b.branches || [])[0] || null;
        setBranch(chosen);
        setPrinter(savedBranch.printerId ?? null);
        if (chosen) registerPush(chosen.id);
      } catch (e) { if (mounted) setError((e as Error).message); }
      finally { if (mounted) setSetupLoading(false); }
    })();
    return () => { mounted = false; };
  }, [registerPush]);

  const loadSetup = useCallback(async (branchId: number) => {
    try {
      const [p, menu, settings, tables] = await Promise.all([
        api<{ printers: Printer[] }>("/printers", {}, { branchId }),
        api<{ items: MenuItem[] }>("/menu-items", {}, { branchId }),
        api<{ settings?: Record<string, string> }>("/settings", {}, { branchId }),
        api<{ tables: { id: number; name: string }[] }>("/tables", {}, { branchId }),
      ]);
      setPrinters((p.printers || []).filter(x => !x.type || x.type === "kot" || x.type === "kitchen"));
      const categoryPrinter: Record<number, number> = {};
      try {
        const setup = JSON.parse(settings.settings?.printerSetup || "{}");
        Object.entries(setup.printerCategories || {}).forEach(([printerId, categoryIds]) => {
          if (Array.isArray(categoryIds)) categoryIds.forEach(categoryId => { categoryPrinter[Number(categoryId)] = Number(printerId); });
        });
      } catch { /* keep direct menu item assignments */ }
      const next: Record<number, number | null> = {};
      (menu.items || []).forEach(item => { next[item.id] = item.printerId ?? categoryPrinter[item.categoryId ?? -1] ?? null; });
      setItemPrinterMap(next);
      setTableNames(Object.fromEntries((tables.tables || []).map(table => [table.id, table.name])));
    } catch { setPrinters([]); setItemPrinterMap({}); }
  }, []);
  useEffect(() => { if (branch) loadSetup(branch.id); }, [branch, loadSetup]);

  const loadOrders = useCallback(async () => {
    if (!branch) return;
    try { const data = await api<{ orders: Order[] }>("/orders", {}, { branchId: branch.id, status: "confirmed" }); setOrders(data.orders || []); setError(""); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [branch]);
  useEffect(() => { loadOrders(); const poll = setInterval(loadOrders, 8000); const timer = setInterval(() => setNow(Date.now()), 1000); return () => { clearInterval(poll); clearInterval(timer); }; }, [loadOrders]);

  const selectBranch = async (value: Branch) => { setBranch(value); setPrinter(null); await AsyncStorage.setItem("idine-kds-selection", JSON.stringify({ branchId: value.id, printerId: null })); registerPush(value.id); };
  const selectPrinter = async (value: number | null) => { setPrinter(value); if (branch) await AsyncStorage.setItem("idine-kds-selection", JSON.stringify({ branchId: branch.id, printerId: value })); };
  const markReady = async (id: number) => { setBusy(id); try { await api(`/orders/${id}`, { method: "PATCH", body: JSON.stringify({ status: "ready" }) }); setOrders(prev => prev.filter(o => o.id !== id)); } catch (e) { setError((e as Error).message); } finally { setBusy(null); } };
  const display = useMemo(() => {
    if (printer === null) return orders;
    return orders.map(order => ({
      ...order,
      items: (order.items || []).filter(item => (item.printerId ?? itemPrinterMap[item.menuItemId ?? -1] ?? null) === printer),
    })).filter(order => (order.items || []).length > 0);
  }, [orders, printer, itemPrinterMap]);

  if (setupLoading) return <View style={s.center}><ActivityIndicator size="large" color={C.gold} /><Text style={s.muted}>Loading kitchen setup…</Text></View>;
  if (!branch) return <View style={s.center}><Text style={s.brand}>iDine KDS</Text><Text style={s.title}>Select default kitchen</Text><View style={s.setupRow}>{branches.map(b => <Pressable key={b.id} onPress={() => selectBranch(b)} style={s.selectCard}><Ionicons name="restaurant-outline" size={26} color={C.gold} /><Text style={s.selectText}>{b.name}</Text></Pressable>)}</View></View>;

  return <View style={s.root}>
    <View style={s.header}><View style={s.brandBox}><View style={s.logo}><Ionicons name="restaurant" size={21} color={C.bg} /></View><View><Text style={s.brand}>iDine KDS</Text><Text style={s.subtitle}>Kitchen Display System · {branch.name}</Text></View></View>
      <View style={s.stations}><Pressable onPress={() => selectPrinter(null)} style={[s.station, printer === null && s.stationActive]}><Text style={[s.stationText, printer === null && s.stationActiveText]}>All Stations</Text></Pressable>{printers.map(p => <Pressable key={p.id} onPress={() => selectPrinter(p.id)} style={[s.station, printer === p.id && s.stationActive]}><Text style={[s.stationText, printer === p.id && s.stationActiveText]}>{p.name}</Text></Pressable>)}</View>
      <View style={s.headerRight}><Text style={s.clock}>{new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</Text><View style={s.active}><Text style={s.activeText}>{display.length} Active</Text></View><Pressable onPress={() => setBranch(null)}><Ionicons name="settings-outline" size={21} color={C.muted} /></Pressable></View>
    </View>
    {error ? <View style={s.error}><Text style={s.errorText}>{error}</Text></View> : null}
    {loading && !orders.length ? <View style={s.center}><ActivityIndicator size="large" color={C.gold} /></View> : display.length === 0 ? <View style={s.center}><Ionicons name="restaurant-outline" size={62} color={C.dim} /><Text style={s.empty}>All clear! No pending orders.</Text></View> : <FlatList data={display} keyExtractor={o => String(o.id)} numColumns={5} contentContainerStyle={s.grid} columnWrapperStyle={s.row} renderItem={({ item }) => <Ticket order={item} tableNames={tableNames} busy={busy === item.id} onReady={() => markReady(item.id)} />} />}
  </View>;
}

function Ticket({ order, tableNames, busy, onReady }: { order: Order; tableNames: Record<number, string>; busy: boolean; onReady: () => void }) {
  const color = TYPE[order.type || ""] || C.border;
  const label = order.tableName || (order.tableId ? tableNames[order.tableId] : null) || "—";
  return <View style={[s.ticket, { borderColor: color }]}><View style={[s.ticketHead, { backgroundColor: `${color}22` }]}><View><Text style={s.orderNo}>{order.orderNumber}</Text><Text style={s.ticketSub}>{order.type === "dine-in" ? `Table ${label}` : (order.type || "ORDER").toUpperCase()}</Text></View><View style={s.timeBox}><Text style={[s.elapsed, { color: urgency(order) }]}><Ionicons name="time-outline" size={13} color={urgency(order)} /> {elapsed(order)}</Text><Text style={s.ticketTime}>{new Date(orderStart(order)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Text><Text style={s.waiter}>{order.waiterName || order.placedBy || "Unknown waiter"}</Text></View></View><View style={s.items}><Text style={s.itemsLabel}>ITEMS</Text><ScrollView nestedScrollEnabled style={s.itemScroll}>{(order.items || []).map(i => <View key={i.id} style={s.item}><Text style={s.qty}>{i.qty}×</Text><View style={{ flex: 1 }}><Text style={s.itemName} numberOfLines={2}>{i.name}</Text>{i.note ? <Text style={s.note}>{i.note}</Text> : null}</View></View>)}</ScrollView>{order.customerName ? <Text style={s.meta}>Customer: {order.customerName}</Text> : null}{order.notes ? <Text style={s.warning}>⚠ {order.notes}</Text> : null}</View><Pressable disabled={busy} onPress={onReady} style={[s.ready, busy && { opacity: .6 }]}>{busy ? <ActivityIndicator color="#fff" /> : <><Ionicons name="checkmark-circle-outline" size={17} color="#fff" /><Text style={s.readyText}>Cooked · Alert Waiter</Text></>}</Pressable></View>;
}

const s = StyleSheet.create({ root: { flex: 1, backgroundColor: C.bg }, center: { flex: 1, backgroundColor: C.bg, alignItems: "center", justifyContent: "center", gap: 12 }, muted: { color: C.muted, fontSize: 15 }, brandBox: { flexDirection: "row", alignItems: "center", gap: 10 }, logo: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.gold, alignItems: "center", justifyContent: "center" }, brand: { color: C.gold, fontWeight: "800", fontSize: 17 }, subtitle: { color: C.dim, fontSize: 11, marginTop: 2 }, header: { height: 70, paddingHorizontal: 20, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16 }, stations: { flex: 1, flexDirection: "row", justifyContent: "center", gap: 7 }, station: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 8, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border }, stationActive: { backgroundColor: C.gold, borderColor: C.gold }, stationText: { color: C.muted, fontSize: 11, fontWeight: "700" }, stationActiveText: { color: C.bg }, headerRight: { flexDirection: "row", alignItems: "center", gap: 13 }, clock: { color: C.muted, fontSize: 13, fontWeight: "700" }, active: { backgroundColor: `${C.success}33`, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 }, activeText: { color: C.success, fontSize: 11, fontWeight: "800" }, grid: { padding: 16, paddingBottom: 24 }, row: { gap: 10, alignItems: "flex-start" }, ticket: { flex: 1, minWidth: 0, maxWidth: 360, height: 360, backgroundColor: C.surface, borderWidth: 2, borderRadius: 15, overflow: "hidden", marginBottom: 10 }, ticketHead: { minHeight: 82, paddingHorizontal: 10, paddingVertical: 9, flexDirection: "row", justifyContent: "space-between" }, orderNo: { color: C.gold, fontSize: 15, fontWeight: "900" }, ticketSub: { color: C.muted, fontSize: 10, marginTop: 2 }, timeBox: { alignItems: "flex-end", maxWidth: "55%" }, elapsed: { fontSize: 10, fontWeight: "800" }, ticketTime: { color: C.dim, fontSize: 9, marginTop: 3 }, waiter: { color: C.text, fontSize: 9, marginTop: 3, maxWidth: 110 }, items: { height: 220, padding: 10, gap: 5 }, itemScroll: { flex: 1 }, itemsLabel: { color: C.dim, fontSize: 9, fontWeight: "800", marginBottom: 2 }, item: { flexDirection: "row", gap: 6, marginBottom: 4 }, qty: { color: C.gold, fontSize: 12, fontWeight: "900", width: 23 }, itemName: { color: C.text, fontSize: 11, fontWeight: "600" }, note: { color: C.warning, fontSize: 9, marginTop: 2 }, meta: { color: C.muted, fontSize: 9, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 4 }, warning: { color: C.warning, backgroundColor: `${C.warning}22`, borderRadius: 5, padding: 5, fontSize: 9 }, ready: { margin: 10, marginTop: 0, borderRadius: 9, paddingVertical: 9, backgroundColor: C.success, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 }, readyText: { color: "#fff", fontSize: 10, fontWeight: "900" }, empty: { color: C.dim, fontSize: 17, fontWeight: "700" }, error: { backgroundColor: `${C.danger}22`, padding: 8, alignItems: "center" }, errorText: { color: C.danger, fontSize: 12 }, title: { color: C.text, fontSize: 22, fontWeight: "800" }, setupRow: { flexDirection: "row", gap: 14, flexWrap: "wrap", justifyContent: "center" }, selectCard: { width: 210, minHeight: 110, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 16, alignItems: "center", justifyContent: "center", gap: 10 }, selectText: { color: C.text, fontWeight: "700", fontSize: 15 } });
