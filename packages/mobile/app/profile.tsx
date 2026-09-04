import { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Fonts, Radius, Shadow, Space } from "../constants/theme";
import { Card, ScreenHeader, EmptyState, ErrorBanner, PrimaryButton, Pill, SectionTitle } from "../components/ui";
import { useSession, useSessionActions } from "../hooks/use-session";
import { useActiveShift, useMyShifts, useClockIn, useClockOut } from "../queries/shifts";
import { useOrders } from "../queries/orders";
import { clearPin } from "../lib/session";
import { lkr, elapsed, dateOf, timeOf, startOfDay } from "../lib/format";

const c = Colors.light;

export default function ProfileScreen() {
  const router = useRouter();
  const { session, branchId, waiterId, waiterName } = useSession();
  const { signOut } = useSessionActions();

  const active = useActiveShift(waiterId);
  const shifts = useMyShifts(waiterId, branchId);
  const orders = useOrders(branchId, { waiterId });
  const clockIn = useClockIn();
  const clockOut = useClockOut();
  const [busy, setBusy] = useState(false);

  const onShift = !!active.data;

  // Today's takings for this waiter, so the shift card means something.
  const today = (orders.data ?? []).filter((o) => {
    const t = o.createdAt ? new Date(o.createdAt).getTime() : 0;
    return t >= startOfDay().getTime() && o.waiterId === waiterId;
  });
  const sales = today
    .filter((o) => !["cancelled", "refunded"].includes(o.status))
    .reduce((sum, o) => sum + (o.total ?? 0), 0);
  const tips = today.reduce((sum, o) => sum + (o.tipAmount ?? 0), 0);

  async function toggleShift() {
    if (!waiterId) return;
    setBusy(true);
    try {
      if (onShift) {
        await clockOut.mutateAsync(waiterId);
      } else {
        const res = await clockIn.mutateAsync({
          userId: waiterId,
          branchId: branchId ?? null,
          userName: waiterName,
        });
        if (res.alreadyOpen) {
          Alert.alert("Already on shift", "You were already clocked in on another device.");
        }
      }
    } catch (e) {
      Alert.alert("Shift update failed", (e as Error)?.message ?? "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function confirmClockOut() {
    if (!onShift) {
      toggleShift();
      return;
    }
    Alert.alert("Clock out?", "This ends your shift for the day.", [
      { text: "Cancel", style: "cancel" },
      { text: "Clock out", style: "destructive", onPress: toggleShift },
    ]);
  }

  function changePin() {
    Alert.alert("Change PIN?", "You'll set a new 4-digit PIN now.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Change PIN",
        onPress: async () => {
          await clearPin();
          router.replace("/pin-setup");
        },
      },
    ]);
  }

  function confirmSignOut() {
    Alert.alert(
      onShift ? "You're still on shift" : "Sign out?",
      onShift
        ? "Clock out first so your hours are recorded correctly. Sign out anyway?"
        : "You'll need your User ID, username and password to sign back in.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign out",
          style: "destructive",
          onPress: async () => {
            await signOut();
            router.replace("/");
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={["top", "left", "right"]}>
      <ScreenHeader title="Profile & shift" onBack={() => router.back()} />

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={shifts.isFetching}
            onRefresh={() => { shifts.refetch(); active.refetch(); }}
            tintColor={c.primary}
          />
        }
      >
        {active.error ? (
          <ErrorBanner message={(active.error as Error).message} onRetry={() => active.refetch()} />
        ) : null}

        {/* Identity */}
        <Card>
          <View style={s.who}>
            <View style={s.avatar}>
              <Text style={s.avatarText}>
                {(session?.name ?? "W").slice(0, 1).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{session?.name ?? "Waiter"}</Text>
              <Text style={s.meta}>
                {session?.username ?? "—"} · {session?.role ?? "waiter"}
              </Text>
              <Text style={s.metaDim}>
                {session?.userId ?? "—"} · Branch #{branchId ?? "—"}
              </Text>
            </View>
          </View>
        </Card>

        {/* Shift */}
        <Card style={{ marginTop: Space.md }}>
          <View style={s.shiftTop}>
            <View style={[s.dot, { backgroundColor: onShift ? c.success : c.mutedSoft }]} />
            <Text style={s.shiftState}>{onShift ? "On shift" : "Off shift"}</Text>
            {onShift ? (
              <Pill label={elapsed(active.data?.clockIn)} fg={c.success} bg={c.successSoft} />
            ) : null}
          </View>

          {onShift ? (
            <Text style={s.shiftSince}>
              Started at {timeOf(active.data?.clockIn)} · {dateOf(active.data?.clockIn)}
            </Text>
          ) : (
            <Text style={s.shiftSince}>Clock in to start recording your hours.</Text>
          )}

          <View style={s.miniRow}>
            <View style={s.mini}>
              <Text style={s.miniValue}>{today.length}</Text>
              <Text style={s.miniLabel}>Orders today</Text>
            </View>
            <View style={s.mini}>
              <Text style={s.miniValue}>{lkr(sales)}</Text>
              <Text style={s.miniLabel}>Sales</Text>
            </View>
            <View style={s.mini}>
              <Text style={[s.miniValue, { color: c.success }]}>{lkr(tips)}</Text>
              <Text style={s.miniLabel}>Tips</Text>
            </View>
          </View>

          <PrimaryButton
            label={onShift ? "Clock out" : "Clock in"}
            icon={onShift ? "log-out-outline" : "play-outline"}
            variant={onShift ? "danger" : "success"}
            loading={busy}
            onPress={confirmClockOut}
          />
        </Card>

        {/* This week */}
        <SectionTitle title="This week" />
        {(shifts.data ?? []).length === 0 ? (
          <EmptyState icon="time-outline" title="No shifts yet" hint="Your clock-ins this week will show up here." />
        ) : (
          <Card padded={false}>
            {(shifts.data ?? []).map((sh, i) => {
              const a = sh.clockIn ? new Date(sh.clockIn).getTime() : 0;
              const b = sh.clockOut ? new Date(sh.clockOut).getTime() : Date.now();
              const hours = a ? (b - a) / 3_600_000 : 0;
              return (
                <View key={sh.id} style={[s.shiftRow, i > 0 && { borderTopWidth: 1, borderTopColor: c.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.shiftDate}>{dateOf(sh.clockIn)}</Text>
                    <Text style={s.metaDim}>
                      {timeOf(sh.clockIn)} → {sh.clockOut ? timeOf(sh.clockOut) : "now"}
                    </Text>
                  </View>
                  {!sh.clockOut ? (
                    <Pill label="Open" fg={c.success} bg={c.successSoft} />
                  ) : null}
                  <Text style={s.shiftHours}>{hours.toFixed(1)}h</Text>
                </View>
              );
            })}
          </Card>
        )}

        {/* Security */}
        <SectionTitle title="Security" />
        <Card padded={false}>
          <TouchableOpacity style={s.linkRow} activeOpacity={0.7} onPress={changePin}>
            <View style={s.linkIcon}>
              <Ionicons name="keypad-outline" size={18} color={c.foreground} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.linkLabel}>Change PIN</Text>
              <Text style={s.metaDim}>Set a new 4-digit unlock code</Text>
            </View>
            <Ionicons name="chevron-forward" size={17} color={c.mutedSoft} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.linkRow, { borderTopWidth: 1, borderTopColor: c.border }]}
            activeOpacity={0.7}
            onPress={() => router.push("/printer-settings")}
          >
            <View style={s.linkIcon}>
              <Ionicons name="print-outline" size={18} color={c.foreground} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.linkLabel}>Printer settings</Text>
              <Text style={s.metaDim}>KOT printer and test print</Text>
            </View>
            <Ionicons name="chevron-forward" size={17} color={c.mutedSoft} />
          </TouchableOpacity>
        </Card>

        <TouchableOpacity onPress={confirmSignOut} activeOpacity={0.85} style={s.signOut}>
          <Ionicons name="log-out-outline" size={18} color={c.destructive} />
          <Text style={s.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.background },
  scroll: { padding: Space.lg, paddingBottom: Space.xxl },
  who: { flexDirection: "row", alignItems: "center", gap: Space.md },
  avatar: {
    width: 52, height: 52, borderRadius: Radius.pill, backgroundColor: c.primary,
    alignItems: "center", justifyContent: "center",
  },
  avatarText: { fontFamily: Fonts.bold, fontSize: 20, color: c.onPrimary },
  name: { fontFamily: Fonts.bold, fontSize: 17, color: c.foreground },
  meta: { fontFamily: Fonts.regular, fontSize: 12.5, color: c.muted, marginTop: 2, textTransform: "capitalize" },
  metaDim: { fontFamily: Fonts.regular, fontSize: 11.5, color: c.mutedSoft, marginTop: 1 },
  shiftTop: { flexDirection: "row", alignItems: "center", gap: Space.sm },
  dot: { width: 9, height: 9, borderRadius: Radius.pill },
  shiftState: { flex: 1, fontFamily: Fonts.semibold, fontSize: 15.5, color: c.foreground },
  shiftSince: { fontFamily: Fonts.regular, fontSize: 12.5, color: c.muted, marginTop: 4 },
  miniRow: { flexDirection: "row", gap: Space.md, marginVertical: Space.lg },
  mini: { flex: 1, backgroundColor: c.background, borderRadius: Radius.md, padding: Space.md, alignItems: "center" },
  miniValue: { fontFamily: Fonts.bold, fontSize: 14.5, color: c.foreground },
  miniLabel: { fontFamily: Fonts.regular, fontSize: 10.5, color: c.muted, marginTop: 2 },
  shiftRow: { flexDirection: "row", alignItems: "center", gap: Space.md, padding: Space.lg },
  shiftDate: { fontFamily: Fonts.medium, fontSize: 13.5, color: c.foreground },
  shiftHours: { fontFamily: Fonts.bold, fontSize: 14, color: c.foreground },
  linkRow: { flexDirection: "row", alignItems: "center", gap: Space.md, padding: Space.lg },
  linkIcon: {
    width: 38, height: 38, borderRadius: Radius.md, backgroundColor: c.background,
    alignItems: "center", justifyContent: "center",
  },
  linkLabel: { fontFamily: Fonts.medium, fontSize: 14.5, color: c.foreground },
  signOut: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: c.card, borderRadius: Radius.lg, borderWidth: 1,
    borderColor: c.destructiveSoft, paddingVertical: Space.lg, marginTop: Space.xxl, ...Shadow.card,
  },
  signOutText: { fontFamily: Fonts.semibold, fontSize: 14.5, color: c.destructive },
});
