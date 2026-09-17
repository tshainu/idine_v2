import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { getBranchId, getUser } from "../../lib/store";
import { ReportLayout, DataTable, ViewToggle, GOLD, SURF, BORD, MUTED, DIM, TEXT } from "./layout";
import type { ColDef } from "./layout";
import { TrendingUp, TrendingDown } from "lucide-react";

type Period = "week" | "month" | "year";

const ORDER_COLS: ColDef[] = [
  { key: "orderNumber", label: "Order #" },
  { key: "date",        label: "Date" },
  { key: "type",        label: "Type" },
  { key: "customerName",label: "Customer" },
  { key: "total",       label: "Revenue", align: "right", render: v => <span style={{ color: GOLD, fontWeight: 700 }}>LKR {Number(v || 0).toLocaleString()}</span> },
];

const EXPENSE_COLS: ColDef[] = [
  { key: "expenseDate", label: "Date" },
  { key: "category",    label: "Category" },
  { key: "notes",       label: "Notes" },
  { key: "amount",      label: "Amount", align: "right", render: v => <span style={{ color: "#f87171", fontWeight: 700 }}>LKR {Number(v || 0).toLocaleString()}</span> },
];

const PURCHASE_COLS: ColDef[] = [
  { key: "purchaseDate",    label: "Date" },
  { key: "supplierName",    label: "Supplier" },
  { key: "itemDescription", label: "Item" },
  { key: "qty",             label: "Qty",   align: "right" },
  { key: "total",           label: "Total", align: "right", render: v => <span style={{ color: "#f87171", fontWeight: 700 }}>LKR {Number(v || 0).toLocaleString()}</span> },
];

