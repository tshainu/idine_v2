import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { getBranchId } from "../lib/store";
import { Sidebar } from "../components/layout/sidebar";
import { Search, Download, ArrowUp, ArrowDown, ArrowUpDown, Eye, X } from "lucide-react";
import { exportToCSV } from "../lib/csv";

const GOLD = "var(--color-gold)";
const BG = "var(--color-bg)";
const SURF = "var(--color-surface)";
const BORD = "var(--color-border)";
const MUTED = "var(--color-text-muted)";
const DIM = "var(--color-text-dim)";
const TEXT = "var(--color-text)";
const PURPLE = "var(--color-purple)";

const STATUS_COLOR: Record<string, string> = {
  open: "var(--color-success)",
  draft: "var(--color-gold)",
  completed: "var(--color-info)",
  billed: "var(--color-purple-light)",
  cancelled: "var(--color-danger)",
};

const TYPE_COLOR: Record<string, string> = {
  "dine-in": "var(--color-success)",
  takeaway: "var(--color-gold)",
  delivery: "var(--color-info)",
};

type DateRange = "today" | "week" | "month" | "year" | "custom";

function getDateBounds(range: DateRange, customFrom: string, customTo: string): { from: Date | null; to: Date | null } {
  const now = new Date();
  if (range === "today") {
    const from = new Date(now); from.setHours(0, 0, 0, 0);
    const to = new Date(now); to.setHours(23, 59, 59, 999);
    return { from, to };
  }
  if (range === "week") {
    const from = new Date(now);
    from.setDate(now.getDate() - now.getDay());
    from.setHours(0, 0, 0, 0);
    const to = new Date(now); to.setHours(23, 59, 59, 999);
    return { from, to };
  }
  if (range === "month") {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to = new Date(now); to.setHours(23, 59, 59, 999);
    return { from, to };
  }
  if (range === "year") {
    const from = new Date(now.getFullYear(), 0, 1);
    const to = new Date(now); to.setHours(23, 59, 59, 999);
    return { from, to };
  }
  if (range === "custom") {
    const from = customFrom ? new Date(customFrom + "T00:00:00") : null;
    const to = customTo ? new Date(customTo + "T23:59:59") : null;
    return { from, to };
  }
  return { from: null, to: null };
}

type SortKey = "orderNumber" | "type" | "paymentMethod" | "customerName" | "user" | "items" | "total" | "status" | "createdAt";
type SortDir = "asc" | "desc";

function getPaymentMethod(order: any): string {
  const payments = Array.isArray(order?.payments)
    ? order.payments
    : (() => { try { const parsed = JSON.parse(order?.paymentsJson || "[]"); return Array.isArray(parsed) ? parsed : []; } catch { return []; } })();
  if (payments.length) {
    const methods = payments
      .map((payment: any) => String(payment.method || payment.paymentMethod || "Other").trim())
      .filter(Boolean);
    if (methods.length) return methods.join(" + ");
  }
  return String(order?.paymentMethod || order?.payment_method || "Other").trim() || "Other";
}

