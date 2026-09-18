import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getBranchId } from "../../lib/store";
import { ReportLayout, DataTable, GOLD, SURF, BORD, MUTED, DIM, TEXT } from "./layout";
import type { ColDef } from "./layout";

type Filter = "today" | "yesterday" | "week" | "month" | "year" | "custom";
function range(filter: Filter, from: string, to: string) {
  const now = new Date(); const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (filter === "today") return [start(now), now];
  if (filter === "yesterday") { const d = new Date(now); d.setDate(d.getDate() - 1); return [start(d), new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59)]; }
  if (filter === "week") { const d = new Date(now); d.setDate(d.getDate() - 6); return [start(d), now]; }
  if (filter === "month") { const d = new Date(now); d.setDate(d.getDate() - 29); return [start(d), now]; }
  if (filter === "year") return [new Date(now.getFullYear(), 0, 1), now];
  return [from ? new Date(from) : start(now), to ? new Date(`${to}T23:59:59`) : now];
}
const cols: ColDef[] = [
  { key: "kotNumber", label: "KOT #" }, { key: "orderNumber", label: "Order #" }, { key: "dateTime", label: "Date / Time" },
  { key: "userName", label: "Printed By" }, { key: "printerName", label: "Counter / Printer" }, { key: "tableName", label: "Table" },
  { key: "orderType", label: "Type" }, { key: "printStatus", label: "Print Status" }, { key: "invoiceStatus", label: "Invoice Status" },
];
export default function KOTReport() {
  const branchId = getBranchId(); const [filter, setFilter] = useState<Filter>("today"); const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const { data, isLoading } = useQuery({ queryKey: ["reporting-kot", branchId], queryFn: async () => (await fetch(`/api/reporting?branchId=${branchId}`)).json() });
  const [start, end] = range(filter, from, to);
  const rows = useMemo(() => ((data?.kotRows || []) as any[]).filter(r => { const d = new Date(r.dateTime || 0); return d >= start && d <= end; }), [data, start.getTime(), end.getTime()]);
  const converted = rows.filter(r => r.invoiceStatus === "Converted to invoice").length;
  const left = rows.filter(r => r.invoiceStatus === "Left / not invoiced").length;
  const filters: [Filter, string][] = [["today", "Today"], ["yesterday", "Yesterday"], ["week", "This Week"], ["month", "This Month"], ["year", "This Year"], ["custom", "Custom"]];
  return <ReportLayout title="KOT Report">
    <div className="flex flex-wrap gap-2 items-center justify-between"><div className="flex flex-wrap gap-2">{filters.map(([key, label]) => <button key={key} onClick={() => setFilter(key)} className="px-3 py-1.5 rounded-lg text-xs font-semibold border" style={{ background: filter === key ? GOLD : "transparent", color: filter === key ? "var(--color-surface)" : MUTED, borderColor: filter === key ? GOLD : BORD }}>{label}</button>)}{filter === "custom" && <><input type="date" value={from} onChange={e => setFrom(e.target.value)} className="px-2 rounded border text-xs" style={{ background: SURF, borderColor: BORD, color: TEXT }} /><input type="date" value={to} onChange={e => setTo(e.target.value)} className="px-2 rounded border text-xs" style={{ background: SURF, borderColor: BORD, color: TEXT }} /></>}</div><button onClick={() => window.print()} className="px-3 py-1.5 rounded-lg text-xs font-semibold border" style={{ borderColor: BORD, color: MUTED }}>Print / PDF</button></div>
    <div className="grid grid-cols-3 gap-3">{[["KOTs Printed", rows.length], ["Converted to Invoice", converted], ["Left / Not Invoiced", left]].map(([label, value]) => <div key={String(label)} className="rounded-xl border p-4" style={{ background: SURF, borderColor: BORD }}><div className="text-xl font-bold" style={{ color: GOLD }}>{value}</div><div className="text-xs" style={{ color: DIM }}>{label}</div></div>)}</div>
    {isLoading ? <div className="text-sm" style={{ color: DIM }}>Loading…</div> : <DataTable title={`KOT detail (${rows.length})`} columns={cols} rows={rows} exportName="kot-report" />}
  </ReportLayout>;
}

