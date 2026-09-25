import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Package, History } from "lucide-react";
import { api } from "../../lib/api";
import { getBranchId } from "../../lib/store";
import { ReportLayout, DataTable, ViewToggle, GOLD, SURF, BORD, MUTED, DIM, TEXT } from "./layout";
import type { ColDef } from "./layout";

const STOCK_COLS: ColDef[] = [
  { key: "stockName", label: "Stock Group" },
  { key: "dishes", label: "POS Dishes" },
  { key: "openingQty", label: "Opening Stock", align: "right" },
  { key: "availableQty", label: "Available", align: "right", render: (v, row) => <strong style={{ color: row.status === "Low" || row.status === "Out of stock" ? "#f87171" : TEXT }}>{Number(v).toLocaleString()}</strong> },
  { key: "lowStockLevel", label: "Alert At", align: "right" },
  { key: "allowOverselling", label: "Over Selling" },
  { key: "status", label: "Status", render: v => <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: v === "Out of stock" ? "#dc262633" : v === "Low" ? "#d9770633" : "#16a34a33", color: v === "Out of stock" ? "#f87171" : v === "Low" ? "#fbbf24" : "#4ade80" }}>{v}</span> },
];

const MOVEMENT_COLS: ColDef[] = [
  { key: "date", label: "Date & Time" },
  { key: "action", label: "Action" },
  { key: "addedQty", label: "Added Qty", align: "right", render: v => v === "—" ? v : <strong style={{ color: "#4ade80" }}>+{v}</strong> },
  { key: "sold", label: "Sold", render: v => <span className="text-[10px] leading-tight whitespace-pre-wrap" style={{ color: v === "—" ? DIM : TEXT }}>{v}</span> },
  { key: "overSold", label: "Over Sold", align: "right", render: v => <span style={{ color: v === "—" ? DIM : "#f87171", fontWeight: v === "—" ? 400 : 700 }}>{v}</span> },
  { key: "balance", label: "Balance", align: "right", render: (v, row) => <strong style={{ color: Number(v) < 0 ? "#f87171" : TEXT }}>{v}</strong> },
  { key: "addedBy", label: "Added By" },
];

function movementLabel(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, char => char.toUpperCase());
}

