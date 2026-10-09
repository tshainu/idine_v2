import { useQuery, useQueryClient } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { clearSession, loadSession, saveSession, type WaiterSession } from "../lib/session";
import { http } from "../lib/http";

const KEY = ["session"];
const QUERY_CACHE_KEY = "idine-waiter-query-cache-v1";

/**
 * The signed-in waiter, read through react-query so every screen shares one
 * AsyncStorage read and all of them re-render together on login/logout.
 */
export function useSession() {
  const q = useQuery({
    queryKey: KEY,
    queryFn: loadSession,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });
  const config = useQuery({
    queryKey: ["waiter-config", q.data?.id, q.data?.branchId],
    enabled: !!q.data?.id && !!q.data?.branchId,
    staleTime: 30_000,
    queryFn: async () => {
      const data = await http.get<{ users: Array<{ id: number; accessibleTableIds?: string | null; linkedCashierId?: number | null }>; }>("/users", { branchId: q.data!.branchId });
      const user = data.users.find((candidate) => candidate.id === q.data!.id);
      let allowedTableIds: number[] | null = null;
      try {
        const parsed = user?.accessibleTableIds ? JSON.parse(user.accessibleTableIds) : null;
        if (Array.isArray(parsed)) allowedTableIds = parsed.map(Number).filter(Number.isFinite);
      } catch { allowedTableIds = null; }
      return { allowedTableIds, linkedCashierId: user?.linkedCashierId ?? null };
    },
  });
  return {
    session: q.data ?? null,
    isLoading: q.isLoading,
    branchId: q.data?.branchId,
    waiterId: q.data?.id,
    waiterName: q.data?.name ?? null,
    allowedTableIds: config.data?.allowedTableIds ?? null,
    linkedCashierId: config.data?.linkedCashierId ?? null,
  };
}

export function useSessionActions() {
  const qc = useQueryClient();
  return {
    signIn: async (s: WaiterSession) => {
      // A device can be handed directly to another waiter. Clear every cached
      // restaurant read before installing the new identity so no prior order
      // briefly appears under the new account.
      qc.clear();
      await AsyncStorage.removeItem(QUERY_CACHE_KEY);
      await saveSession(s);
      qc.setQueryData(KEY, s);
    },
    signOut: async () => {
      await clearSession();
      // Drop every cached restaurant read so the next waiter starts clean.
      qc.clear();
      await AsyncStorage.removeItem(QUERY_CACHE_KEY);
      // Set this after clear(): otherwise clearing the query cache removes the
      // null session and the persisted cache can immediately restore the old one.
      qc.setQueryData(KEY, null);
    },
  };
}
