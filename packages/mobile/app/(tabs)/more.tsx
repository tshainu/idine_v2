import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, type Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Fonts, Radius, Shadow, Space } from "../../constants/theme";
import { Card, Pill } from "../../components/ui";
import { useSession, useSessionActions } from "../../hooks/use-session";
import { useActiveShift } from "../../queries/shifts";
import { usePendingPrintJobs } from "../../queries/print";
import { useOrders } from "../../queries/orders";
import { initials, elapsed } from "../../lib/format";
import { API_BASE } from "../../lib/http";

const c = Colors.light;

export default function MoreScreen() {
  const router = useRouter();
  const { session, branchId, waiterId } = useSession();
  const { signOut } = useSessionActions();
  const shift = useActiveShift(waiterId);
  const jobs = usePendingPrintJobs(branchId);
  const orders = useOrders(branchId, { waiterId });

  const readyCount = (orders.data ?? []).filter((o) => o.status === "ready").length;

  function confirmSignOut() {
    Alert.alert(
      "Sign out?",
      "You'll need your User ID, username and password to sign back in.",
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
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.title}>More</Text>

        {/* Waiter card */}
        <TouchableOpacity activeOpacity={0.85} onPress={() => router.push("/profile")}>
          <Card style={{ marginTop: Space.md }}>
            <View style={s.who}>
              <View style={s.avatar}>
                <Text style={s.avatarText}>{initials(session?.name)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{session?.name ?? "Waiter"}</Text>
                <Text style={s.role}>
                  {session?.role ?? "waiter"} · {session?.userId ?? "—"}
                </Text>
              </View>
              {shift.data ? (
                <Pill label={`On shift ${elapsed(shift.data.clockIn)}`} fg={c.success} bg={c.successSoft} />
              ) : (
                <Pill label="Off shift" fg={c.muted} bg={c.background} />
              )}
            </View>
          </Card>
        </TouchableOpacity>

        {/* Service */}
        <Text style={s.group}>Service</Text>
        <Card padded={false}>
          <Row
            icon="notifications-outline"
            label="Ready items"
            hint="Food waiting to be picked up"
            badge={readyCount}
            onPress={() => router.push("/ready-items")}
          />
          <Row
            icon="megaphone-outline"
            label="Notifications"
            hint="Kitchen updates and alerts"
            onPress={() => router.push("/notifications")}
            divider
          />
          <Row
            icon="people-outline"
            label="Customer lookup"
            hint="Find a guest by name or phone"
            onPress={() => router.push("/customer-lookup")}
            divider
          />
        </Card>

        {/* Device */}
        <Text style={s.group}>Device</Text>
        <Card padded={false}>
          <Row
            icon="print-outline"
            label="Printer settings"
            hint="KOT printer, paper width, test print"
            badge={jobs.data?.length ?? 0}
            badgeTone="warning"
            onPress={() => router.push("/printer-settings")}
          />
          <Row
            icon="person-circle-outline"
            label="Profile & shift"
            hint="Clock in, clock out, change PIN"
            onPress={() => router.push("/profile")}
            divider
          />
        </Card>

        {/* About */}
        <Text style={s.group}>About</Text>
        <Card>
          <View style={s.aboutRow}>
            <Text style={s.aboutLabel}>Server</Text>
            <Text style={s.aboutValue} numberOfLines={1}>{API_BASE.replace(/^https?:\/\//, "")}</Text>
          </View>
          <View style={[s.aboutRow, s.aboutDivider]}>
            <Text style={s.aboutLabel}>Branch</Text>
            <Text style={s.aboutValue}>#{branchId ?? "—"}</Text>
          </View>
          <View style={[s.aboutRow, s.aboutDivider]}>
            <Text style={s.aboutLabel}>App</Text>
            <Text style={s.aboutValue}>iDine Waiter v2</Text>
          </View>
        </Card>

        <TouchableOpacity onPress={confirmSignOut} activeOpacity={0.85} style={s.signOut}>
          <Ionicons name="log-out-outline" size={18} color={c.destructive} />
          <Text style={s.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ icon, label, hint, onPress, badge, badgeTone = "danger", divider }: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint?: string;
  onPress: () => void;
  badge?: number;
  badgeTone?: "danger" | "warning";
  divider?: boolean;
}) {
  const tone = badgeTone === "warning" ? c.warning : c.destructive;
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      style={[s.row, divider && { borderTopWidth: 1, borderTopColor: c.border }]}
    >
      <View style={s.rowIcon}>
        <Ionicons name={icon} size={19} color={c.foreground} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.rowLabel}>{label}</Text>
        {hint ? <Text style={s.rowHint}>{hint}</Text> : null}
      </View>
      {badge ? (
        <View style={[s.badge, { backgroundColor: tone }]}>
          <Text style={s.badgeText}>{badge > 99 ? "99+" : badge}</Text>
        </View>
      ) : null}
      <Ionicons name="chevron-forward" size={17} color={c.mutedSoft} />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.background },
  scroll: { padding: Space.lg, paddingBottom: 150 },
  title: { fontFamily: Fonts.bold, fontSize: 22, color: c.foreground },
  who: { flexDirection: "row", alignItems: "center", gap: Space.md },
  avatar: {
    width: 46, height: 46, borderRadius: Radius.pill, backgroundColor: c.primary,
    alignItems: "center", justifyContent: "center",
  },
  avatarText: { fontFamily: Fonts.bold, fontSize: 16, color: c.onPrimary },
  name: { fontFamily: Fonts.semibold, fontSize: 16, color: c.foreground },
  role: { fontFamily: Fonts.regular, fontSize: 12.5, color: c.muted, marginTop: 1, textTransform: "capitalize" },
  group: {
    fontFamily: Fonts.semibold, fontSize: 12, color: c.mutedSoft,
    textTransform: "uppercase", letterSpacing: 0.6,
    marginTop: Space.xl, marginBottom: Space.md, marginLeft: 2,
  },
  row: { flexDirection: "row", alignItems: "center", gap: Space.md, padding: Space.lg },
  rowIcon: {
    width: 38, height: 38, borderRadius: Radius.md, backgroundColor: c.background,
    alignItems: "center", justifyContent: "center",
  },
  rowLabel: { fontFamily: Fonts.medium, fontSize: 14.5, color: c.foreground },
  rowHint: { fontFamily: Fonts.regular, fontSize: 11.5, color: c.muted, marginTop: 1 },
  badge: {
    minWidth: 22, height: 22, borderRadius: Radius.pill,
    alignItems: "center", justifyContent: "center", paddingHorizontal: 6,
  },
  badgeText: { fontFamily: Fonts.bold, fontSize: 11, color: "#fff" },
  aboutRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 7 },
  aboutDivider: { borderTopWidth: 1, borderTopColor: c.border, marginTop: 4, paddingTop: 11 },
  aboutLabel: { fontFamily: Fonts.regular, fontSize: 13, color: c.muted },
  aboutValue: { fontFamily: Fonts.medium, fontSize: 13, color: c.foreground, maxWidth: "62%" },
  signOut: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: c.card, borderRadius: Radius.lg, borderWidth: 1,
    borderColor: c.destructiveSoft, paddingVertical: Space.lg,
    marginTop: Space.xxl, ...Shadow.card,
  },
  signOutText: { fontFamily: Fonts.semibold, fontSize: 14.5, color: c.destructive },
});
