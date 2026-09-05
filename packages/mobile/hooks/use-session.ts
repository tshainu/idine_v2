import { useQuery, useQueryClient } from "@tanstack/react-query";
import { clearSession, loadSession, saveSession, type WaiterSession } from "../lib/session";

const KEY = ["session"];

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
  return {
    session: q.data ?? null,
    isLoading: q.isLoading,
    branchId: q.data?.branchId,
    waiterId: q.data?.id,
    waiterName: q.data?.name ?? null,
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
      await saveSession(s);
      qc.setQueryData(KEY, s);
    },
    signOut: async () => {
      await clearSession();
      qc.setQueryData(KEY, null);
      // Drop every cached restaurant read so the next waiter starts clean.
      qc.clear();
    },
  };
}
