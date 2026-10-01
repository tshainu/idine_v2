import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Printer, RefreshCw } from "lucide-react";
import { Sidebar } from "../../components/layout/sidebar";
import { getBranchId } from "../../lib/store";
import { DateRangePicker } from "./layout";

const moneyDate = (value: any) => new Date(Number(value) < 1e12 ? Number(value) * 1000 : Number(value)).toLocaleString();

export default function ModificationReport() {
  const branchId = getBranchId();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const { data, isFetching, refetch } = useQuery({
    queryKey: ["modifications", branchId],
    queryFn: async () => (await fetch(`/api/modifications?branchId=${branchId}`)).json(),
    enabled: !!branchId, staleTime: 30000,
  });
  const rows = (data?.modifications ?? []).filter((row: any) => {
    const date = new Date(Number(row.createdAt) < 1e12 ? Number(row.createdAt) * 1000 : Number(row.createdAt));
    const day = date.toISOString().slice(0, 10);
    return (!from || day >= from) && (!to || day <= to);
  });
  const exportCsv = () => {
    const head = "Date,Order,Table,User,Item,Qty before,Qty after,Qty reduced,Reason";
    const body = rows.map((r: any) => [moneyDate(r.createdAt), r.orderNumber, r.tableName, r.userName, r.itemName, r.qtyBefore, r.qtyAfter, r.qtyReduced, r.reason].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([`${head}\n${body}`], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "modification-report.csv"; a.click(); URL.revokeObjectURL(a.href);
  };
  return <div className="flex h-screen" style={{ background: "var(--color-bg)", color: "var(--color-text)" }}><Sidebar /><main className="flex-1 overflow-auto p-6"><div className="flex items-center justify-between mb-5"><div><h1 className="text-xl font-bold">Modification Report</h1><p className="text-xs" style={{ color: "var(--color-text-muted)" }}>Reduced quantities and canceled orders from the POS and Waiter app</p></div><div className="flex gap-2"><button onClick={() => window.print()} className="px-3 py-2 rounded border text-xs"><Printer size={14} className="inline mr-1" />Print</button><button onClick={exportCsv} className="px-3 py-2 rounded border text-xs"><Download size={14} className="inline mr-1" />Export CSV</button></div></div><div className="rounded-xl border p-4 mb-4 flex flex-wrap gap-3 items-end" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}><DateRangePicker from={from} to={to} setFrom={setFrom} setTo={setTo} compact={false} /><button onClick={() => refetch()} className="px-3 py-2 rounded border text-xs"><RefreshCw size={14} className="inline mr-1" />{isFetching ? "Loading…" : "Refresh"}</button><span className="ml-auto text-xs" style={{ color: "var(--color-text-muted)" }}>{rows.length} result{rows.length === 1 ? "" : "s"}</span></div><div className="rounded-xl border overflow-x-auto" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}><table className="w-full text-xs"><thead><tr className="border-b text-left"><th className="p-3">Date & time</th><th className="p-3">Order</th><th className="p-3">Table</th><th className="p-3">User</th><th className="p-3">Item</th><th className="p-3">Before</th><th className="p-3">After</th><th className="p-3">Reduced</th><th className="p-3">Reason</th></tr></thead><tbody>{rows.length ? rows.map((r: any) => <tr key={r.id} className="border-b"><td className="p-3">{moneyDate(r.createdAt)}</td><td className="p-3">{r.orderNumber || "—"}</td><td className="p-3">{r.tableName || "—"}</td><td className="p-3">{r.userName || "—"}</td><td className="p-3">{r.itemName}</td><td className="p-3">{r.qtyBefore}</td><td className="p-3">{r.qtyAfter}</td><td className="p-3 font-semibold" style={{ color: "var(--color-danger)" }}>{r.qtyReduced}</td><td className="p-3">{r.reason}</td></tr>) : <tr><td colSpan={9} className="p-10 text-center" style={{ color: "var(--color-text-muted)" }}>No modification records found.</td></tr>}</tbody></table></div></main></div>;
}
