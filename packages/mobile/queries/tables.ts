import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { http } from "../lib/http";
import type { Table } from "../lib/types";

export function useTables(branchId: number | undefined, opts?: { poll?: boolean }) {
  return useQuery({
    queryKey: ["tables", branchId],
    enabled: !!branchId,
    queryFn: async () => {
      const data = await http.get<{ tables: Table[] }>("/tables", { branchId });
      return (data.tables ?? []).filter((t) => t.isActive);
    },
    refetchInterval: opts?.poll === false ? false : 20_000,
  });
}

export function useSetTableStatus(branchId: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) =>
      http.patch<{ table: Table }>(`/tables/${id}`, { status }),
    // Optimistic: the floor grid must recolour the moment the waiter taps.
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: ["tables", branchId] });
      const prev = qc.getQueryData<Table[]>(["tables", branchId]);
      qc.setQueryData<Table[]>(["tables", branchId], (old) =>
        (old ?? []).map((t) => (t.id === id ? { ...t, status } : t)));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["tables", branchId], ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["tables", branchId] });
    },
  });
}
