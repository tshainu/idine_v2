import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { getBranchId } from "../lib/store";
import { Spinner } from "../components/ui/spinner";
import { CheckCircle, Clock, ChefHat, Printer } from "lucide-react";

const TYPE_COLORS: Record<string, string> = {
  "dine-in": "var(--color-gold)",
  takeaway: "var(--color-purple-light)",
  delivery: "var(--color-info)",
};

function elapsed(date: string | Date): string {
  const ms = Date.now() - new Date(date).getTime();
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function urgencyColor(date: string | Date): string {
  const ms = Date.now() - new Date(date).getTime();
  const m = Math.floor(ms / 60000);
  if (m >= 15) return "var(--color-danger)";
  if (m >= 8) return "var(--color-warning)";
  return "var(--color-success)";
}

export default function KDSPage() {
  const branchId = getBranchId();
  const qc = useQueryClient();
  const [selectedPrinter, setSelectedPrinter] = useState<number | null>(null);
  const [tick, setTick] = useState(0);

  // Timer to update elapsed display
  useState(() => {
    const interval = setInterval(() => setTick(t => t + 1), 10000);
    return () => clearInterval(interval);
  });

  const { data: ordersData, isLoading } = useQuery({
    queryKey: ["kds-orders", branchId, "confirmed"],
    queryFn: async () => {
      const res = await api.orders.$get({ query: { branchId: String(branchId), status: "confirmed" } });
      return res.json();
    },
    refetchInterval: 8000,
  });

  const { data: printersData } = useQuery({
    queryKey: ["printers", branchId],
    queryFn: async () => (await api.printers.$get({ query: { branchId: String(branchId) } })).json(),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) =>
      (await api.orders[":id"].$patch({ param: { id: String(id) }, json: { status } })).json(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["kds-orders"] }),
  });

  const orders = (ordersData as any)?.orders || [];
  const printers = ((printersData as any)?.printers || []).filter((p: any) => p.type === "kot");

  const displayOrders = selectedPrinter
    ? orders // In real scenario, filter by printer station
    : orders;

  return (
    <div className="min-h-screen" style={{ background: "var(--color-bg)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "var(--color-gold)" }}>
            <ChefHat size={18} color="var(--color-surface)" />
          </div>
          <div>
            <div className="font-bold text-sm" style={{ color: "var(--color-gold)" }}>iDine KDS</div>
            <div className="text-xs" style={{ color: "var(--color-text-dim)" }}>Kitchen Display System</div>
          </div>
        </div>

        {/* Station filter */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSelectedPrinter(null)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
            style={{
              background: !selectedPrinter ? "var(--color-gold)" : "var(--color-surface-2)",
              color: !selectedPrinter ? "var(--color-surface)" : "var(--color-text-muted)",
            }}>
            All Stations
          </button>
          {printers.map((p: any) => (
            <button key={p.id} onClick={() => setSelectedPrinter(p.id)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{
                background: selectedPrinter === p.id ? "var(--color-gold)" : "var(--color-surface-2)",
                color: selectedPrinter === p.id ? "var(--color-surface)" : "var(--color-text-muted)",
                border: "1px solid var(--color-border)",
              }}>
              {p.name}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="text-sm font-bold font-mono" style={{ color: "var(--color-text-muted)" }}>
            {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </div>
          <div className="px-3 py-1 rounded-full text-xs font-bold" style={{ background: "var(--color-success)" + "22", color: "var(--color-success)" }}>
            {displayOrders.length} Active
          </div>
        </div>
      </div>

      {/* Tickets grid */}
      <div className="p-4">
        {isLoading ? (
          <div className="flex justify-center items-center h-64"><Spinner size={32} /></div>
        ) : displayOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-96 gap-4">
            <ChefHat size={60} strokeWidth={1} style={{ color: "var(--color-text-dim)" }} />
            <div className="text-lg font-semibold" style={{ color: "var(--color-text-dim)" }}>All clear! No pending orders.</div>
          </div>
        ) : (
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
            {displayOrders.map((order: any, idx: number) => (
              <div key={order.id}
                className="rounded-2xl overflow-hidden animate-ticket-in"
                style={{
                  background: "var(--color-surface)",
                  border: `2px solid ${TYPE_COLORS[order.type] || "var(--color-border)"}`,
                  animationDelay: `${idx * 60}ms`,
                }}>
                {/* Ticket header */}
                <div className="flex items-center justify-between px-4 py-3"
                  style={{ background: (TYPE_COLORS[order.type] || "var(--color-border)") + "22" }}>
                  <div>
                    <div className="font-bold text-lg font-mono" style={{ color: "var(--color-gold)" }}>{order.orderNumber}</div>
                    <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                      {order.type === "dine-in" ? `Table ${order.tableId || "—"}` : order.type.toUpperCase()}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-1 text-xs font-bold"
                      style={{ color: urgencyColor(order.createdAt) }}>
                      <Clock size={12} />
                      {elapsed(order.createdAt)}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: "var(--color-text-dim)" }}>
                      {new Date(order.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                </div>

                {/* Items */}
                <div className="px-4 py-3 space-y-2">
                  <div className="text-xs font-semibold mb-2" style={{ color: "var(--color-text-dim)" }}>ITEMS</div>
                  {(order.items || []).map((item: any) => (
                    <div key={item.id} className="flex gap-2 text-sm" style={{ color: "var(--color-text)" }}>
                      <span className="font-bold" style={{ color: "var(--color-gold)" }}>{item.qty}×</span>
                      <div>
                        <div className="font-medium">{item.name}</div>
                        {item.note && <div className="text-xs" style={{ color: "var(--color-warning)" }}>{item.note}</div>}
                      </div>
                    </div>
                  ))}
                  {order.customerName && (
                    <div className="text-xs pt-2 mt-2 border-t" style={{ color: "var(--color-text-muted)", borderColor: "var(--color-border)" }}>
                      Customer: {order.customerName}
                    </div>
                  )}
                  {order.placedBy && (
                    <div className="text-xs" style={{ color: "var(--color-text-dim)" }}>
                      Waiter: {order.placedBy}
                    </div>
                  )}
                  {order.notes && (
                    <div className="text-xs p-2 rounded" style={{ background: "var(--color-warning)" + "22", color: "var(--color-warning)", border: "1px solid var(--color-warning)" }}>
                      ⚠ {order.notes}
                    </div>
                  )}
                </div>

                {/* Action */}
                <div className="px-4 pb-4">
                  <button
                    onClick={() => updateStatus.mutate({ id: order.id, status: "ready" })}
                    disabled={updateStatus.isPending}
                    className="w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all hover:brightness-110 disabled:opacity-60"
                    style={{ background: "var(--color-success)", color: "#fff" }}>
                    {updateStatus.isPending ? <Spinner size={16} /> : <><CheckCircle size={16} /> Cooked · Alert Waiter</>}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
