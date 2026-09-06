import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, Platform, Vibration, AppState,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import { Colors, Fonts, Radius, Shadow, Space } from "../constants/theme";
import { useSession } from "../hooks/use-session";
import { useOrders } from "../queries/orders";
import { lkr, elapsed } from "../lib/format";
import type { Order } from "../lib/types";

const c = Colors.light;

// A cooked order goes cold fast: the alert must ring loudly and keep ringing
// until a human acknowledges it, not fire one notification chime and vanish.
const RING = require("../assets/ready-alert.mp3");
const VIBRATE_PATTERN = [0, 700, 400];
const POLL_MS = 5_000;

type ReadyAlertApi = {
  /** Stops the ring and marks every currently ringing order as seen. */
  acknowledge: () => void;
  ringing: boolean;
};

const Ctx = createContext<ReadyAlertApi>({ acknowledge: () => {}, ringing: false });

/** Screens that show the ready queue call this on mount to kill the ring. */
export function useReadyAlert() {
  return useContext(Ctx);
}

export function ReadyAlertProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { branchId, waiterId } = useSession();
  // Branch-wide poll: orders raised at the POS carry no waiterId, and those must
  // still ring for whoever is on the floor.
  const orders = useOrders(branchId, { poll: POLL_MS });

  const [alerting, setAlerting] = useState<Order[]>([]);
  const seen = useRef<Set<number>>(new Set());
  const player = useRef<AudioPlayer | null>(null);
  const ringing = alerting.length > 0;

  // ── Player: created once, loops, at full volume, audible on silent mode ──
  useEffect(() => {
    if (Platform.OS === "web") return;
    let p: AudioPlayer | null = null;
    try {
      p = createAudioPlayer(RING);
      p.loop = true;
      p.volume = 1;
      player.current = p;
      setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: true,
        interruptionMode: "doNotMix",
        shouldRouteThroughEarpiece: false,
      }).catch(() => {});
    } catch {
      player.current = null;
    }
    return () => {
      try { p?.remove(); } catch {}
      player.current = null;
    };
  }, []);

  const stopRing = useCallback(() => {
    Vibration.cancel();
    const p = player.current;
    if (!p) return;
    try {
      p.pause();
      p.seekTo(0);
    } catch {}
  }, []);

  const startRing = useCallback(() => {
    if (Platform.OS === "web") return;
    Vibration.vibrate(VIBRATE_PATTERN, true);
    const p = player.current;
    if (!p) return;
    try {
      p.volume = 1;
      p.loop = true;
      p.seekTo(0);
      p.play();
    } catch {}
  }, []);

  // ── Watch for freshly cooked orders ──
  useEffect(() => {
    const ready = (orders.data ?? []).filter(
      (o) => o.status === "ready" && (!waiterId || !o.waiterId || o.waiterId === waiterId),
    );
    const readyIds = new Set(ready.map((o) => o.id));

    // An order that left "ready" (served elsewhere) may cook again later.
    for (const id of [...seen.current]) if (!readyIds.has(id)) seen.current.delete(id);

    const fresh = ready.filter((o) => !seen.current.has(o.id));
    if (fresh.length) {
      setAlerting((prev) => {
        const merged = [...prev];
        for (const o of fresh) if (!merged.some((m) => m.id === o.id)) merged.push(o);
        return merged;
      });
    }

    // Drop anything that stopped being ready while the banner was up.
    setAlerting((prev) => {
      const kept = prev.filter((o) => readyIds.has(o.id));
      return kept.length === prev.length ? prev : kept;
    });
  }, [orders.data, waiterId]);

  // ── Ring exactly while something is unacknowledged ──
  useEffect(() => {
    if (ringing) startRing();
    else stopRing();
    return () => {};
  }, [ringing, startRing, stopRing]);

  // Android kills looping vibration when the app is backgrounded and restores
  // nothing on return — restart it so the ring survives a pocketed phone.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && ringing) startRing();
    });
    return () => sub.remove();
  }, [ringing, startRing]);

  useEffect(() => () => stopRing(), [stopRing]);

  const acknowledge = useCallback(() => {
    setAlerting((prev) => {
      for (const o of prev) seen.current.add(o.id);
      return [];
    });
    stopRing();
  }, [stopRing]);

  const api = useMemo<ReadyAlertApi>(() => ({ acknowledge, ringing }), [acknowledge, ringing]);

  const first = alerting[0];

  return (
    <Ctx.Provider value={api}>
      {children}
      <Modal visible={ringing} transparent animationType="fade" onRequestClose={acknowledge}>
        <View style={s.backdrop}>
          <View style={s.card}>
            <View style={s.badge}>
              <Ionicons name="notifications" size={30} color={c.onChrome} />
            </View>

            <Text style={s.title}>
              {alerting.length > 1 ? `${alerting.length} orders cooked` : "Order cooked"}
            </Text>
            <Text style={s.sub}>
              {alerting.length > 1
                ? alerting.map((o) => o.orderNumber).join(", ")
                : `${first?.orderNumber ?? ""} is ready for pickup`}
            </Text>

            {first ? (
              <View style={s.meta}>
                <Text style={s.metaLine}>
                  {first.items?.length ?? 0} items · {lkr(first.total)}
                </Text>
                <Text style={s.metaLine}>Placed {elapsed(first.createdAt)}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={s.primary}
              activeOpacity={0.85}
              onPress={() => {
                acknowledge();
                router.push("/ready-items");
              }}
            >
              <Ionicons name="restaurant" size={17} color={c.onChrome} />
              <Text style={s.primaryText}>Open pickup list</Text>
            </TouchableOpacity>

            <TouchableOpacity style={s.ghost} activeOpacity={0.7} onPress={acknowledge}>
              <Text style={s.ghostText}>Silence</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </Ctx.Provider>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: "#0B1B2Bcc",
    alignItems: "center", justifyContent: "center", padding: Space.xl,
  },
  card: {
    width: "100%", maxWidth: 380, backgroundColor: c.card, borderRadius: Radius.xl,
    padding: Space.xl, alignItems: "center", gap: Space.sm, ...Shadow.card,
  },
  badge: {
    width: 62, height: 62, borderRadius: Radius.pill, backgroundColor: c.success,
    alignItems: "center", justifyContent: "center", marginBottom: Space.sm,
  },
  title: { fontFamily: Fonts.bold, fontSize: 21, color: c.foreground, textAlign: "center" },
  sub: { fontFamily: Fonts.regular, fontSize: 13.5, color: c.muted, textAlign: "center" },
  meta: {
    marginTop: Space.sm, marginBottom: Space.md, alignItems: "center", gap: 2,
  },
  metaLine: { fontFamily: Fonts.medium, fontSize: 12.5, color: c.muted },
  primary: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: Space.sm,
    alignSelf: "stretch", height: 50, borderRadius: Radius.md, backgroundColor: c.chrome,
  },
  primaryText: { fontFamily: Fonts.bold, fontSize: 15, color: c.onChrome },
  ghost: { alignSelf: "stretch", height: 44, alignItems: "center", justifyContent: "center" },
  ghostText: { fontFamily: Fonts.medium, fontSize: 13.5, color: c.muted },
});
