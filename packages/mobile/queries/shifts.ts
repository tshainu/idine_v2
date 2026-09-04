import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { http, ApiError } from "../lib/http";
import type { Shift } from "../lib/types";
import { startOfWeek } from "../lib/format";

/** The waiter's currently open shift, or null when clocked out. */
export function useActiveShift(userId: number | undefined) {
  return useQuery({
    queryKey: ["shift-active", userId],
    enabled: !!userId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const data = await http.get<{ shift: Shift | null }>("/shifts/active", { userId });
      return data.shift ?? null;
    },
  });
}

/** This week's shifts for the waiter, newest first. */
export function useMyShifts(userId: number | undefined, branchId: number | undefined) {
  return useQuery({
    queryKey: ["shifts", userId, branchId],
    enabled: !!userId,
    queryFn: async () => {
      const data = await http.get<{ shifts: Shift[] }>("/shifts", {
        userId,
        branchId,
        since: startOfWeek().getTime(),
      });
      return data.shifts ?? [];
    },
  });
}

export function useClockIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      userId: number;
      branchId: number | null;
      userName: string | null;
    }) => {
      const data = await http.post<{ shift: Shift; alreadyOpen?: boolean }>("/shifts/clock-in", {
        ...input,
        device: "waiter-app",
      });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shift-active"] });
      qc.invalidateQueries({ queryKey: ["shifts"] });
    },
  });
}

export function useClockOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: number) => {
      try {
        const data = await http.post<{ shift: Shift }>("/shifts/clock-out", { userId });
        return data.shift;
      } catch (e) {
        // Already clocked out on another device — treat as success, not an error.
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shift-active"] });
      qc.invalidateQueries({ queryKey: ["shifts"] });
    },
  });
}
