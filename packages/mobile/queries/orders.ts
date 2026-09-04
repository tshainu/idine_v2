import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { http } from "../lib/http";
import type { CartLine, Order, OrderItem } from "../lib/types";

// ── Reads ─────────────────────────────────────────────────────────────────────

export function useOrders(
  branchId: number | undefined,
  opts?: { status?: string; poll?: number | false },
) {
  return useQuery({
    queryKey: ["orders", branchId, opts?.status ?? "all"],
    enabled: !!branchId,
    refetchInterval: opts?.poll === false ? false : (opts?.poll ?? 30_000),
    queryFn: async () => {
      const data = await http.get<{ orders: Order[] }>("/orders", {
        branchId,
        status: opts?.status,
      });
      return data.orders ?? [];
    },
  });
}

export function useOrder(id: number | undefined) {
  return useQuery({
    queryKey: ["order", id],
    enabled: !!id,
    queryFn: async () => {
      const data = await http.get<{ order: Order; items: OrderItem[] }>(`/orders/${id}`);
      return { ...data.order, items: data.items ?? [] } as Order;
    },
  });
}

/** The open order for a table, if any — a waiter adding a round must append, not duplicate. */
export function useOpenOrderForTable(branchId: number | undefined, tableId: number | undefined) {
  const q = useOrders(branchId, { poll: 30_000 });
  const OPEN = ["pending", "confirmed", "served", "ready", "hold"];
  const order = tableId
    ? (q.data ?? []).find((o) => o.tableId === tableId && OPEN.includes(o.status))
    : undefined;
  return { ...q, order };
}

// ── Writes ────────────────────────────────────────────────────────────────────

function lineToItem(l: CartLine, orderId: number) {
  const modTotal = l.modifiers.reduce((s, m) => s + m.price, 0);
  const noteParts: string[] = [];
  if (l.modifiers.length) noteParts.push(l.modifiers.map((m) => m.name).join(", "));
  if (l.note.trim()) noteParts.push(l.note.trim());
  if (l.course && l.course !== "main") noteParts.push(`[${l.course}]`);
  return {
    orderId,
    menuItemId: l.menuItemId,
    name: l.name,
    // Modifier surcharges ride on the unit price so the order total stays correct.
    price: l.unitPrice + modTotal,
    qty: l.qty,
    printerId: l.printerId,
    kotPrinted: false,
    note: noteParts.length ? noteParts.join(" • ") : null,
  };
}

/**
 * Sends the cart to the kitchen: creates the order when the table has none open,
 * then bulk-inserts the lines. Server computes each item's total.
 */
export function useSendToKitchen(branchId: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      existingOrderId?: number;
      tableId: number | null;
      tableName?: string | null;
      lines: CartLine[];
      waiterId: number | null;
      waiterName?: string | null;
      customerName?: string | null;
      customerId?: number | null;
      notes?: string | null;
      type?: string;
    }) => {
      const subtotal = input.lines.reduce(
        (s, l) => s + (l.unitPrice + l.modifiers.reduce((m, x) => m + x.price, 0)) * l.qty,
        0,
      );

      let orderId = input.existingOrderId;
      let order: Order;

      if (orderId) {
        const prev = await http.get<{ order: Order; items: OrderItem[] }>(`/orders/${orderId}`);
        const res = await http.patch<{ order: Order }>(`/orders/${orderId}`, {
          subtotal: (prev.order.subtotal ?? 0) + subtotal,
          total: (prev.order.total ?? 0) + subtotal,
          status: prev.order.status === "hold" ? "pending" : prev.order.status,
        });
        order = res.order;
      } else {
        const res = await http.post<{ order: Order }>("/orders", {
          branchId,
          orderNumber: "TEMP",
          type: input.type ?? "dine-in",
          status: "pending",
          tableId: input.tableId,
          waiterId: input.waiterId,
          customerId: input.customerId ?? null,
          customerName: input.customerName ?? null,
          notes: input.notes ?? null,
          placedBy: input.waiterName ?? null,
          subtotal,
          discount: 0,
          serviceCharge: 0,
          tipAmount: 0,
          total: subtotal,
          amountPaid: 0,
          kotPrinted: false,
          source: "waiter-app",
        });
        order = res.order;
        orderId = order.id;
      }

      const res = await http.post<{ orderItems: OrderItem[] }>("/order-items/bulk", {
        items: input.lines.map((l) => lineToItem(l, orderId!)),
      });

      // A new dine-in order means the table is now occupied.
      if (!input.existingOrderId && input.tableId) {
        await http
          .patch(`/tables/${input.tableId}`, { status: "occupied" })
          .catch(() => undefined);
      }

      return { order, items: res.orderItems ?? [] };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["tables"] });
    },
  });
}

export function useUpdateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: number } & Partial<Order>) =>
      http.patch<{ order: Order }>(`/orders/${id}`, patch),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["order", v.id] });
    },
  });
}

/** Records a tip against an order. Tips are credited to the waiter, never to revenue. */
export function useAddTip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, tipAmount }: { id: number; tipAmount: number }) =>
      http.patch<{ order: Order }>(`/orders/${id}`, { tipAmount }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orders"] }),
  });
}

export function useDeleteOrderItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => http.del<{ ok: boolean }>(`/order-items/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orders"] }),
  });
}
