import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getBranchId } from "../../lib/store";
import { ReportLayout, DataTable, GOLD, BORD, MUTED, DIM } from "./layout";
import type { ColDef } from "./layout";

type Row = Record<string, any>;
type Preset = "today" | "yesterday" | "week" | "month" | "year" | "custom";
const columns: ColDef[] = [
  { key: "orderNumber", label: "Order #" },
  { key: "dateTime", label: "Date / Time", render: v => { const d = new Date(String(v || "")); return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("en-GB", { dateStyle: "short", timeStyle: "medium", hour12: false }); } },
  { key: "typeLabel", label: "Type" }, { key: "userName", label: "User / Cashier" }, { key: "tableName", label: "Table" }, { key: "customerName", label: "Customer" }, { key: "status", label: "Status" }, { key: "saleStatus", label: "Sale Status" },
  { key: "total", label: "Amount", align: "right", render: v => `LKR ${Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}` },
];
function range(p: Preset, from: string, to: string): [Date, Date] { const n = new Date(); const s = new Date(n.getFullYear(), n.getMonth(), n.getDate()); if (p === "today") return [s, n]; if (p === "yesterday") { s.setDate(s.getDate() - 1); return [s, new Date(s.getFullYear(), s.getMonth(), s.getDate(), 23, 59, 59)]; } if (p === "week") { s.setDate(s.getDate() - 6); return [s, n]; } if (p === "month") { s.setDate(s.getDate() - 29); return [s, n]; } if (p === "year") return [new Date(n.getFullYear(), 0, 1), n]; return [from ? new Date(`${from}T00:00:00`) : new Date(0), to ? new Date(`${to}T23:59:59`) : n]; }
export default function OrdersReport() {
  const branchId = getBranchId(); const [preset, setPreset] = useState<Preset>("today"); const [from, setFrom] = useState(""); const [to, setTo] = useState(""); const [view, setView] = useState("all");
  const { data, isLoading } = useQuery({ queryKey: ["reporting-orders", branchId], queryFn: async () => (await fetch(`/api/reporting?branchId=${branchId}`)).json() });
  const [start, end] = range(preset, from, to); const rows = useMemo(() => ((data?.orderRows || []) as Row[]).filter(o => { const d = new Date(o.dateTime || 0); const open = !["Converted to sale", "Cancelled"].includes(o.saleStatus); return d >= start && d <= end && (view === "all" || (view === "converted" ? o.saleStatus === "Converted to sale" : open)); }), [data, preset, from, to, view]);
  const presets: [Preset, string][] = [["today", "Today"], ["yesterday", "Yesterday"], ["week", "This Week"], ["month", "This Month"], ["year", "This Year"], ["custom", "Custom"]];
  return <ReportLayout title="Orders Report"><div className="flex flex-wrap gap-2 items-center"><span className="text-xs" style={{ color: DIM }}>Period:</span>{presets.map(([k, label]) => <button key={k} onClick={() => setPreset(k)} className="px-3 py-1.5 rounded-lg text-xs border" style={{ background: preset === k ? GOLD : "transparent", color: preset === k ? "var(--color-surface)" : MUTED, borderColor: preset === k ? GOLD : BORD }}>{label}</button>)}{preset === "custom" && <><input type="date" value={from} onChange={e => setFrom(e.target.value)} /><input type="date" value={to} onChange={e => setTo(e.target.value)} /></>}</div><div className="flex gap-2"><button onClick={() => setView("all")}>All orders</button><button onClick={() => setView("converted")}>Converted to sale</button><button onClick={() => setView("open")}>Open orders</button></div>{isLoading ? <div>Loading…</div> : <DataTable title={`Orders results (${rows.length} entries)`} columns={columns} rows={rows} exportName="orders-report" />}</ReportLayout>;
}
