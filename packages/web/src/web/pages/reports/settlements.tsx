import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Eye, FileDown, Printer, RefreshCw, X } from "lucide-react";
import { Sidebar } from "../../components/layout/sidebar";
import { getBranchId, getUser } from "../../lib/store";
import { DateRangePicker } from "./layout";

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
  const user = getUser();
  const branchId = Number(user?.branchId ?? user?.branch_id ?? getBranchId());
  const allAccess = ["admin", "manager", "superadmin"].includes(String(user?.role || "").toLowerCase());
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [staff, setStaff] = useState("all");
  const [selectedSettlement, setSelectedSettlement] = useState<any | null>(null);
  const paymentParts = (order: any): { method: string; amount: number }[] => {
    try {
      const parsed = typeof order.paymentsJson === "string" ? JSON.parse(order.paymentsJson) : order.paymentsJson;
      if (Array.isArray(parsed) && parsed.length) return parsed.map((p: any) => ({ method: String(p.method || "Card"), amount: Number(p.amount || 0) })).filter((p: any) => p.amount > 0);
    } catch { /* use stored method below */ }
    return [{ method: String(order.paymentMethod || "Card"), amount: Number(order.total || 0) }];
  };
  const accountedPaymentParts = (order: any) => {
    let remaining = Math.max(0, Number(order.total || 0));
    return paymentParts(order).map(part => {
      const amount = Math.min(Math.max(0, Number(part.amount || 0)), remaining);
      remaining = Math.max(0, remaining - amount);
      return { ...part, amount };
    }).filter(part => part.amount > 0);
  };
  const settlementPaymentType = (row: any) => {
    const cash = Number(row.cashAmount || 0);
    const card = Number(row.cardAmount || 0);
    const qr = Number(row.qrAmount || 0);
    return [cash > 0 ? "Cash" : "", card > 0 ? "Card" : "", qr > 0 ? "QR Pay" : ""].filter(Boolean).join(" + ") || "—";
  };

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["settlement-report", branchId, user?.id ?? user?.name ?? "all"],
    queryFn: async () => {
      const scope = user?.id && !allAccess ? `&settledById=${encodeURIComponent(user.id)}` : "";
      return (await fetch(`/api/settlements?branchId=${branchId}${scope}`)).json();
    },
    refetchInterval: 30000,
  });
  const { data: ordersData } = useQuery({
    queryKey: ["settlement-report-orders", branchId, user?.id ?? user?.name ?? "all"],
    queryFn: async () => {
      const scope = user?.id && !allAccess ? `&cashierId=${encodeURIComponent(user.id)}&placedBy=${encodeURIComponent(user.name || "")}` : "";
      return (await fetch(`/api/orders?branchId=${branchId}${scope}`)).json();
    },
  });

  const settlements: any[] = (data as any)?.settlements || [];
  const orders: any[] = (ordersData as any)?.orders || [];
  const settlementOrders = (settlement: any) => {
    const currentTs = toMs(settlement.settlementDate);
    const settlementUserId = settlement.settledById != null ? String(settlement.settledById) : "";
    const settlementUserName = String(settlement.settledByName || "").trim().toLowerCase();
    const sameDay = settlements.filter(row => {
      if (new Date(toMs(row.settlementDate)).toDateString() !== new Date(currentTs).toDateString()) return false;
      if (settlementUserId) return String(row.settledById ?? "") === settlementUserId;
      return String(row.settledByName || "").trim().toLowerCase() === settlementUserName;
    });
    const previous = sameDay.filter(row => toMs(row.settlementDate) < currentTs).sort((a, b) => toMs(b.settlementDate) - toMs(a.settlementDate))[0];
    const dayStart = new Date(currentTs); dayStart.setHours(0, 0, 0, 0);
    const startTs = Math.max(dayStart.getTime(), previous ? toMs(previous.settlementDate) : 0);
    return orders.filter(order => {
      const ts = toMs(order.createdAt);
      const ownerMatch = settlementUserId
        ? String(order.cashierId ?? "") === settlementUserId || String(order.placedBy || "").trim().toLowerCase() === settlementUserName
        : String(order.placedBy || "").trim().toLowerCase() === settlementUserName;
      return ownerMatch && ts >= startTs && ts <= currentTs && ["completed", "billed", "paid"].includes(String(order.status).toLowerCase());
    }).sort((a, b) => toMs(a.createdAt) - toMs(b.createdAt));
  };
  const settlementDisplay = (row: any) => {
    const registerOrders = settlementOrders(row);
    const billed = registerOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
    const parts = registerOrders.flatMap(order => accountedPaymentParts(order));
    const cash = parts.filter(part => part.method.toLowerCase() === "cash").reduce((sum, part) => sum + part.amount, 0);
    const card = parts.filter(part => part.method.toLowerCase().includes("card")).reduce((sum, part) => sum + part.amount, 0);
    const qr = parts.filter(part => part.method.toLowerCase().includes("qr")).reduce((sum, part) => sum + part.amount, 0);
    const settled = cash + card + qr;
    return { ...row, billedAmount: billed, settledAmount: settled, cashAmount: cash, cardAmount: card, qrAmount: qr };
  };

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

  const displayedSettlements = filtered.map(settlementDisplay);
  const totals = displayedSettlements.reduce((acc, row) => {
    acc.billed += Number(row.billedAmount || 0);
    acc.settled += Number(row.settledAmount || 0);
    acc.cash += Number(row.cashAmount || 0);
    acc.card += Number(row.cardAmount || 0);
    acc.qr += Number(row.qrAmount || 0);
    return acc;
  }, { billed: 0, settled: 0, cash: 0, card: 0, qr: 0 });
  const periodOrders = orders.filter(order => {
    const timestamp = toMs(order.createdAt);
    const start = from ? new Date(`${from}T00:00:00`).getTime() : 0;
    const end = to ? new Date(`${to}T23:59:59.999`).getTime() : Number.MAX_SAFE_INTEGER;
    return timestamp >= start && timestamp <= end && ["completed", "billed", "paid"].includes(String(order.status || "").toLowerCase());
  });
  const invoicedSales = periodOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
  // Exclude only the opening balance created before the first settlement.
  // All unsettled sales after that first settlement remain included.
  const firstSettlementTs = filtered.reduce((earliest, row) => Math.min(earliest, toMs(row.settlementDate)), Number.MAX_SAFE_INTEGER);
  const openingBalance = firstSettlementTs === Number.MAX_SAFE_INTEGER
    ? 0
    : periodOrders
      .filter(order => toMs(order.createdAt) < firstSettlementTs)
      .reduce((sum, order) => sum + Number(order.total || 0), 0);
  const unsettledSales = Math.max(0, invoicedSales - openingBalance - totals.billed);
  const difference = totals.settled - totals.billed;

  const openPrint = (savePdf = false) => {
    const win = window.open("", "_blank", "width=1000,height=750");
    if (!win) return;
    const rows = displayedSettlements.map(row => {
      const diff = Number(row.settledAmount || 0) - Number(row.billedAmount || 0);
      return `<tr><td>${esc(row.id)}</td><td>${esc(new Date(toMs(row.settlementDate)).toLocaleString())}</td><td>${esc(row.settledByName || "—")}</td><td>${esc(settlementPaymentType(row))}</td><td class="num">${money(row.cashAmount)}</td><td class="num">${money(row.cardAmount)}</td><td class="num">${money(row.qrAmount)}</td><td class="num">${money(row.billedAmount)}</td><td class="num">${money(row.settledAmount)}</td><td class="num ${diff === 0 ? "ok" : "bad"}">${money(diff)}</td><td>${esc(row.justification || "—")}</td></tr>`;
    }).join("");
    win.document.write(`<!doctype html><html><head><title>Settlement Report</title><style>@page{size:A4 portrait;margin:0.5in}body{font-family:Arial,sans-serif;color:#111;margin:0}h1{font-size:22px;margin:0 0 4px}p{color:#555;margin:4px 0 16px}.meta{display:flex;gap:28px;margin:14px 0;font-size:12px}.cards{display:flex;gap:10px;margin:14px 0;flex-wrap:wrap}.card{border:1px solid #ccc;padding:10px 14px;min-width:120px}.label{font-size:11px;color:#666}.value{font-size:16px;font-weight:bold;margin-top:5px}table{border-collapse:collapse;width:100%;font-size:10px}th,td{border-bottom:1px solid #ddd;padding:6px;text-align:left}th{background:#f2f2f2}.num{text-align:right}.ok{color:#14833b}.bad{color:#b42318}.total{font-weight:bold;border-top:2px solid #111}@media print{body{margin:0}}</style></head><body><h1>Settlement Report</h1><p>iDine register settlements</p><div class="meta"><span><b>Period:</b> ${esc(from || "All")} to ${esc(to || "All")}</span><span><b>Login:</b> ${esc(user?.name || user?.username || "Staff")}</span><span><b>Generated:</b> ${esc(new Date().toLocaleString())}</span></div><div class="cards"><div class="card"><div class="label">Settlement records</div><div class="value">${filtered.length}</div></div><div class="card"><div class="label">Cash collections</div><div class="value">${money(totals.cash)}</div></div><div class="card"><div class="label">Card collections</div><div class="value">${money(totals.card)}</div></div><div class="card"><div class="label">QR Pay collections</div><div class="value">${money(totals.qr)}</div></div><div class="card"><div class="label">Total settled</div><div class="value">${money(totals.settled)}</div></div><div class="card"><div class="label">Unsettled sales</div><div class="value">${money(unsettledSales)}</div></div></div><table><thead><tr><th>Report ID</th><th>Date & time</th><th>Login user</th><th>Payment type</th><th class="num">Cash</th><th class="num">Card</th><th class="num">QR Pay</th><th class="num">Billed</th><th class="num">Settled</th><th class="num">Difference</th><th>Justification</th></tr></thead><tbody>${rows || `<tr><td colspan="11">No settlement records for this period.</td></tr>`}<tr class="total"><td colspan="4">SETTLEMENT TOTAL</td><td class="num">${money(totals.cash)}</td><td class="num">${money(totals.card)}</td><td class="num">${money(totals.qr)}</td><td class="num">${money(totals.billed)}</td><td class="num">${money(totals.settled)}</td><td class="num">${money(difference)}</td><td></td></tr></tbody></table><p><b>Invoiced sales:</b> ${money(invoicedSales)} &nbsp; <b>Unsettled sales:</b> ${money(unsettledSales)}</p><script>window.onload=()=>window.print()</script></body></html>`);
    win.document.close();
    void savePdf;
  };

  const openSettlementPrint = (row: any) => {
    row = settlementDisplay(row);
    const win = window.open("", "_blank", "width=700,height=650");
    if (!win) return;
    const diff = Number(row.settledAmount || 0) - Number(row.billedAmount || 0);
    const registerOrders = settlementOrders(row);
    const cash = registerOrders.reduce((sum, order) => sum + accountedPaymentParts(order).filter(part => part.method.toLowerCase() === "cash").reduce((s, part) => s + part.amount, 0), 0);
    const card = registerOrders.reduce((sum, order) => sum + accountedPaymentParts(order).filter(part => part.method.toLowerCase().includes("card")).reduce((s, part) => s + part.amount, 0), 0);
    const qr = registerOrders.reduce((sum, order) => sum + accountedPaymentParts(order).filter(part => part.method.toLowerCase().includes("qr")).reduce((s, part) => s + part.amount, 0), 0);
    const orderRows = registerOrders.map(order => `<tr><td>${esc(order.orderNumber || "—")}</td><td>${esc(order.type === "dine-in" ? "Dine-in" : order.type === "takeaway" ? "Takeaway" : order.type === "delivery" ? "Delivery" : order.type || "—")}</td><td>${esc(new Date(toMs(order.createdAt)).toLocaleString())}</td><td>${esc(accountedPaymentParts(order).map(part => part.method).join(" + "))}</td><td class="num">${money(order.total)}</td></tr>`).join("");
    win.document.write(`<!doctype html><html><head><title>iDine Settlement Detail #${esc(row.id)}</title><style>
      @page{size:A4 portrait;margin:0.5in}
      *{box-sizing:border-box}
      body{font-family:Arial,Helvetica,sans-serif;color:#17202a;margin:0;background:#fff;font-size:11px}
      .report{width:100%;max-width:none;margin:0}
      .header{border-bottom:4px solid #b88718;padding:0 0 14px;display:flex;justify-content:space-between;align-items:flex-start}
      .brand{font-size:24px;font-weight:800;letter-spacing:.8px;color:#17324d;margin:0}
      .subtitle{font-size:11px;color:#687585;margin-top:5px;letter-spacing:.5px;text-transform:uppercase}
      .report-title{text-align:right;color:#17324d;font-size:18px;font-weight:700;margin:2px 0 5px}
      .report-id{text-align:right;color:#b88718;font-size:13px;font-weight:700}
      .meta{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;background:#f5f7fa;border:1px solid #dce2e8;border-radius:7px;padding:12px;margin:18px 0}
      .meta-label,.summary-label{display:block;color:#718096;font-size:9px;text-transform:uppercase;letter-spacing:.7px;margin-bottom:4px}
      .meta-value{font-size:11px;font-weight:700;color:#263746}
      .summary{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px}
      .summary-card{border:1px solid #dce2e8;border-top:3px solid #b88718;border-radius:6px;padding:11px 12px;min-height:64px}
      .summary-value{font-size:15px;font-weight:800;color:#17324d;white-space:nowrap}
      .summary-card.cash{border-top-color:#238b5b}.summary-card.card{border-top-color:#3b73b9}.summary-card.total{border-top-color:#17324d}
      .section-title{font-size:13px;font-weight:800;color:#17324d;border-bottom:2px solid #17324d;padding-bottom:7px;margin:18px 0 0}
      table{border-collapse:collapse;width:100%;font-size:9.5px;margin-top:0}
      th{background:#17324d;color:#fff;text-align:left;padding:8px 7px;font-size:9px;text-transform:uppercase;letter-spacing:.35px}
      td{border-bottom:1px solid #e1e6eb;padding:7px;color:#263746;vertical-align:top}
      tbody tr:nth-child(even){background:#f8fafc}
      .num{text-align:right;white-space:nowrap}
      tfoot th{background:#eef2f5;color:#17324d;border-top:2px solid #17324d;text-transform:none;font-size:10px}
      .grand-total th{background:#17324d;color:#fff;font-size:11px}
      .footer{display:flex;justify-content:space-between;gap:35px;margin-top:35px;color:#687585;font-size:9px}
      .signature{width:70mm;border-top:1px solid #697887;padding-top:6px;text-align:center;color:#263746}
      .generated{text-align:right;line-height:1.6}
      @media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}.report{max-width:none}}
    </style></head><body><main class="report">
      <header class="header"><div><h1 class="brand">Manjal Restaurant Jaffna</h1><div class="subtitle">Restaurant Point of Sale</div></div><div><div class="report-title">SETTLEMENT DETAIL</div><div class="report-id">Report #${esc(row.id)}</div></div></header>
      <section class="meta"><div><span class="meta-label">Settlement date & time</span><span class="meta-value">${esc(new Date(toMs(row.settlementDate)).toLocaleString())}</span></div><div><span class="meta-label">Settled by</span><span class="meta-value">${esc(row.settledByName || "—")}</span></div><div><span class="meta-label">User ID</span><span class="meta-value">${esc(row.settledById || "—")}</span></div></section>
      <section class="summary"><div class="summary-card cash"><span class="summary-label">Cash collection</span><div class="summary-value">${money(row.cashAmount || cash)}</div></div><div class="summary-card card"><span class="summary-label">Card collection</span><div class="summary-value">${money(row.cardAmount || card)}</div></div><div class="summary-card"><span class="summary-label">QR Pay collection</span><div class="summary-value">${money(row.qrAmount || qr)}</div></div><div class="summary-card"><span class="summary-label">Payment type</span><div class="summary-value">${esc(settlementPaymentType(row))}</div></div><div class="summary-card total"><span class="summary-label">Total settled</span><div class="summary-value">${money(row.settledAmount)}</div></div></section>
      <section class="section-title">Register Orders <span style="font-weight:400;color:#718096">(${registerOrders.length} finalized orders)</span></section>
      <table><thead><tr><th>Order number</th><th>Order type</th><th>Date & time</th><th>Payment method</th><th class="num">Amount</th></tr></thead><tbody>${orderRows || `<tr><td colspan="5" style="text-align:center;padding:18px;color:#718096">No finalized order details found.</td></tr>`}</tbody><tfoot><tr><th colspan="4">Cash collections</th><th class="num">${money(cash || row.cashAmount)}</th></tr><tr><th colspan="4">Card collections</th><th class="num">${money(card || row.cardAmount)}</th></tr><tr><th colspan="4">QR Pay collections</th><th class="num">${money(qr || row.qrAmount)}</th></tr><tr class="grand-total"><th colspan="4">TOTAL COLLECTIONS</th><th class="num">${money(Number(row.cashAmount || 0) + Number(row.cardAmount || 0) + Number(row.qrAmount || 0))}</th></tr></tfoot></table>
      <footer class="footer"><div class="signature">Authorized user signature</div><div class="generated"><b>Generated:</b> ${esc(new Date().toLocaleString())}<br/><b>Difference:</b> ${money(diff)}</div></footer>
    </main><script>window.onload=()=>window.print()</script></body></html>`);
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
          <DateRangePicker from={from} to={to} setFrom={setFrom} setTo={setTo} compact={false} />
          <label className="text-xs" style={{ color: MUTED }}>Login user<select value={staff} onChange={e => setStaff(e.target.value)} className="block mt-1 rounded border px-2 py-2 text-xs min-w-44" style={{ background: SURF2, borderColor: BORD, color: TEXT }}><option value="all">All users</option>{staffOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <button onClick={() => refetch()} className="flex items-center gap-1.5 px-3 py-2 rounded border text-xs" style={{ borderColor: BORD, color: MUTED }}><RefreshCw size={13} /> Refresh</button>
          <div className="ml-auto flex items-center gap-2 text-xs" style={{ color: DIM }}><CalendarDays size={14} /> {filtered.length} record{filtered.length === 1 ? "" : "s"}</div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-8 gap-3">{[{ label: "Settlement records", value: filtered.length }, { label: "Cash collections", value: money(totals.cash) }, { label: "Card collections", value: money(totals.card) }, { label: "QR Pay collections", value: money(totals.qr) }, { label: "Total invoiced sales", value: money(invoicedSales) }, { label: "Settlement billed", value: money(totals.billed) }, { label: "Total settled", value: money(totals.settled) }, { label: "Unsettled sales", value: money(unsettledSales) }, { label: "Settlement difference", value: money(difference) }].map(card => <div key={card.label} className="rounded-xl border p-4" style={{ background: SURF, borderColor: BORD }}><div className="text-xl font-bold" style={{ color: card.label === "Unsettled sales" && unsettledSales !== 0 ? "var(--color-danger)" : card.label === "Settlement difference" && difference !== 0 ? "var(--color-danger)" : GOLD }}>{card.value}</div><div className="text-xs mt-1" style={{ color: MUTED }}>{card.label}</div></div>)}</div>
        <div className="rounded-xl border overflow-hidden" style={{ background: SURF, borderColor: BORD }}>
          {isLoading ? <div className="p-12 text-center text-sm" style={{ color: MUTED }}>Loading settlements…</div> : <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b" style={{ borderColor: BORD }}>{["Report ID", "Date & time", "Login user", "Payment type", "Cash", "Card", "QR Pay", "Billed amount", "Settled amount", "Difference", "Justification", "Action"].map(h => <th key={h} className="text-left px-4 py-3 font-semibold" style={{ color: DIM }}>{h}</th>)}</tr></thead><tbody>{filtered.length === 0 ? <tr><td colSpan={11} className="p-12 text-center" style={{ color: DIM }}>No settlement records for this period.</td></tr> : displayedSettlements.map(row => { const diff = Number(row.settledAmount || 0) - Number(row.billedAmount || 0); return <tr key={row.id} className="border-b" style={{ borderColor: BORD }}><td className="px-4 py-3 font-semibold" style={{ color: GOLD }}>#{row.id}</td><td className="px-4 py-3" style={{ color: TEXT }}>{new Date(toMs(row.settlementDate)).toLocaleString()}</td><td className="px-4 py-3" style={{ color: TEXT }}>{row.settledByName || "—"}<div className="text-[10px]" style={{ color: DIM }}>ID: {row.settledById || "—"}</div></td><td className="px-4 py-3 font-semibold" style={{ color: TEXT }}>{settlementPaymentType(row)}</td><td className="px-4 py-3" style={{ color: TEXT }}>{money(row.cashAmount)}</td><td className="px-4 py-3" style={{ color: TEXT }}>{money(row.cardAmount)}</td><td className="px-4 py-3" style={{ color: TEXT }}>{money(row.qrAmount)}</td><td className="px-4 py-3" style={{ color: TEXT }}>{money(row.billedAmount)}</td><td className="px-4 py-3 font-semibold" style={{ color: GOLD }}>{money(row.settledAmount)}</td><td className="px-4 py-3" style={{ color: diff === 0 ? "var(--color-success)" : "var(--color-danger)" }}>{money(diff)}</td><td className="px-4 py-3 max-w-xs" style={{ color: MUTED }}>{row.justification || "—"}</td><td className="px-4 py-3"><button onClick={() => setSelectedSettlement(row)} className="inline-flex items-center gap-1 rounded border px-2 py-1.5 font-semibold" style={{ borderColor: BORD, color: GOLD }}><Eye size={13} /> View</button></td></tr>; })}</tbody></table></div>}
        </div>
      </div>
    </div>
    {selectedSettlement && (() => { const row = settlementDisplay(selectedSettlement); const diff = Number(row.settledAmount || 0) - Number(row.billedAmount || 0); const registerOrders = settlementOrders(row); const cash = registerOrders.reduce((sum, order) => sum + accountedPaymentParts(order).filter(part => part.method.toLowerCase() === "cash").reduce((s, part) => s + part.amount, 0), 0); const card = registerOrders.reduce((sum, order) => sum + accountedPaymentParts(order).filter(part => part.method.toLowerCase().includes("card")).reduce((s, part) => s + part.amount, 0), 0);
    const qr = registerOrders.reduce((sum, order) => sum + accountedPaymentParts(order).filter(part => part.method.toLowerCase().includes("qr")).reduce((s, part) => s + part.amount, 0), 0); return <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "#00000099" }}><div className="w-full max-w-3xl max-h-[92vh] rounded-xl border shadow-2xl flex flex-col" style={{ background: SURF, borderColor: BORD }}><div className="flex items-center justify-between px-5 py-4 border-b shrink-0" style={{ borderColor: BORD }}><div><div className="font-bold" style={{ color: TEXT }}>Settlement #{row.id}</div><div className="text-xs mt-1" style={{ color: MUTED }}>{new Date(toMs(row.settlementDate)).toLocaleString()}</div></div><button onClick={() => setSelectedSettlement(null)} style={{ color: MUTED }}><X size={17} /></button></div><div className="p-5 space-y-4 text-sm overflow-y-auto"><div className="grid grid-cols-2 md:grid-cols-4 gap-3"><div><div className="text-xs" style={{ color: DIM }}>Login user</div><div style={{ color: TEXT }}>{row.settledByName || "—"}</div></div><div><div className="text-xs" style={{ color: DIM }}>User ID</div><div style={{ color: TEXT }}>{row.settledById || "—"}</div></div><div><div className="text-xs" style={{ color: DIM }}>Billed amount</div><div className="font-semibold" style={{ color: TEXT }}>{money(row.billedAmount)}</div></div><div><div className="text-xs" style={{ color: DIM }}>Settled amount</div><div className="font-semibold" style={{ color: GOLD }}>{money(row.settledAmount)}</div></div></div><div className="rounded-lg border p-3" style={{ borderColor: BORD }}><div className="grid grid-cols-2 gap-4"><div><div className="text-xs" style={{ color: DIM }}>Finalized cash sales</div><div className="font-bold" style={{ color: TEXT }}>{money(cash)}</div></div><div><div className="text-xs" style={{ color: DIM }}>Finalized card sales</div><div className="font-bold" style={{ color: TEXT }}>{money(card)}</div></div></div><div className="mt-3 pt-3 border-t" style={{ borderColor: BORD }}><div className="text-xs" style={{ color: DIM }}>Difference</div><div className="font-bold" style={{ color: diff === 0 ? "var(--color-success)" : "var(--color-danger)" }}>{money(diff)}</div><div className="text-xs mt-2" style={{ color: DIM }}>Justification: <span style={{ color: TEXT }}>{row.justification || "—"}</span></div></div></div><div><div className="font-semibold mb-2" style={{ color: TEXT }}>Register Orders ({registerOrders.length})</div><div className="rounded-lg border overflow-x-auto" style={{ borderColor: BORD }}><table className="w-full text-xs"><thead><tr style={{ background: SURF2 }}>{["Order number", "Order type", "Date & time", "Payment method", "Amount"].map(h => <th key={h} className="text-left px-3 py-2" style={{ color: DIM }}>{h}</th>)}</tr></thead><tbody>{registerOrders.length === 0 ? <tr><td colSpan={5} className="px-3 py-5 text-center" style={{ color: DIM }}>No finalized order details found for this settlement.</td></tr> : registerOrders.map(order => <tr key={order.id} className="border-t" style={{ borderColor: BORD }}><td className="px-3 py-2" style={{ color: TEXT }}>{order.orderNumber || "—"}</td><td className="px-3 py-2" style={{ color: MUTED }}>{order.type === "dine-in" ? "Dine-in" : order.type === "takeaway" ? "Takeaway" : order.type === "delivery" ? "Delivery" : order.type || "—"}</td><td className="px-3 py-2" style={{ color: MUTED }}>{new Date(toMs(order.createdAt)).toLocaleString()}</td><td className="px-3 py-2" style={{ color: MUTED }}>{accountedPaymentParts(order).map(part => `${part.method} (${money(part.amount)})`).join(" + ")}</td><td className="px-3 py-2 font-semibold" style={{ color: GOLD }}>{money(order.total)}</td></tr>)}</tbody><tfoot><tr className="border-t font-semibold" style={{ borderColor: BORD }}><td colSpan={4} className="px-3 py-2" style={{ color: TEXT }}>Cash</td><td className="px-3 py-2" style={{ color: TEXT }}>{money(cash)}</td></tr><tr className="font-semibold"><td colSpan={4} className="px-3 py-2" style={{ color: TEXT }}>Card / Other</td><td className="px-3 py-2" style={{ color: TEXT }}>{money(card)}</td></tr><tr className="border-t font-bold" style={{ borderColor: BORD }}><td colSpan={4} className="px-3 py-2" style={{ color: TEXT }}>Total collections</td><td className="px-3 py-2" style={{ color: GOLD }}>{money(registerOrders.reduce((sum, order) => sum + Number(order.total || 0), 0))}</td></tr></tfoot></table></div></div></div><div className="flex justify-end gap-2 px-5 py-4 border-t shrink-0" style={{ borderColor: BORD }}><button onClick={() => openSettlementPrint(row)} className="flex items-center gap-1.5 rounded border px-3 py-2 text-xs font-semibold" style={{ borderColor: BORD, color: TEXT }}><Printer size={14} /> Print / Save PDF</button><button onClick={() => setSelectedSettlement(null)} className="rounded px-3 py-2 text-xs font-semibold" style={{ background: GOLD, color: "#111" }}>Close</button></div></div></div>; })()}
  </div>;
}