export default function PLReport() {
  const branchId = getBranchId();
  const user = getUser();
  const [period, setPeriod] = useState<Period>("month");
  const [view, setView] = useState<"summary" | "table">("summary");
  const [tableTab, setTableTab] = useState<"orders" | "expenses" | "purchases">("orders");

  const { data: ordersData } = useQuery({
    queryKey: ["report-orders", branchId, user?.id ?? user?.name ?? "all"],
    queryFn: async () => (await api.orders.$get({ query: { branchId: String(branchId), ...(user?.role === "admin" || !user?.id ? {} : { cashierId: String(user.id), placedBy: String(user.name || "") }) } })).json(),
  });
  const { data: expData } = useQuery({
    queryKey: ["expenses", branchId],
    queryFn: async () => (await api.expenses.$get({ query: { branchId: String(branchId) } })).json(),
  });
  const { data: purchasesData } = useQuery({
    queryKey: ["purchases", branchId],
    queryFn: async () => (await api.purchases.$get({ query: { branchId: String(branchId) } })).json(),
  });

  const allOrders: any[] = (ordersData as any)?.orders || [];
  const allExpenses: any[] = (expData as any)?.expenses || [];
  const allPurchases: any[] = (purchasesData as any)?.purchases || [];

  function cutoff(p: Period) {
    const d = new Date();
    if (p === "week") d.setDate(d.getDate() - 7);
    else if (p === "month") d.setMonth(d.getMonth() - 1);
    else d.setFullYear(d.getFullYear() - 1);
    return d;
  }

  const cut = cutoff(period);
  const orders = allOrders.filter(o => new Date(o.createdAt) >= cut && (o.status === "completed" || o.status === "billed"));
  const expenses = allExpenses.filter(e => new Date(e.expenseDate) >= cut);
  const purchases = allPurchases.filter(p => new Date(p.purchaseDate) >= cut);

  const salesRevenue = orders.reduce((s, o) => s + (Number(o.total) || 0), 0);
  const foodCost = purchases.reduce((s, p) => s + (Number(p.total) || 0), 0);
  const operatingExpenses = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const labourCost = expenses.filter(e => e.category?.toLowerCase().includes("labour") || e.category?.toLowerCase().includes("salary"))
    .reduce((s, e) => s + (Number(e.amount) || 0), 0) || salesRevenue * 0.2;
  const grossProfit = salesRevenue - foodCost;
  const netProfit = salesRevenue - foodCost - labourCost - operatingExpenses;
  const netMargin = salesRevenue > 0 ? (netProfit / salesRevenue) * 100 : 0;
  const grossMargin = salesRevenue > 0 ? (grossProfit / salesRevenue) * 100 : 0;

  const expensesByCategory = useMemo(() => {
    const m: Record<string, number> = {};
    expenses.forEach(e => { m[e.category] = (m[e.category] || 0) + Number(e.amount); });
    return m;
  }, [expenses]);

  const orderRows = orders.map(o => ({
    orderNumber: o.orderNumber,
    date: new Date(o.createdAt).toLocaleString("en", { dateStyle: "short", timeStyle: "short" }),
    type: o.type,
    customerName: o.customerName || "Walk-in",
    total: o.total,
  }));

  const PERIODS: { key: Period; label: string }[] = [
    { key: "week", label: "Last 7 Days" },
    { key: "month", label: "Last 30 Days" },
    { key: "year", label: "Last 12 Months" },
  ];

  function Row({ label, value, indent = false, highlight = false, negative = false }: {
    label: string; value: number; indent?: boolean; highlight?: boolean; negative?: boolean;
  }) {
    return (
      <div className={`flex items-center justify-between py-3 border-b ${indent ? "pl-6" : ""}`} style={{ borderColor: BORD }}>
        <span className="text-sm" style={{ color: highlight ? TEXT : MUTED, fontWeight: highlight ? 700 : 400 }}>{label}</span>
        <span className="text-sm font-bold" style={{
          color: highlight ? (negative ? "#f87171" : GOLD) : (negative ? "#f87171" : TEXT),
        }}>
          LKR {Math.round(Math.abs(value)).toLocaleString()}
          {highlight && value !== 0 && salesRevenue > 0 && (
            <span className="ml-1 text-xs font-normal" style={{ color: DIM }}>
              ({value >= 0 ? "+" : "-"}{Math.abs(value / salesRevenue * 100).toFixed(1)}%)
            </span>
          )}
        </span>
      </div>
    );
  }

  return (
    <ReportLayout title="Profit & Loss">
      {/* Controls */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-2">
          {PERIODS.map(p => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all"
              style={{
                background: period === p.key ? GOLD : "transparent",
                color: period === p.key ? "var(--color-surface)" : MUTED,
                borderColor: period === p.key ? GOLD : BORD,
              }}>{p.label}</button>
          ))}
        </div>
        <ViewToggle view={view} onChange={setView} />
      </div>

      {/* TABLE VIEW */}
      {view === "table" ? (
        <>
          <div className="flex gap-1 border-b" style={{ borderColor: BORD }}>
            {([["orders", "Sales Orders"], ["expenses", "Expenses"], ["purchases", "Purchases"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setTableTab(k)}
                className="px-4 py-2 text-xs font-semibold border-b-2 transition-all"
                style={{ color: tableTab === k ? GOLD : MUTED, borderBottomColor: tableTab === k ? GOLD : "transparent" }}>
                {l}
              </button>
            ))}
          </div>
          {tableTab === "orders"    && <DataTable title={`Sales Orders (${orderRows.length})`}   columns={ORDER_COLS}    rows={orderRows}          exportName="pl-sales" />}
          {tableTab === "expenses"  && <DataTable title={`Expenses (${expenses.length})`}         columns={EXPENSE_COLS}  rows={expenses}           exportName="pl-expenses" />}
          {tableTab === "purchases" && <DataTable title={`Purchases (${purchases.length})`}       columns={PURCHASE_COLS} rows={purchases}          exportName="pl-purchases" />}
        </>
      ) : (
        <>
          {/* Insight */}
          <div className="rounded-xl px-4 py-3 flex items-center gap-2 text-sm font-medium border"
            style={{
              background: netProfit >= 0 ? "#16a34a22" : "#dc262622",
              borderColor: netProfit >= 0 ? "#16a34a" : "#dc2626",
              color: netProfit >= 0 ? "#4ade80" : "#f87171",
            }}>
            {netProfit >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
            Net Profit Margin = {netMargin.toFixed(1)}% · Gross Margin = {grossMargin.toFixed(1)}%
          </div>

          {/* Cards */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Sales Revenue", value: salesRevenue },
              { label: "Gross Profit",  value: grossProfit },
              { label: "Net Profit",    value: netProfit },
            ].map(c => (
              <div key={c.label} className="rounded-xl p-4 border" style={{
                background: SURF,
                borderColor: c.label === "Net Profit" ? (c.value >= 0 ? "#16a34a" : "#dc2626") : BORD,
              }}>
                <div className="text-xl font-bold" style={{
                  color: c.label === "Net Profit" ? (c.value >= 0 ? "#4ade80" : "#f87171") : GOLD,
                }}>LKR {Math.round(c.value).toLocaleString()}</div>
                <div className="text-xs mt-0.5" style={{ color: MUTED }}>{c.label}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2 rounded-2xl p-5 border" style={{ background: SURF, borderColor: BORD }}>
              <div className="font-semibold text-sm mb-2" style={{ color: TEXT }}>P&L Statement</div>
              <div className="mt-2">
                <div className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: DIM }}>Revenue</div>
                <Row label="Sales Revenue" value={salesRevenue} highlight />
                <div className="text-xs font-bold uppercase tracking-wide mt-4 mb-1" style={{ color: DIM }}>Cost of Goods</div>
                <Row label="Food & Beverage Cost" value={foodCost} negative />
                <Row label="Gross Profit" value={grossProfit} highlight />
                <div className="text-xs font-bold uppercase tracking-wide mt-4 mb-1" style={{ color: DIM }}>Operating Expenses</div>
                <Row label="Labour Cost" value={labourCost} negative />
                <Row label="Other Operating Expenses" value={operatingExpenses} negative />
                <div className="mt-2"><Row label="Net Profit" value={netProfit} highlight negative={netProfit < 0} /></div>
              </div>
            </div>
            <div className="space-y-4">
              <div className="rounded-2xl p-4 border" style={{ background: SURF, borderColor: BORD }}>
                <div className="font-semibold text-xs mb-3" style={{ color: TEXT }}>Expenses by Category</div>
                {Object.keys(expensesByCategory).length === 0
                  ? <div className="text-xs" style={{ color: DIM }}>No expenses</div>
                  : Object.entries(expensesByCategory).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => {
                    const pct = operatingExpenses > 0 ? (amt / operatingExpenses) * 100 : 0;
                    return (
                      <div key={cat} className="mb-2">
                        <div className="flex justify-between text-xs mb-0.5">
                          <span style={{ color: MUTED }}>{cat}</span>
                          <span style={{ color: TEXT }}>LKR {Math.round(amt).toLocaleString()}</span>
                        </div>
                        <div className="h-1 rounded-full" style={{ background: BORD }}>
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: GOLD }} />
                        </div>
                      </div>
                    );
                  })
                }
              </div>
              <div className="rounded-2xl p-4 border" style={{ background: SURF, borderColor: BORD }}>
                <div className="font-semibold text-xs mb-3" style={{ color: TEXT }}>Totals</div>
                {[
                  { label: "Total Purchases", value: `LKR ${Math.round(foodCost).toLocaleString()}` },
                  { label: "Total Expenses",  value: `LKR ${Math.round(operatingExpenses).toLocaleString()}` },
                  { label: "Orders",          value: orders.length },
                ].map(r => (
                  <div key={r.label} className="flex justify-between text-xs py-1.5 border-b last:border-0" style={{ borderColor: BORD }}>
                    <span style={{ color: MUTED }}>{r.label}</span>
                    <span className="font-bold" style={{ color: TEXT }}>{r.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </ReportLayout>
  );
}
