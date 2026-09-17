import { useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Fonts, Radius, Shadow, Space } from "../../constants/theme";
import { Loading, EmptyState, ErrorBanner } from "../../components/ui";
import { useSession } from "../../hooks/use-session";
import { useTables } from "../../queries/tables";
import type { Table } from "../../lib/types";

const c = Colors.light;

export default function TablesScreen() {
  const router = useRouter();
  const { branchId } = useSession();
  const tables = useTables(branchId);
  const [zone, setZone] = useState<string>("all");

  const zones = useMemo(() => {
    const set = new Set<string>();
    for (const table of tables.data ?? []) if (table.zone) set.add(table.zone);
    return ["all", ...[...set].sort()];
  }, [tables.data]);
  const shown = zone === "all"
    ? (tables.data ?? [])
    : (tables.data ?? []).filter((table) => table.zone === zone);

  if (tables.isLoading && !tables.data) {
    return (
      <SafeAreaView style={s.safe} edges={["top", "left", "right"]}>
        <Loading label="Loading tables…" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={["top", "left", "right"]}>
      <View style={s.head}>
        <Text style={s.title}>Tables</Text>
        <TouchableOpacity
          style={s.iconBtn}
          activeOpacity={0.8}
          onPress={() => tables.refetch()}
        >
          <Ionicons name="refresh" size={19} color={c.foreground} />
        </TouchableOpacity>
      </View>

      {zones.length > 2 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.zones}>
          {zones.map((z) => {
            const on = z === zone;
            return (
              <TouchableOpacity
                key={z}
                onPress={() => setZone(z)}
                activeOpacity={0.8}
                style={[s.zone, on && { backgroundColor: c.chrome, borderColor: c.chrome }]}
              >
                <Text style={[s.zoneText, on && { color: c.onChrome }]}>
                  {z === "all" ? "All areas" : z}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : null}

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={tables.isFetching}
            onRefresh={() => tables.refetch()}
            tintColor={c.primary}
          />
        }
      >
        {tables.error ? (
          <ErrorBanner message={(tables.error as Error).message} onRetry={() => tables.refetch()} />
        ) : null}

        {shown.length === 0 ? (
          <EmptyState
            icon="restaurant-outline"
            title="No tables here"
            hint="Ask your manager to add tables for this branch in the admin panel."
          />
        ) : (
          <View style={s.grid}>
            {shown.map((table) => (
              <TableTile
                key={table.id}
                table={table}
                onPress={() => router.push(`/order/${table.id}?new=1`)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function TableTile({ table, onPress }: { table: Table; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.82} style={s.tile}>
      <Text style={s.tileName} numberOfLines={1}>{table.name}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.background },
  head: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: Space.lg, paddingTop: Space.md, paddingBottom: Space.md,
  },
  title: { fontFamily: Fonts.bold, fontSize: 22, color: c.foreground },
  iconBtn: {
    width: 40, height: 40, borderRadius: Radius.md, backgroundColor: c.card,
    borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center",
  },
  zones: { paddingHorizontal: Space.lg, gap: Space.sm, paddingBottom: Space.md },
  zone: {
    paddingHorizontal: Space.lg, paddingVertical: 7, borderRadius: Radius.pill,
    backgroundColor: c.card, borderWidth: 1, borderColor: c.border,
  },
  zoneText: { fontFamily: Fonts.medium, fontSize: 12.5, color: c.muted },
  scroll: { padding: Space.lg, paddingTop: 0, paddingBottom: 150 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: Space.md },
  tile: {
    width: "48%", flexGrow: 1, minHeight: 78, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: c.border, backgroundColor: c.card,
    padding: Space.lg, alignItems: "center", justifyContent: "center", ...Shadow.card,
  },
  tileName: { fontFamily: Fonts.bold, fontSize: 22, color: c.foreground, textAlign: "center" },
});