export default function DishStockReport() {
  const branchId = getBranchId();
  const [view, setView] = useState<"summary" | "table">("summary");
  const { data, isLoading } = useQuery({ queryKey: ["dish-stock-report", branchId], queryFn: async () => (await (api as any).stock.report.$get({ query: { branchId: String(branchId) } })).json() });
  const stockItems: any[] = data?.stockItems || [];
  const rows = stockItems.map(item => {
    const available = Number(item.availableQty ?? item.quantityOnHand ?? 0);
    const low = Number(item.lowStockLevel || 0);
    const latestOpening = item.movements?.find((m: any) => ["daily_opening", "opening_stock"].includes(m.movementType));
    return { ...item, stockName: item.name, dishes: (item.linkedMenuItems || []).map((link: any) => link.menuItem?.name || `Item #${link.menuItemId}`).join(", ") || "—", openingQty: latestOpening?.newQty ?? 0, availableQty: available, lowStockLevel: low, allowOverselling: item.allowOverselling ? "Yes" : "No", status: available <= 0 ? "Out of stock" : available <= low ? "Low" : "OK" };
  });
  const movementRows = useMemo(() => stockItems.flatMap(item => {
    const menuById = new Map((item.linkedMenuItems || []).map((link: any) => [link.menuItemId, link.menuItem?.name || `Item #${link.menuItemId}`]));
      const allDishes = Array.from(menuById.values()).join(", ");
      return (item.movements || []).map((movement: any) => {
      const isSale = movement.movementType === "sale";
      const isDailyOpening = movement.movementType === "daily_opening";
      const isAdded = ["opening_stock", "daily_opening", "restock"].includes(movement.movementType) || (movement.movementType === "stock_adjustment" && Number(movement.qty) > 0);
      const balance = Number(movement.newQty || 0);
      return { ...movement, date: movement.createdAt ? new Date(movement.createdAt).toLocaleString() : "—", action: isDailyOpening ? `Daily opening (was ${Number(movement.previousQty || 0).toLocaleString()})` : movementLabel(String(movement.movementType || "")), addedQty: isAdded ? Number(movement.qty || 0).toLocaleString() : "—", sold: isSale ? `${menuById.get(movement.menuItemId) || item.name}\nShared: ${allDishes || item.name}` : "—", overSold: isSale && balance < 0 ? `${Math.abs(balance).toLocaleString()} over` : "—", balance: balance.toLocaleString(), addedBy: isAdded ? (movement.createdByName || "—") : "—", activity: movementLabel(String(movement.movementType || "")), stockName: item.name };
    });
  }), [stockItems]);
  const low = rows.filter(row => row.status === "Low").length;
  const out = rows.filter(row => row.status === "Out of stock").length;
  const openingTotal = rows.reduce((sum, row) => sum + Number(row.openingQty || 0), 0);
  return <ReportLayout title="Dish Stock Report"><div className="flex items-start justify-between gap-3 flex-wrap"><div><div className="text-xs" style={{ color: DIM }}>Opening stock details and current shared dish availability</div></div><ViewToggle view={view} onChange={setView} /></div>{(low > 0 || out > 0) && <div className="rounded-xl border px-4 py-3 flex items-center gap-2 text-xs" style={{ background: "#dc262622", borderColor: "#dc2626", color: "#f87171" }}><AlertTriangle size={15} />{out > 0 ? `${out} stock group(s) are out of stock.` : `${low} stock group(s) are at or below the low-stock alert.`}</div>}<div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[{ label: "Stock Groups", value: rows.length }, { label: "Opening Quantity", value: openingTotal.toLocaleString() }, { label: "Low Stock", value: low }, { label: "Out of Stock", value: out }].map(card => <div key={card.label} className="rounded-xl border p-4" style={{ background: SURF, borderColor: BORD }}><div className="text-xl font-bold" style={{ color: GOLD }}>{card.value}</div><div className="text-xs mt-1" style={{ color: MUTED }}>{card.label}</div></div>)}</div>{view === "table" ? <><DataTable title={`Dish Stock (${rows.length})`} columns={STOCK_COLS} rows={rows} exportName="dish-stock-report" /><DataTable title={`Stock Activity (${movementRows.length})`} columns={MOVEMENT_COLS} rows={movementRows} exportName="dish-stock-activity" /></> : <div className="rounded-2xl border p-5" style={{ background: SURF, borderColor: BORD }}><div className="font-semibold text-sm mb-4" style={{ color: TEXT }}>Current Dish Stock</div>{isLoading ? <div className="py-8 text-center text-xs" style={{ color: DIM }}>Loading…</div> : rows.length === 0 ? <div className="py-8 text-center text-xs" style={{ color: DIM }}><Package size={24} className="mx-auto mb-2" />No sales stock has been added.</div> : <div className="space-y-3">{rows.map(row => <div key={row.id} className="rounded-xl border p-4" style={{ borderColor: row.status === "OK" ? BORD : "#dc2626" }}><div className="flex justify-between gap-3"><div><div className="font-semibold text-sm" style={{ color: TEXT }}>{row.stockName}</div><div className="text-xs mt-1" style={{ color: MUTED }}>Dishes: {row.dishes}</div></div><span className="text-xs font-bold" style={{ color: row.status === "OK" ? "#4ade80" : "#f87171" }}>{row.status}</span></div><div className="grid grid-cols-3 gap-3 mt-3 text-xs"><div><div style={{ color: DIM }}>Opening</div><strong style={{ color: TEXT }}>{row.openingQty}</strong></div><div><div style={{ color: DIM }}>Available</div><strong style={{ color: row.status === "OK" ? TEXT : "#f87171" }}>{row.availableQty}</strong></div><div><div style={{ color: DIM }}>Policy</div><strong style={{ color: TEXT }}>{row.allowOverselling === "Yes" ? "Over selling" : "Stops at zero"}</strong></div></div></div>)}</div>}</div>}<div className="text-[11px] flex items-center gap-1" style={{ color: DIM }}><History size={12} /> Restocks appear as separate lines. Sales show the dishes using each shared stock group, including oversold balances.</div></ReportLayout>;
}
