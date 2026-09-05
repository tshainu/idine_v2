import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { http } from "../lib/http";
import type { Customer, Order } from "../lib/types";

/** Customer lookup by name or phone. The API does the LIKE match on both columns. */
export function useCustomerSearch(search: string, branchId: number | undefined) {
  const term = search.trim();
  return useQuery({
    queryKey: ["customers", branchId, term],
    enabled: !!branchId && term.length >= 1,
    staleTime: 10_000,
    queryFn: async () => {
      const data = await http.get<{ customers: Customer[] }>("/customers", {
        branchId,
        search: term,
      });
      // The current VPS search endpoint may return cross-branch matches when a
      // search term is present, so enforce branch isolation on the device too.
      return (data.customers ?? []).filter((customer) => customer.branchId === branchId);
    },
  });
}

export function useCustomer(id: number | undefined) {
  return useQuery({
    queryKey: ["customer", id],
    enabled: !!id,
    queryFn: async () => {
      const data = await http.get<{ customers: Customer[] }>("/customers", {});
      return (data.customers ?? []).find((c) => c.id === id) ?? null;
    },
  });
}

/** Past orders for a customer — lets the waiter say "the usual?". */
export function useCustomerOrders(branchId: number | undefined, customerId: number | undefined) {
  return useQuery({
    queryKey: ["customer-orders", branchId, customerId],
    enabled: !!branchId && !!customerId,
    queryFn: async () => {
      const data = await http.get<{ orders: Order[] }>("/orders", { branchId });
      return (data.orders ?? []).filter((o) => o.customerId === customerId).slice(0, 20);
    },
  });
}

export function useCreateCustomer(branchId: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; phone?: string | null; email?: string | null }) => {
      const data = await http.post<{ customer: Customer }>("/customers", {
        branchId,
        name: input.name,
        phone: input.phone ?? null,
        email: input.email ?? null,
      });
      return data.customer;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customers"] }),
  });
}