export default function SalesPage() {
  const branchId = getBranchId();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterPayment, setFilterPayment] = useState("all");
  const [dateRange, setDateRange] = useState<DateRange>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  const { data: ordersData, isLoading } = useQuery({
    queryKey: ["sales-orders", branchId],
    queryFn: async () => (await api.orders.$get({ query: { branchId: String(branchId) } })).json(),
    refetchInterval: 30000,
  });

  const orders: any[] = (ordersData as any)?.orders || [];
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(null);
  const { data: invoiceHistory, isLoading: historyLoading } = useQuery({
    queryKey: ["invoice-history", branchId, selectedInvoiceId],
    enabled: Boolean(selectedInvoiceId),
    queryFn: async () => (await fetch(`/api/reporting/invoice-history/${selectedInvoiceId}?branchId=${branchId}`)).json(),
  });

  const { from: dateBoundsFrom, to: dateBoundsTo } = getDateBounds(dateRange, customFrom, customTo);

  const filtered = orders.filter((o: any) => {
    const matchSearch = !search || String(o.orderNumber).includes(search) || (o.customerName || "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || o.status === filterStatus;
    const matchType = filterType === "all" || o.type === filterType;
    const matchPayment = filterPayment === "all" || getPaymentMethod(o).split(/\s*\+\s*/).some((method: string) => method.trim().toLowerCase() === filterPayment.toLowerCase());
    let matchDate = true;
    if (dateBoundsFrom || dateBoundsTo) {
      const t = new Date(o.createdAt).getTime();
      if (dateBoundsFrom && t < dateBoundsFrom.getTime()) matchDate = false;
      if (dateBoundsTo && t > dateBoundsTo.getTime()) matchDate = false;
    }
    return matchSearch && matchStatus && matchType && matchPayment && matchDate;
  });

  const sorted = [...filtered].sort((a, b) => {
    let av: any, bv: any;
    if (sortKey === "items") { av = (a.items || []).length; bv = (b.items || []).length; }
    else if (sortKey === "total") { av = Number(a.total || 0); bv = Number(b.total || 0); }
    else if (sortKey === "createdAt") { av = new Date(a.createdAt).getTime(); bv = new Date(b.createdAt).getTime(); }
    else if (sortKey === "orderNumber") { av = Number(a.orderNumber); bv = Number(b.orderNumber); }
    else { av = String(a[sortKey] || ""); bv = String(b[sortKey] || ""); }
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const finalized = filtered.filter(o => ["completed", "billed", "paid"].includes(String(o.status || "").toLowerCase()));
  const totalRevenue = finalized.reduce((s, o) => s + (Number(o.total) || 0), 0);
  const completedRevenue = totalRevenue;

  const DATE_RANGES: { key: DateRange; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "week", label: "This Week" },
    { key: "month", label: "This Month" },
    { key: "year", label: "This Year" },
    { key: "custom", label: "Custom" },
  ];

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: BG }}>
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="h-14 flex items-center justify-between px-6 border-b shrink-0" style={{ background: SURF, borderColor: BORD }}>
          <div className="font-bold text-base" style={{ color: TEXT }}>Sales</div>
          <button onClick={() => exportToCSV("sales", sorted.map(o => ({
              "Order #": o.orderNumber, Date: new Date(o.createdAt).toLocaleString(), Type: o.type,
              User: o.placedBy || (o.cashierId ? `User ${o.cashierId}` : "—"),
              "Payment Method": getPaymentMethod(o),
              Status: o.status, Customer: o.customerName || "Walk-in", Items: (o.items || []).length,
              Total: Number(o.total || 0).toFixed(2),
            })))}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:brightness-110"
            style={{ background: BORD, color: MUTED }}>
            <Download size={13} />
            Export CSV
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Total Orders", value: filtered.length, color: GOLD },
              { label: "Total Revenue", value: `LKR ${totalRevenue.toLocaleString()}`, color: GOLD },
              { label: "Completed Revenue", value: `LKR ${completedRevenue.toLocaleString()}`, color: "var(--color-success)" },
              { label: "Cancelled", value: filtered.filter(o => o.status === "cancelled").length, color: "var(--color-danger)" },
            ].map(c => (
              <div key={c.label} className="rounded-xl p-4 border" style={{ background: SURF, borderColor: BORD }}>
                <div className="text-xl font-bold" style={{ color: c.color }}>{c.value}</div>
                <div className="text-xs mt-0.5" style={{ color: MUTED }}>{c.label}</div>
              </div>
            ))}
          </div>

          {/* Date range toggles */}
          <div className="flex items-center gap-2 flex-wrap">
            {DATE_RANGES.map(r => (
              <button
                key={r.key}
                onClick={() => setDateRange(r.key)}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={{
                  background: dateRange === r.key ? PURPLE : BORD,
                  color: dateRange === r.key ? "#fff" : MUTED,
                  border: `1px solid ${dateRange === r.key ? PURPLE : BORD}`,
                }}
              >
                {r.label}
              </button>
            ))}
            {dateRange === "custom" && (
              <div className="flex items-center gap-2 ml-1">
                <input
                  type="date"
                  value={customFrom}
                  onChange={e => setCustomFrom(e.target.value)}
                  className="px-2 py-1.5 text-xs rounded-lg border outline-none"
                  style={{ background: SURF, borderColor: BORD, color: TEXT }}
                />
                <span className="text-xs" style={{ color: DIM }}>to</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={e => setCustomTo(e.target.value)}
                  className="px-2 py-1.5 text-xs rounded-lg border outline-none"
                  style={{ background: SURF, borderColor: BORD, color: TEXT }}
                />
              </div>
            )}
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3">
            <div className="flex-1 relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: DIM }} />
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search order # or customer..."
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border bg-transparent outline-none"
                style={{ background: SURF, borderColor: BORD, color: TEXT }}
              />
            </div>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="px-3 py-2 text-sm rounded-lg border outline-none"
              style={{ background: SURF, borderColor: BORD, color: MUTED }}>
              <option value="all">All Status</option>
              <option value="open">Open</option>
              <option value="draft">Draft</option>
              <option value="completed">Completed</option>
              <option value="billed">Billed</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <select value={filterType} onChange={e => setFilterType(e.target.value)}
              className="px-3 py-2 text-sm rounded-lg border outline-none"
              style={{ background: SURF, borderColor: BORD, color: MUTED }}>
              <option value="all">All Types</option>
              <option value="dine-in">Dine In</option>
              <option value="takeaway">Takeaway</option>
              <option value="delivery">Delivery</option>
            </select>
            <select value={filterPayment} onChange={e => setFilterPayment(e.target.value)}
              className="px-3 py-2 text-sm rounded-lg border outline-none"
              style={{ background: SURF, borderColor: BORD, color: MUTED }}>
              <option value="all">All Payments</option>
              <option value="Cash">Cash</option>
              <option value="Credit Card">Credit Card</option>
              <option value="QR Pay">QR Pay</option>
              <option value="Check">Check</option>
              <option value="Bank Transfer">Bank Transfer</option>
              <option value="Loyalty Point">Loyalty Point</option>
              <option value="Other">Other</option>
            </select>
          </div>

          {/* Table */}
          <div className="rounded-2xl border overflow-hidden" style={{ background: SURF, borderColor: BORD }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: `1px solid ${BORD}` }}>
                  {([ 
                    { label: "Order #", key: "orderNumber" },
                    { label: "Type", key: "type" },
                    { label: "User", key: "user" },
                    { label: "Payment Method", key: "paymentMethod" },
                    { label: "Customer", key: "customerName" },
                    { label: "Items", key: "items" },
                    { label: "Total", key: "total" },
                    { label: "Status", key: "status" },
                    { label: "Time", key: "createdAt" },
                  ] as { label: string; key: SortKey }[]).map(h => (
                    <th key={h.key}
                      className="px-4 py-3 text-left text-xs font-semibold cursor-pointer select-none"
                      style={{ color: sortKey === h.key ? GOLD : DIM }}
                      onClick={() => handleSort(h.key)}
                    >
                      <span className="inline-flex items-center gap-1">
                        {h.label}
                        {sortKey === h.key
                          ? (sortDir === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />)
                          : <ArrowUpDown size={11} style={{ opacity: 0.35 }} />}
                      </span>
                    </th>
                  ))}
                  <th className="px-4 py-3 text-left text-xs font-semibold" style={{ color: DIM }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={10} className="text-center py-10 text-xs" style={{ color: DIM }}>Loading...</td></tr>
                ) : sorted.length === 0 ? (
                  <tr><td colSpan={10} className="text-center py-10 text-xs" style={{ color: DIM }}>No orders found</td></tr>
                ) : (
                  sorted.map((o: any) => (
                    <tr key={o.id} className="border-t" style={{ borderColor: BORD }}>
                      <td className="px-4 py-3 font-mono font-bold text-xs" style={{ color: GOLD }}>#{o.orderNumber}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded text-xs font-medium"
                          style={{ background: (TYPE_COLOR[o.type] || DIM) + "22", color: TYPE_COLOR[o.type] || DIM }}>
                          {o.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs font-medium" style={{ color: TEXT }}>{o.placedBy || (o.cashierId ? `User ${o.cashierId}` : "—")}</td>
                      <td className="px-4 py-3 text-xs font-semibold" style={{ color: GOLD }}>{getPaymentMethod(o)}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: MUTED }}>{o.customerName || "—"}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: MUTED }}>{(o.items || []).length}</td>
                      <td className="px-4 py-3 text-xs font-semibold" style={{ color: TEXT }}>LKR {Number(o.total || 0).toLocaleString()}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded text-xs font-medium"
                          style={{ background: (STATUS_COLOR[o.status] || DIM) + "22", color: STATUS_COLOR[o.status] || DIM }}>
                          {o.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: DIM }}>
                        {new Date(o.createdAt).toLocaleString("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="px-4 py-3"><button onClick={() => setSelectedInvoiceId(Number(o.id))} className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-semibold" style={{ borderColor: GOLD, color: GOLD }}><Eye size={13} /> View</button></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {selectedInvoiceId && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setSelectedInvoiceId(null)}><div className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl border p-5" style={{ background: SURF, borderColor: BORD }} onClick={e => e.stopPropagation()}><div className="flex items-center justify-between border-b pb-3 mb-4" style={{ borderColor: BORD }}><div><h2 className="font-bold" style={{ color: TEXT }}>Invoice Activity</h2><div className="text-xs mt-1" style={{ color: DIM }}>{invoiceHistory?.order?.orderNumber || "Loading…"}</div></div><button onClick={() => setSelectedInvoiceId(null)} style={{ color: MUTED }}><X size={19} /></button></div>{historyLoading ? <div className="py-12 text-center text-sm" style={{ color: DIM }}>Loading invoice history…</div> : invoiceHistory?.error ? <div className="py-12 text-center text-sm" style={{ color: "var(--color-danger)" }}>{invoiceHistory.error}</div> : <><div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs mb-5">{[["Customer", invoiceHistory?.customer?.name || invoiceHistory?.order?.customerName || "Walk-in Customer"], ["Type", invoiceHistory?.order?.type || "—"], ["Total", `LKR ${Number(invoiceHistory?.order?.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`], ["Status", invoiceHistory?.order?.status || "—"]].map(([label, value]) => <div key={String(label)} className="rounded-lg border p-3" style={{ borderColor: BORD }}><div style={{ color: DIM }}>{label}</div><div className="font-semibold mt-1" style={{ color: TEXT }}>{value}</div></div>)}</div><h3 className="font-semibold text-sm mb-3" style={{ color: TEXT }}>Activity history</h3><div className="space-y-3">{(invoiceHistory?.events || []).map((event: any, index: number) => <div key={`${event.at}-${index}`} className="rounded-lg border p-3" style={{ borderColor: BORD }}><div className="flex flex-wrap items-center justify-between gap-2"><div className="font-semibold text-sm" style={{ color: event.kind === "danger" ? "var(--color-danger)" : event.kind === "success" ? "var(--color-success)" : event.kind === "warning" ? "var(--color-warning)" : TEXT }}>{event.action}</div><div className="text-[11px]" style={{ color: DIM }}>{event.at ? new Date(event.at).toLocaleString() : "—"}</div></div><div className="text-xs mt-1" style={{ color: MUTED }}>{event.details}</div><div className="text-[11px] mt-2" style={{ color: DIM }}>By: <span style={{ color: TEXT }}>{event.actor || "—"}</span></div></div>)}</div>{!(invoiceHistory?.events || []).length && <div className="py-8 text-center text-sm" style={{ color: DIM }}>No activity recorded.</div>}<div className="mt-5 rounded-lg border p-4" style={{ borderColor: BORD }}><h3 className="font-semibold text-sm mb-2" style={{ color: TEXT }}>Items</h3>{(invoiceHistory?.items || []).map((item: any) => <div key={item.id} className="flex justify-between border-b py-2 text-xs last:border-0" style={{ borderColor: BORD, color: MUTED }}><span>{item.name} ×{item.qty}</span><span style={{ color: TEXT }}>LKR {Number(item.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>)}</div></>}</div></div>}
        </div>
      </div>
    </div>
  );
}
