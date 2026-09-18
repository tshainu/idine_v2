import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { getBranchId, getUser } from "../../lib/store";
import { ReportLayout, DataTable, ViewToggle, GOLD, SURF, BORD, MUTED, DIM, TEXT } from "./layout";
import type { ColDef } from "./layout";
import { TrendingUp, TrendingDown } from "lucide-react";

type Filter = "today" | "yesterday" | "week" | "month" | "custom";

function dateRange(filter: Filter, from: string, to: string): [Date, Date] {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (filter === "today") return [startOfDay(now), now];
  if (filter === "yesterday") {
    const y = new Date(now); y.setDate(y.getDate() - 1);
    return [startOfDay(y), new Date(y.getFullYear(), y.getMonth(), y.getDate(), 23, 59, 59)];
  }
  if (filter === "week") { const s = new Date(now); s.setDate(s.getDate() - 6); return [startOfDay(s), now]; }
  if (filter === "month") { const s = new Date(now); s.setDate(s.getDate() - 29); return [startOfDay(s), now]; }
  return [from ? new Date(from) : startOfDay(now), to ? new Date(to + "T23:59:59") : now];
}

function prevRange(filter: Filter, from: string, to: string): [Date, Date] {
  const [s, e] = dateRange(filter, from, to);
  const diff = e.getTime() - s.getTime();
  return [new Date(s.getTime() - diff), new Date(s.getTime())];
}

const TABLE_COLS: ColDef[] = [
  { key: "orderNumber", label: "Order #" },
  { key: "date", label: "Date" },
  { key: "type", label: "Type" },
  { key: "status", label: "Status", render: (v) => (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold capitalize"
      style={{
        background: v === "completed" || v === "billed" ? "#16a34a33" : v === "cancelled" ? "#dc262633" : "#d9770633",
        color: v === "completed" || v === "billed" ? "#4ade80" : v === "cancelled" ? "#f87171" : "#fbbf24",
      }}>{v}</span>
  )},
  { key: "customerName", label: "Customer" },
  { key: "subtotal", label: "Subtotal", align: "right", render: v => `LKR ${Number(v || 0).toLocaleString()}` },
  { key: "cash", label: "Cash", align: "right", render: v => `LKR ${Number(v || 0).toLocaleString()}` },
  { key: "card", label: "Card", align: "right", render: v => `LKR ${Number(v || 0).toLocaleString()}` },
  { key: "other", label: "Other", align: "right", render: v => `LKR ${Number(v || 0).toLocaleString()}` },
  { key: "total", label: "Total", align: "right", render: v => <span style={{ color: GOLD, fontWeight: 700 }}>LKR {Number(v || 0).toLocaleString()}</span> },
  { key: "items", label: "Items", align: "right" },
];

