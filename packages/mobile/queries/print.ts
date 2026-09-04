import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { http } from "../lib/http";
import type { Order, OrderItem } from "../lib/types";
import { kotPreviewText, type KotItem, type KotPayload } from "../lib/escpos";
import { loadPrinterConfig, printKot } from "../lib/printer";

// Items are grouped per kitchen station (printerId) so the hot kitchen, bar and
// dessert counter each get only their own lines.
function groupByPrinter(items: OrderItem[]): Map<number | null, OrderItem[]> {
  const map = new Map<number | null, OrderItem[]>();
  for (const it of items) {
    const key = it.printerId ?? null;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(it);
  }
  return map;
}

function toKotItems(items: OrderItem[]): KotItem[] {
  return items.map((i) => ({ name: i.name, qty: i.qty, notes: i.note }));
}

/**
 * Queues one server-side print job per station. `idempotencyKey` is derived from the
 * order + station + the exact item ids, so a retry after a dropped response never
 * prints the same ticket twice. Reprints pass a `nonce` to deliberately bypass that.
 */
async function queueJobs(input: {
  order: Order;
  items: OrderItem[];
  branchId: number | null;
  type: "kot" | "reprint";
  tableName?: string | null;
  waiterName?: string | null;
  nonce?: string;
}) {
  const groups = groupByPrinter(input.items);
  const jobs = [...groups.entries()].map(([printerId, items]) => {
    const payload: KotPayload = {
      orderNumber: input.order.orderNumber,
      tableName: input.tableName ?? null,
      waiterName: input.waiterName ?? null,
      customerName: input.order.customerName,
      type: input.order.type,
      items: toKotItems(items),
      mode: input.type === "reprint" ? "update" : "new",
      printedAt: new Date(),
    };
    const ids = items.map((i) => i.id).sort((a, b) => a - b).join(".");
    return {
      branchId: input.branchId,
      orderId: input.order.id,
      printerId,
      idempotencyKey: `${input.type}-${input.order.id}-${printerId ?? "any"}-${ids}${
        input.nonce ? `-${input.nonce}` : ""
      }`,
      type: input.type,
      status: "pending",
      payload: JSON.stringify(payload),
    };
  });

  if (!jobs.length) return [];
  const res = await http.post<{ printJobs: unknown[] }>("/print-jobs/batch", { jobs });
  return res.printJobs ?? [];
}

/**
 * Prints a KOT for freshly sent items: tries the waiter's own printer first and always
 * falls back to the server queue, so a ticket is never silently lost.
 */
export function useSendKot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      order: Order;
      items: OrderItem[];
      branchId: number | null;
      tableName?: string | null;
      waiterName?: string | null;
    }) => {
      const config = await loadPrinterConfig();
      const groups = groupByPrinter(input.items);
      // One combined ticket for the waiter's own printer; the server queue splits per station.
      const payload: KotPayload = {
        orderNumber: input.order.orderNumber,
        tableName: input.tableName ?? null,
        waiterName: input.waiterName ?? null,
        customerName: input.order.customerName,
        type: input.order.type,
        items: toKotItems(input.items),
        mode: "new",
        printedAt: new Date(),
      };

      const result = await printKot(payload, config, async () => {
        await queueJobs({ ...input, type: "kot" });
      });

      // Mark the printed lines so the next round only prints what is new.
      if (result.ok) {
        await Promise.all(
          input.items.map((i) =>
            http.patch(`/order-items/${i.id}`, { kotPrinted: true }).catch(() => undefined),
          ),
        );
        await http
          .patch(`/orders/${input.order.id}`, { kotPrinted: true })
          .catch(() => undefined);
      }

      return { ...result, stations: groups.size };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
  });
}

/** Explicit KOT reprint — the user asked for this specifically. Always makes a new ticket. */
export function useReprintKot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      order: Order;
      items: OrderItem[];
      branchId: number | null;
      tableName?: string | null;
      waiterName?: string | null;
    }) => {
      const config = await loadPrinterConfig();
      const nonce = String(Date.now());
      const payload: KotPayload = {
        orderNumber: input.order.orderNumber,
        tableName: input.tableName ?? null,
        waiterName: input.waiterName ?? null,
        customerName: input.order.customerName,
        type: input.order.type,
        items: toKotItems(input.items),
        mode: "update",
        printedAt: new Date(),
      };
      return printKot(payload, config, async () => {
        await queueJobs({ ...input, type: "reprint", nonce });
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["print-jobs"] }),
  });
}

/** Plain-text ticket preview so the waiter can check a KOT before printing. */
export function kotPreview(
  order: Order,
  items: OrderItem[],
  tableName: string | null | undefined,
  waiterName: string | null | undefined,
  width: 32 | 48 = 32,
) {
  return kotPreviewText(
    {
      orderNumber: order.orderNumber,
      tableName: tableName ?? null,
      waiterName: waiterName ?? null,
      customerName: order.customerName,
      type: order.type,
      items: toKotItems(items),
      mode: "new",
      printedAt: new Date(),
    },
    width,
  );
}

/** Pending server print jobs — surfaced in More → so staff can see a stuck queue. */
export function usePendingPrintJobs(branchId: number | undefined) {
  return useQuery({
    queryKey: ["print-jobs", branchId],
    enabled: !!branchId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const data = await http.get<{ printJobs: { id: number; type: string; status: string }[] }>(
        "/print-jobs",
        { branchId, status: "pending" },
      );
      return data.printJobs ?? [];
    },
  });
}
