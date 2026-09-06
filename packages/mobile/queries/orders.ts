import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { http } from "../lib/http";
import type { CartLine, Order, OrderItem } from "../lib/types";

// ── Reads ─────────────────────────────────────────────────────────────────────

export function useOrders(
  branchId: number | undefined,
  opts?: { status?: string; poll?: number | false; waiterId?: number },
) {
  return useQuery({
    queryKey: ["orders", branchId, opts?.status ?? "all", opts?.waiterId ?? "all-waiters"],
    enabled: !!branchId,
    refetchInterval: opts?.poll === false ? false : (opts?.poll ?? 30_000),
    queryFn: async () => {
      const data = await http.get<{ orders: Order[] }>("/orders", {
        branchId,
        status: opts?.status,
      });
      const orders = data.orders ?? [];
      return opts?.waiterId ? orders.filter((order) => order.waiterId === opts.waiterId) : orders;
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
export function useOpenOrderForTable(
  branchId: number | undefined,
  tableId: number | undefined,
  waiterId?: number | undefined,
) {
  const q = useOrders(branchId, { poll: 30_000, waiterId });
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
          // Any added round must return to the KDS cooking queue, even when the
          // earlier round was already marked ready or served.
          status: "confirmed",
          customerId: input.customerId ?? prev.order.customerId ?? null,
          customerName: input.customerName?.trim() || prev.order.customerName || null,
        });
        order = res.order;
      } else {
        const res = await http.post<{ order: Order }>("/orders", {
          branchId,
          orderNumber: "TEMP",
          type: input.type ?? "dine-in",
          // KDS polls confirmed orders, so a waiter submission must enter that
          // state immediately after it is accepted by the API.
          status: "confirmed",
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

export function useUpdateRunningOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      orderId: number;
      customerId?: number | null;
      customerName?: string | null;
      updates: { id: number; qty: number; note?: string | null }[];
      removeIds: number[];
      additions: CartLine[];
    }) => {
      const current = await http.get<{ order: Order; items: OrderItem[] }>(`/orders/${input.orderId}`);
      const removed = new Set(input.removeIds);
      const changed = new Map(input.updates.map((item) => [item.id, item]));
      const keptTotal = (current.items ?? []).reduce((sum, item) => {
        if (removed.has(item.id)) return sum;
        const next = changed.get(item.id);
        return sum + item.price * (next?.qty ?? item.qty);
      }, 0);
      const additionsTotal = input.additions.reduce(
        (sum, line) => sum + (line.unitPrice + line.modifiers.reduce((m, x) => m + x.price, 0)) * line.qty,
        0,
      );
      const nextTotal = keptTotal + additionsTotal;

      const orderRes = await http.patch<{ order: Order }>(`/orders/${input.orderId}`, {
        subtotal: nextTotal,
        total: nextTotal,
        customerId: input.customerId ?? null,
        customerName: input.customerName?.trim() || null,
        // Edited items need kitchen confirmation again.
        status: "confirmed",
      });

      await Promise.all([
        ...input.updates.map((item) =>
          http.patch(`/order-items/${item.id}`, { qty: item.qty, note: item.note ?? null }),
        ),
        ...input.removeIds.map((id) => http.del(`/order-items/${id}`)),
      ]);

      if (input.additions.length) {
        await http.post("/order-items/bulk", {
          items: input.additions.map((line) => lineToItem(line, input.orderId)),
        });
      }

      const final = await http.get<{ order: Order; items: OrderItem[] }>(`/orders/${input.orderId}`);
      // Return the fully reloaded order so the UI and KOT use the exact final item
      // set and totals rather than an earlier patch response.
      return { order: final.order, items: final.items ?? [] };
    },
    onSuccess: (_d, input) => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["order", input.orderId] });
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