export default function SalesReport() {
  const branchId = getBranchId();
  const user = getUser();
  const [filter, setFilter] = useState<Filter>("today");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [view, setView] = useState<"summary" | "table">("summary");

  const { data: ordersData, isLoading } = useQuery({
    queryKey: ["report-orders", branchId, user?.id ?? user?.name ?? "all"],
    queryFn: async () => (await api.orders.$get({ query: { branchId: String(branchId), ...(["admin", "manager", "superadmin"].includes(String(user?.role || "").toLowerCase()) || !user?.id ? {} : { cashierId: String(user.id), placedBy: String(user.name || "") }) } })).json(),
  });
  const allOrders: any[] = (ordersData as any)?.orders || [];

  const [start, end] = dateRange(filter, from, to);
  const [prevStart, prevEnd] = prevRange(filter, from, to);

  const orders = useMemo(() => allOrders.filter(o => {
    const d = new Date(o.createdAt); return d >= start && d <= end;
  }), [allOrders, start, end]);

  const prevOrders = useMemo(() => allOrders.filter(o => {
    const d = new Date(o.createdAt); return d >= prevStart && d <= prevEnd;
  }), [allOrders, prevStart, prevEnd]);

  const isFinalized = (o: any) => ["completed", "billed", "paid"].includes(String(o.status || "").toLowerCase());
  const completed = orders.filter(isFinalized);
  const prevCompleted = prevOrders.filter(isFinalized);

  const grossSales = completed.reduce((s, o) => s + (Number(o.total) || 0), 0);
  const prevGross = prevCompleted.reduce((s, o) => s + (Number(o.total) || 0), 0);
  const discounts = grossSales * 0.05;
  const netSales = grossSales - discounts;
  const avgBill = completed.length ? grossSales / completed.length : 0;
  const refunds = orders.filter(o => ["refunded", "partially_refunded"].includes(String(o.status || "").toLowerCase())).reduce((s, o) => s + Math.abs(Number(o.total) || 0), 0);
  const pctChange = prevGross > 0 ? ((grossSales - prevGross) / prevGross) * 100 : null;

  const days: { label: string; rev: number }[] = [];
  const chartEnd = new Date(end);
  const chartStart = new Date(chartEnd); chartStart.setDate(chartStart.getDate() - 29);
  const diffDays = 30;
  for (let i = diffDays - 1; i >= 0; i--) {
    const d = new Date(chartEnd); d.setDate(d.getDate() - i);
    const ds = d.toDateString();
    const rev = allOrders.filter(o => isFinalized(o) && new Date(o.createdAt) >= chartStart && new Date(o.createdAt) <= chartEnd && new Date(o.createdAt).toDateString() === ds).reduce((s, o) => s + (Number(o.total) || 0), 0);
    days.push({ label: d.toLocaleDateString("en", { month: "short", day: "numeric" }), rev });
  }
  const maxRev = Math.max(...days.map(d => d.rev), 1);

  const tableRows = orders.map(o => {
    const payments = Array.isArray(o.payments) ? o.payments : (() => { try { return JSON.parse(o.paymentsJson || "[]"); } catch { return []; } })();
    const parts = payments.length ? payments : [{ method: o.paymentMethod || "Other", amount: o.total }];
    const paymentTotals = parts.reduce((acc: any, p: any) => { const method = String(p.method || "other").toLowerCase(); const key = method.includes("cash") ? "cash" : method.includes("card") ? "card" : "other"; acc[key] += Number(p.amount || 0); return acc; }, { cash: 0, card: 0, other: 0 });
    return {
    orderNumber: o.orderNumber,
    date: new Date(o.createdAt).toLocaleString("en", { dateStyle: "short", timeStyle: "short" }),
    type: o.type,
    status: o.status,
    customerName: o.customerName || "Walk-in",
    subtotal: o.subtotal,
    total: o.total,
    ...paymentTotals,
    items: (o.items || []).length,
    };
  });

  const FILTERS: { key: Filter; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "yesterday", label: "Yesterday" },
    { key: "week", label: "This Week" },
    { key: "month", label: "This Month" },
    { key: "custom", label: "Custom" },
  ];

  const metrics = [
    { label: "Gross Sales", value: `LKR ${Math.round(grossSales).toLocaleString()}`, highlight: true },
    { label: "Net Sales", value: `LKR ${Math.round(netSales).toLocaleString()}` },
    { label: "Discounts Given", value: `LKR ${Math.round(discounts).toLocaleString()}` },
    { label: "Refunds", value: `LKR ${Math.round(refunds).toLocaleString()}` },
    { label: "Avg Bill Value", value: `LKR ${Math.round(avgBill).toLocaleString()}` },
    { label: "Total Orders", value: orders.length },
    { label: "Completed", value: completed.length },
  ];

  return (
    <ReportLayout title="Sales Performance">
      {/* Filter + view toggle row */}
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex flex-wrap gap-2 items-center">
          {FILTERS.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all"
              style={{
                background: filter === f.key ? GOLD : "transparent",
                color: filter === f.key ? "var(--color-surface)" : MUTED,
                borderColor: filter === f.key ? GOLD : BORD,
              }}>{f.label}</button>
          ))}
          {filter === "custom" && (
            <>
              <input type="date" value={from} onChange={e => setFrom(e.target.value)}
                className="px-2 py-1.5 rounded-lg text-xs border outline-none"
                style={{ background: SURF, borderColor: BORD, color: TEXT }} />
              <span className="text-xs" style={{ color: DIM }}>to</span>
              <input type="date" value={to} onChange={e => setTo(e.target.value)}
                className="px-2 py-1.5 rounded-lg text-xs border outline-none"
                style={{ background: SURF, borderColor: BORD, color: TEXT }} />
            </>
          )}
        </div>
        <ViewToggle view={view} onChange={setView} />
      </div>

      {/* TABLE VIEW */}
      {view === "table" ? (
        <DataTable
          title={`All Orders (${orders.length})`}
          columns={TABLE_COLS}
          rows={tableRows}
          exportName="sales-report"
        />
      ) : (
        <>
          {/* Insight banner */}
          {pctChange !== null && (
            <div className="rounded-xl px-4 py-3 flex items-center gap-2 border text-sm font-medium"
              style={{
                background: pctChange >= 0 ? "#16a34a22" : "#dc262622",
                borderColor: pctChange >= 0 ? "#16a34a" : "#dc2626",
                color: pctChange >= 0 ? "#4ade80" : "#f87171",
              }}>
              {pctChange >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
              Sales {pctChange >= 0 ? "increased" : "decreased"} by {Math.abs(pctChange).toFixed(1)}% compared to the previous period.
            </div>
          )}

          {/* Metric cards */}
          <div className="grid grid-cols-4 gap-3">
            {metrics.map(m => (
              <div key={m.label} className="rounded-xl p-4 border" style={{ background: SURF, borderColor: m.highlight ? GOLD + "55" : BORD }}>
                <div className="text-lg font-bold" style={{ color: m.highlight ? GOLD : TEXT }}>{m.value}</div>
                <div className="text-xs mt-0.5" style={{ color: MUTED }}>{m.label}</div>
              </div>
            ))}
          </div>

          {/* Chart */}
          <div className="rounded-2xl p-5 border" style={{ background: SURF, borderColor: BORD }}>
            <div className="font-semibold text-sm mb-1" style={{ color: TEXT }}>Revenue Over Month</div>
            <div className="text-[10px] mb-4" style={{ color: DIM }}>Finalized invoice revenue for the latest 30 days</div>
            {isLoading ? (
              <div className="h-32 flex items-center justify-center text-xs" style={{ color: DIM }}>Loading…</div>
            ) : (
              <>
                <div className="flex items-end gap-0.5 h-32">
                  {days.map((d, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center group relative">
                      <div className="w-full rounded-t-sm" style={{
                        height: `${Math.max((d.rev / maxRev) * 120, 2)}px`,
                        background: d.rev > 0 ? GOLD : BORD, opacity: d.rev > 0 ? 1 : 0.3,
                      }} />
                      <div className="absolute bottom-full mb-1 hidden group-hover:flex z-10">
                        <div className="rounded px-2 py-1 text-[10px] whitespace-nowrap" style={{ background: "#000", color: TEXT }}>
                          {d.label}: LKR {Math.round(d.rev).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-[10px]" style={{ color: DIM }}>{days[0]?.label}</span>
                  <span className="text-[10px]" style={{ color: DIM }}>{days[days.length - 1]?.label}</span>
                </div>
              </>
            )}
          </div>

          {/* Order type & status breakdown */}
          <div className="grid grid-cols-2 gap-4">
            {[
              { title: "By Order Type", map: orders.reduce((m, o) => { m[o.type] = (m[o.type] || 0) + 1; return m; }, {} as Record<string, number>) },
              { title: "By Status", map: orders.reduce((m, o) => { m[o.status] = (m[o.status] || 0) + 1; return m; }, {} as Record<string, number>) },
            ].map(({ title, map }) => (
              <div key={title} className="rounded-2xl p-4 border" style={{ background: SURF, borderColor: BORD }}>
                <div className="font-semibold text-xs mb-3" style={{ color: TEXT }}>{title}</div>
                {Object.keys(map).length === 0
                  ? <div className="text-xs" style={{ color: DIM }}>No data</div>
                  : Object.entries(map).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between text-xs py-1 border-b last:border-0" style={{ borderColor: BORD }}>
                      <span className="capitalize" style={{ color: MUTED }}>{k}</span>
                      <span className="font-bold" style={{ color: TEXT }}>{v as number}</span>
                    </div>
                  ))}
              </div>
            ))}
          </div>
        </>
      )}
    </ReportLayout>
  );
}
