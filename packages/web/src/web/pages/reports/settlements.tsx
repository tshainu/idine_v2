import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Eye, FileDown, Printer, RefreshCw, X } from "lucide-react";
import { Sidebar } from "../../components/layout/sidebar";
import { getBranchId, getUser } from "../../lib/store";

const BG = "var(--color-bg)";
const SURF = "var(--color-surface)";
const SURF2 = "var(--color-surface-2)";
const BORD = "var(--color-border)";
const GOLD = "var(--color-gold)";
const TEXT = "var(--color-text)";
const MUTED = "var(--color-text-muted)";
const DIM = "var(--color-text-dim)";

const money = (value: any) => `LKR ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const toMs = (value: any) => {
  const n = Number(value);
  if (Number.isFinite(n) && n > 0) return n < 1e12 ? n * 1000 : n;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};
const dateInput = (ms: number) => {
  const d = new Date(ms);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};
const esc = (value: any) => String(value ?? "").replace(/[&<>\"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c] || c));

export default function SettlementReport() {
  const branchId = getBranchId();
  const user = getUser();
  const allAccess = ["admin", "manager", "superadmin"].includes(String(user?.role || "").toLowerCase());
  const today = dateInput(Date.now());
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [staff, setStaff] = useState("all");
  const [selectedSettlement, setSelectedSettlement] = useState<any | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["settlement-report", branchId, user?.id ?? user?.name ?? "all"],
    queryFn: async () => {
      const scope = user?.id && !allAccess ? `&settledById=${encodeURIComponent(user.id)}` : "";
      return (await fetch(`/api/settlements?branchId=${branchId}${scope}`)).json();
    },
    refetchInterval: 30000,
  });

  const settlements: any[] = (data as any)?.settlements || [];
  const filtered = useMemo(() => {
    const start = from ? new Date(`${from}T00:00:00`).getTime() : 0;
    const end = to ? new Date(`${to}T23:59:59.999`).getTime() : Number.MAX_SAFE_INTEGER;
    return settlements.filter(row => {
      const timestamp = toMs(row.settlementDate);
      const staffMatch = staff === "all" || String(row.settledById ?? row.settledByName ?? "") === staff;
      return timestamp >= start && timestamp <= end && staffMatch;
    }).sort((a, b) => toMs(b.settlementDate) - toMs(a.settlementDate));
  }, [settlements, from, to, staff]);

  const staffOptions = useMemo(() => {
    const values = new Map<string, string>();
    settlements.forEach(row => {
      const key = String(row.settledById ?? row.settledByName ?? "");
      if (key) values.set(key, row.settledByName || `User ${row.settledById}`);
    });
    return [...values.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [settlements]);

  const totals = filtered.reduce((acc, row) => {
    acc.billed += Number(row.billedAmount || 0);
    acc.settled += Number(row.settledAmount || 0);
    return acc;
  }, { billed: 0, settled: 0 });
  const difference = totals.settled - totals.billed;

  const openPrint = (savePdf = false) => {
    const win = window.open("", "_blank", "width=1000,height=750");
    if (!win) return;
    const rows = filtered.map(row => {
      const diff = Number(row.settledAmount || 0) - Number(row.billedAmount || 0);
      return `<tr><td>${esc(new Date(toMs(row.settlementDate)).toLocaleString())}</td><td>${esc(row.settledByName || "—")}</td><td class="num">${money(row.billedAmount)}</td><td class="num">${money(row.settledAmount)}</td><td class="num ${diff === 0 ? "ok" : "bad"}">${money(diff)}</td><td>${esc(row.justification || "—")}</td></tr>`;
    }).join("");
    win.document.write(`<!doctype html><html><head><title>Settlement Report</title><style>body{font-family:Arial,sans-serif;color:#111;margin:28px}h1{font-size:22px;margin:0 0 4px}p{color:#555;margin:4px 0 16px}.meta{display:flex;gap:28px;margin:14px 0;font-size:12px}.cards{display:flex;gap:12px;margin:14px 0}.card{border:1px solid #ccc;padding:10px 14px;min-width:150px}.label{font-size:11px;color:#666}.value{font-size:16px;font-weight:bold;margin-top:5px}table{border-collapse:collapse;width:100%;font-size:11px}th,td{border-bottom:1px solid #ddd;padding:8px;text-align:left}th{background:#f2f2f2}.num{text-align:right}.ok{color:#14833b}.bad{color:#b42318}.total{font-weight:bold;border-top:2px solid #111}@media print{body{margin:12mm}}</style></head><body><h1>Settlement Report</h1><p>iDine register settlements</p><div class="meta"><span><b>Period:</b> ${esc(from || "All")} to ${esc(to || "All")}</span><span><b>Login:</b> ${esc(user?.name || user?.username || "Staff")}</span><span><b>Generated:</b> ${esc(new Date().toLocaleString())}</span></div><div class="cards"><div class="card"><div class="label">Settlements</div><div class="value">${filtered.length}</div></div><div class="card"><div class="label">Total billed</div><div class="value">${money(totals.billed)}</div></div><div class="card"><div class="label">Total settled</div><div class="value">${money(totals.settled)}</div></div><div class="card"><div class="label">Difference</div><div class="value">${money(difference)}</div></div></div><table><thead><tr><th>Date & time</th><th>Login user</th><th class="num">Billed</th><th class="num">Settled</th><th class="num">Difference</th><th>Justification</th></tr></thead><tbody>${rows || `<tr><td colspan="6">No settlement records for this period.</td></tr>`}<tr class="total"><td colspan="2">TOTAL</td><td class="num">${money(totals.billed)}</td><td class="num">${money(totals.settled)}</td><td class="num">${money(difference)}</td><td></td></tr></tbody></table><script>window.onload=()=>window.print()</script></body></html>`);
    win.document.close();
    void savePdf;
  };

  const openSettlementPrint = (row: any) => {
    const win = window.open("", "_blank", "width=700,height=650");
    if (!win) return;
    const diff = Number(row.settledAmount || 0) - Number(row.billedAmount || 0);
    win.document.write(`<!doctype html><html><head><title>Settlement ${esc(row.id)}</title><style>body{font-family:Arial,sans-serif;color:#111;margin:32px;max-width:720px}h1{font-size:22px;margin:0 0 4px}p{color:#555}.box{border:1px solid #ccc;padding:18px;margin-top:20px}.line{display:flex;justify-content:space-between;border-bottom:1px solid #ddd;padding:10px 0}.label{color:#666}.value{font-weight:bold}.total{font-size:18px;border-top:2px solid #111;border-bottom:0}.bad{color:#b42318}.ok{color:#14833b}@media print{body{margin:12mm}}</style></head><body><h1>Settlement Detail</h1><p>iDine Register Settlement #${esc(row.id)}</p><div class="box"><div class="line"><span class="label">Settlement date & time</span><span class="value">${esc(new Date(toMs(row.settlementDate)).toLocaleString())}</span></div><div class="line"><span class="label">Login user</span><span class="value">${esc(row.settledByName || "—")}</span></div><div class="line"><span class="label">User ID</span><span class="value">${esc(row.settledById || "—")}</span></div><div class="line"><span class="label">Billed amount</span><span class="value">${money(row.billedAmount)}</span></div><div class="line"><span class="label">Settled amount</span><span class="value">${money(row.settledAmount)}</span></div><div class="line"><span class="label">Difference</span><span class="value ${diff === 0 ? "ok" : "bad"}">${money(diff)}</span></div><div class="line"><span class="label">Justification</span><span class="value">${esc(row.justification || "—")}</span></div><div class="line total"><span>Total settled</span><span>${money(row.settledAmount)}</span></div></div><p>Printed: ${esc(new Date().toLocaleString())}</p><script>window.onload=()=>window.print()</script></body></html>`);
    win.document.close();
  };

  return <div className="flex h-screen overflow-hidden" style={{ background: BG }}>
    <Sidebar />
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="h-14 flex items-center justify-between px-6 border-b shrink-0" style={{ background: SURF, borderColor: BORD }}>
        <div><div className="font-bold text-base" style={{ color: TEXT }}>Settlement Report</div><div className="text-xs mt-0.5" style={{ color: MUTED }}>Date and timewise register settlement audit</div></div>
        <div className="flex gap-2"><button onClick={() => openPrint(false)} className="flex items-center gap-1.5 px-3 py-2 rounded border text-xs font-semibold" style={{ borderColor: BORD, color: TEXT, background: SURF2 }}><Printer size={14} /> Print</button><button onClick={() => openPrint(true)} className="flex items-center gap-1.5 px-3 py-2 rounded text-xs font-semibold" style={{ background: GOLD, color: "#111" }}><FileDown size={14} /> Save PDF</button></div>
      </div>
      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        <div className="rounded-xl border p-4 flex flex-wrap items-end gap-3" style={{ background: SURF, borderColor: BORD }}>
          <label className="text-xs" style={{ color: MUTED }}>From<input type="date" value={from} onChange={e => setFrom(e.target.value)} className="block mt-1 rounded border px-2 py-2 text-xs" style={{ background: SURF2, borderColor: BORD, color: TEXT }} /></label>
          <label className="text-xs" style={{ color: MUTED }}>To<input type="date" value={to} onChange={e => setTo(e.target.value)} className="block mt-1 rounded border px-2 py-2 text-xs" style={{ background: SURF2, borderColor: BORD, color: TEXT }} /></label>
          <label className="text-xs" style={{ color: MUTED }}>Login user<select value={staff} onChange={e => setStaff(e.target.value)} className="block mt-1 rounded border px-2 py-2 text-xs min-w-44" style={{ background: SURF2, borderColor: BORD, color: TEXT }}><option value="all">All users</option>{staffOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <button onClick={() => refetch()} className="flex items-center gap-1.5 px-3 py-2 rounded border text-xs" style={{ borderColor: BORD, color: MUTED }}><RefreshCw size={13} /> Refresh</button>
          <div className="ml-auto flex items-center gap-2 text-xs" style={{ color: DIM }}><CalendarDays size={14} /> {filtered.length} record{filtered.length === 1 ? "" : "s"}</div>
        </div>
        <div className="grid grid-cols-4 gap-3">{[{ label: "Settlements", value: filtered.length }, { label: "Total billed", value: money(totals.billed) }, { label: "Total settled", value: money(totals.settled) }, { label: "Difference", value: money(difference) }].map(card => <div key={card.label} className="rounded-xl border p-4" style={{ background: SURF, borderColor: BORD }}><div className="text-xl font-bold" style={{ color: card.label === "Difference" && difference !== 0 ? "var(--color-danger)" : GOLD }}>{card.value}</div><div className="text-xs mt-1" style={{ color: MUTED }}>{card.label}</div></div>)}</div>
        <div className="rounded-xl border overflow-hidden" style={{ background: SURF, borderColor: BORD }}>
          {isLoading ? <div className="p-12 text-center text-sm" style={{ color: MUTED }}>Loading settlements…</div> : <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b" style={{ borderColor: BORD }}>{["Date & time", "Login user", "Billed amount", "Settled amount", "Difference", "Justification", "Action"].map(h => <th key={h} className="text-left px-4 py-3 font-semibold" style={{ color: DIM }}>{h}</th>)}</tr></thead><tbody>{filtered.length === 0 ? <tr><td colSpan={7} className="p-12 text-center" style={{ color: DIM }}>No settlement records for this period.</td></tr> : filtered.map(row => { const diff = Number(row.settledAmount || 0) - Number(row.billedAmount || 0); return <tr key={row.id} className="border-b" style={{ borderColor: BORD }}><td className="px-4 py-3" style={{ color: TEXT }}>{new Date(toMs(row.settlementDate)).toLocaleString()}</td><td className="px-4 py-3" style={{ color: TEXT }}>{row.settledByName || "—"}<div className="text-[10px]" style={{ color: DIM }}>ID: {row.settledById || "—"}</div></td><td className="px-4 py-3" style={{ color: TEXT }}>{money(row.billedAmount)}</td><td className="px-4 py-3 font-semibold" style={{ color: GOLD }}>{money(row.settledAmount)}</td><td className="px-4 py-3" style={{ color: diff === 0 ? "var(--color-success)" : "var(--color-danger)" }}>{money(diff)}</td><td className="px-4 py-3 max-w-xs" style={{ color: MUTED }}>{row.justification || "—"}</td><td className="px-4 py-3"><button onClick={() => setSelectedSettlement(row)} className="inline-flex items-center gap-1 rounded border px-2 py-1.5 font-semibold" style={{ borderColor: BORD, color: GOLD }}><Eye size={13} /> View</button></td></tr>; })}</tbody></table></div>}
        </div>
      </div>
    </div>
    {selectedSettlement && (() => { const row = selectedSettlement; const diff = Number(row.settledAmount || 0) - Number(row.billedAmount || 0); return <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "#00000099" }}><div className="w-full max-w-lg rounded-xl border shadow-2xl" style={{ background: SURF, borderColor: BORD }}><div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: BORD }}><div><div className="font-bold" style={{ color: TEXT }}>Settlement #{row.id}</div><div className="text-xs mt-1" style={{ color: MUTED }}>{new Date(toMs(row.settlementDate)).toLocaleString()}</div></div><button onClick={() => setSelectedSettlement(null)} style={{ color: MUTED }}><X size={17} /></button></div><div className="p-5 space-y-3 text-sm"><div className="grid grid-cols-2 gap-3"><div><div className="text-xs" style={{ color: DIM }}>Login user</div><div style={{ color: TEXT }}>{row.settledByName || "—"}</div></div><div><div className="text-xs" style={{ color: DIM }}>User ID</div><div style={{ color: TEXT }}>{row.settledById || "—"}</div></div><div><div className="text-xs" style={{ color: DIM }}>Billed amount</div><div className="font-semibold" style={{ color: TEXT }}>{money(row.billedAmount)}</div></div><div><div className="text-xs" style={{ color: DIM }}>Settled amount</div><div className="font-semibold" style={{ color: GOLD }}>{money(row.settledAmount)}</div></div></div><div className="rounded-lg border p-3" style={{ borderColor: BORD }}><div className="text-xs" style={{ color: DIM }}>Difference</div><div className="font-bold" style={{ color: diff === 0 ? "var(--color-success)" : "var(--color-danger)" }}>{money(diff)}</div></div><div><div className="text-xs" style={{ color: DIM }}>Justification</div><div className="mt-1" style={{ color: TEXT }}>{row.justification || "—"}</div></div></div><div className="flex justify-end gap-2 px-5 py-4 border-t" style={{ borderColor: BORD }}><button onClick={() => openSettlementPrint(row)} className="flex items-center gap-1.5 rounded border px-3 py-2 text-xs font-semibold" style={{ borderColor: BORD, color: TEXT }}><Printer size={14} /> Print / Save PDF</button><button onClick={() => setSelectedSettlement(null)} className="rounded px-3 py-2 text-xs font-semibold" style={{ background: GOLD, color: "#111" }}>Close</button></div></div></div>; })()}
  </div>;
}
