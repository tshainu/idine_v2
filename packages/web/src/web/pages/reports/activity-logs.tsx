import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Printer, RefreshCw } from "lucide-react";
import { Sidebar } from "../../components/layout/sidebar";
import { getBranchId } from "../../lib/store";

const dateText = (value: any) => new Date(Number(value) < 1e12 ? Number(value) * 1000 : Number(value)).toLocaleString();
const title = (value: string) => value.replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
const simpleAction = (row: any) => {
  const path = String(row.path || "");
  const method = String(row.method || "").toUpperCase();
  const details = String(row.details || "").toLowerCase();
  if (details.includes('"status":"cancelled"')) return "Order cancelled";
  if (path.includes("modifications")) return "Order modification recorded";
  if (path.includes("settlements")) return "Registry settlement recorded";
  if (path.includes("users")) return method === "POST" ? "User created" : method === "DELETE" ? "User deleted" : "User updated";
  if (method === "POST") return `${title(row.entity || "Record")} created`;
  if (method === "DELETE") return `${title(row.entity || "Record")} deleted`;
  if (method === "PATCH" || method === "PUT") return `${title(row.entity || "Record")} updated`;
  return `${title(row.entity || "Record")} activity`;
};
const actionLabel = (value: string) => {
  const [method, ...rest] = String(value).split(" ");
  const path = rest.join(" ");
  const entity = path.split("/").filter(Boolean)[1] || "record";
  if (path.includes("orders") && method === "PATCH") return "Order updated or cancelled";
  if (path.includes("settlements")) return "Registry settlement";
  if (path.includes("users")) return "User account change";
  return `${method === "POST" ? "Created" : method === "DELETE" ? "Deleted" : "Updated"} ${title(entity)}`;
};
const simpleDetails = (row: any) => {
  let value: any = {};
  try { value = JSON.parse(row.details || "{}"); } catch { return row.details || "—"; }
  const parts: string[] = [];
  if (value.cancellationReason) parts.push(`Reason: ${value.cancellationReason}`);
  else if (value.reason) parts.push(`Reason: ${value.reason}`);
  if (value.status && value.status !== "cancelled") parts.push(`Status: ${title(value.status)}`);
  if (value.orderNumber) parts.push(`Order: ${value.orderNumber}`);
  if (value.itemName) parts.push(`Item: ${value.itemName}`);
  if (value.cashAmount != null) parts.push(`Cash: ${value.cashAmount}`);
  if (value.cardAmount != null) parts.push(`Card: ${value.cardAmount}`);
  if (value.settledAmount != null) parts.push(`Settled: ${value.settledAmount}`);
  return parts.join(" · ") || "—";
};

export default function ActivityLogReport() {
  const branchId = getBranchId();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [userId, setUserId] = useState("");
  const [action, setAction] = useState("");
  const { data, isFetching, refetch } = useQuery({
    queryKey: ["activity-logs", branchId, from, to, userId, action],
    queryFn: async () => {
      const params = new URLSearchParams({ branchId: String(branchId || "") });
      if (from) params.set("from", from); if (to) params.set("to", to); if (userId) params.set("userId", userId); if (action) params.set("action", action);
      return (await fetch(`/api/activity-logs?${params}`)).json();
    }, enabled: !!branchId,
  });
  const rows: any[] = data?.activityLogs ?? [];
  const users = useMemo(() => Array.from(new Map(rows.filter(r => r.userId || r.userName).map(r => [String(r.userId ?? r.userName), { id: r.userId, name: r.userName || `User ${r.userId}` }])).values()), [rows]);
  const actions = useMemo(() => Array.from(new Set(rows.map(r => r.action).filter(Boolean))).sort(), [rows]);
  const exportCsv = () => {
    const head = "Date & time,User,Role,Action,Entity,Status,Details";
    const body = rows.map(r => [dateText(r.createdAt), r.userName || "Unknown", r.userRole || "—", simpleAction(r), title(r.entity || "Record"), r.statusCode, simpleDetails(r)].map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([`${head}\n${body}`], { type: "text/csv;charset=utf-8" })); a.download = "activity-log-report.csv"; a.click(); URL.revokeObjectURL(a.href);
  };
  return <div className="flex h-screen" style={{ background: "var(--color-bg)", color: "var(--color-text)" }}><Sidebar /><main className="flex-1 overflow-auto p-6"><div className="flex items-center justify-between mb-5"><div><h1 className="text-xl font-bold">Activity Log Report</h1><p className="text-xs" style={{ color: "var(--color-text-muted)" }}>Complete operational activity across all users, with user-wise filtering.</p></div><div className="flex gap-2"><button onClick={() => window.print()} className="px-3 py-2 rounded border text-xs"><Printer size={14} className="inline mr-1" />Print</button><button onClick={exportCsv} className="px-3 py-2 rounded text-xs font-semibold" style={{ background: "var(--color-gold)", color: "#111" }}><Download size={14} className="inline mr-1" />Export CSV</button></div></div><div className="rounded-xl border p-4 mb-4 flex flex-wrap gap-3 items-end" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}><label className="text-xs">From<input type="date" value={from} onChange={e => setFrom(e.target.value)} className="block mt-1 px-2 py-2 rounded border" /></label><label className="text-xs">To<input type="date" value={to} onChange={e => setTo(e.target.value)} className="block mt-1 px-2 py-2 rounded border" /></label><label className="text-xs">User<select value={userId} onChange={e => setUserId(e.target.value)} className="block mt-1 px-2 py-2 rounded border"><option value="">All users</option>{users.map(u => <option key={String(u.id ?? u.name)} value={u.id ?? ""}>{u.name}</option>)}</select></label><label className="text-xs">Action<select value={action} onChange={e => setAction(e.target.value)} className="block mt-1 px-2 py-2 rounded border"><option value="">All actions</option>{actions.map(a => <option key={a} value={a}>{actionLabel(a)}</option>)}</select></label><button onClick={() => refetch()} className="px-3 py-2 rounded border text-xs"><RefreshCw size={14} className="inline mr-1" />{isFetching ? "Loading…" : "Refresh"}</button><span className="ml-auto text-xs" style={{ color: "var(--color-text-muted)" }}>{rows.length} entr{rows.length === 1 ? "y" : "ies"}</span></div><div className="rounded-xl border overflow-x-auto" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}><table className="w-full text-xs"><thead><tr className="border-b text-left"><th className="p-3">Date & time</th><th className="p-3">User</th><th className="p-3">Role</th><th className="p-3">Action</th><th className="p-3">Entity</th><th className="p-3">Status</th><th className="p-3">Details</th></tr></thead><tbody>{rows.length ? rows.map(r => <tr key={r.id} className="border-b"><td className="p-3 whitespace-nowrap">{dateText(r.createdAt)}</td><td className="p-3">{r.userName || "Unknown"}</td><td className="p-3">{r.userRole || "—"}</td><td className="p-3 font-medium">{simpleAction(r)}</td><td className="p-3">{title(r.entity || "Record")}{r.entityId ? ` #${r.entityId}` : ""}</td><td className="p-3">{r.statusCode}</td><td className="p-3 max-w-md truncate" title={simpleDetails(r)}>{simpleDetails(r)}</td></tr>) : <tr><td colSpan={7} className="p-10 text-center" style={{ color: "var(--color-text-muted)" }}>No activity records found.</td></tr>}</tbody></table></div></main></div>;
}
