import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { getUser } from "../lib/store";
import { Spinner } from "./ui/spinner";
import { X, Search, Printer, QrCode, RotateCcw, FileText, ChevronDown, ChevronUp, Check, AlertTriangle } from "lucide-react";

// ── Theme tokens ──────────────────────────────────────────────────────────────
const BG    = "var(--color-bg)";
const SURF  = "var(--color-surface)";
const SURF2 = "var(--color-surface-2)";
const BORD  = "var(--color-border)";
const GOLD  = "var(--color-gold)";
const TEXT  = "var(--color-text)";
const MUTED = "var(--color-text-muted)";
const DIM   = "var(--color-text-dim)";

const money = (n: number) => `Rs ${Number(n || 0).toFixed(2)}`;
const fmtTime = (ts: number) => {
  if (!ts) return "—";
  const d = new Date(ts < 1e12 ? ts * 1000 : ts);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
};

function Shell({ title, onClose, children, width = 560 }: { title: string; onClose: () => void; children: any; width?: number }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "#00000099" }}>
      <div className="rounded-lg border flex flex-col max-h-[88vh]" style={{ background: SURF, borderColor: BORD, width }}>
        <div className="flex items-center justify-between px-5 py-3 border-b shrink-0" style={{ borderColor: BORD }}>
          <span className="text-sm font-bold" style={{ color: GOLD }}>{title}</span>
          <button onClick={onClose} style={{ color: MUTED }}><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  DRAFT SALES MODAL
// ════════════════════════════════════════════════════════════════════════════
export function DraftSalesModal({ branchId, onClose, onLoad }: {
  branchId: number; onClose: () => void; onLoad: (orderId: number) => void;
}) {
  const [q, setQ] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["orders", branchId, "draft"],
    queryFn: async () => (await api.orders.$get({ query: { branchId: String(branchId), status: "draft" } })).json(),
  });
  const drafts = ((data as any)?.orders || []).filter((o: any) =>
    !q || o.orderNumber?.toLowerCase().includes(q.toLowerCase()) || o.customerName?.toLowerCase().includes(q.toLowerCase()));

  return (
    <Shell title="Draft Sales" onClose={onClose}>
      <div className="px-4 py-2.5 border-b" style={{ borderColor: BORD }}>
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded border" style={{ background: SURF2, borderColor: BORD }}>
          <Search size={13} style={{ color: MUTED }} />
          <input className="flex-1 bg-transparent text-xs focus:outline-none" style={{ color: TEXT }}
            placeholder="Search draft no / customer…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {isLoading ? <div className="flex justify-center p-8"><Spinner /></div>
          : drafts.length === 0 ? <div className="text-center p-10 text-xs" style={{ color: DIM }}>No draft sales</div>
          : drafts.map((o: any) => (
            <button key={o.id} onClick={() => { onLoad(o.id); onClose(); }}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded mb-1 border text-left transition-all hover:brightness-110"
              style={{ background: SURF2, borderColor: BORD }}>
              <div>
                <div className="text-xs font-bold font-mono" style={{ color: GOLD }}>{o.orderNumber}</div>
                <div className="text-[11px] mt-0.5" style={{ color: MUTED }}>{o.customerName || "Walk-in"} · {fmtTime(o.createdAt)}</div>
              </div>
              <div className="text-right">
                <div className="text-xs font-bold" style={{ color: TEXT }}>{money(o.total)}</div>
                <div className="text-[10px] uppercase mt-0.5 px-1.5 py-0.5 rounded inline-block" style={{ background: "var(--color-gold)22", color: "var(--color-gold)" }}>{o.type}</div>
              </div>
            </button>
          ))}
      </div>
    </Shell>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  RECENT SALES MODAL  (last 15 completed)
// ════════════════════════════════════════════════════════════════════════════
const SALE_STATUSES = ["all", "completed", "refunded", "partially_refunded"] as const;
type SaleStatus = typeof SALE_STATUSES[number];

const STATUS_LABEL: Record<SaleStatus, string> = {
  all: "All",
  completed: "Completed",
  refunded: "Refunded",
  partially_refunded: "Partial Refund",
};

const STATUS_COLOR: Record<SaleStatus, string> = {
  all: GOLD,
  completed: "var(--color-success)",
  refunded: "var(--color-danger)",
  partially_refunded: "#F97316",
};

export function RecentSalesModal({ branchId, onClose, onView, onReprint }: {
  branchId: number; onClose: () => void; onView: (orderId: number) => void; onReprint: (orderId: number) => void;
}) {
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<SaleStatus>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["orders", branchId, "recent-sales"],
    queryFn: async () => (await api.orders.$get({ query: { branchId: String(branchId) } })).json(),
    refetchInterval: 15000,
  });

  const sales = useMemo(() => {
    const SALE_STATUS_SET = new Set(["completed", "refunded", "partially_refunded"]);
    let all = ((data as any)?.orders || [])
      .filter((o: any) => SALE_STATUS_SET.has(o.status))
      .slice()
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 50);
    if (statusFilter !== "all") all = all.filter((o: any) => o.status === statusFilter);
    if (q) {
      const lq = q.toLowerCase();
      all = all.filter((o: any) => o.orderNumber?.toLowerCase().includes(lq) || o.customerName?.toLowerCase().includes(lq));
    }
    return all.slice(0, 15);
  }, [data, q, statusFilter]);

  return (
    <Shell title="Recent Sales — Last 15" onClose={onClose} width={620}>
      {/* Search */}
      <div className="px-4 py-2.5 border-b" style={{ borderColor: BORD }}>
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded border" style={{ background: SURF2, borderColor: BORD }}>
          <Search size={13} style={{ color: MUTED }} />
          <input className="flex-1 bg-transparent text-xs focus:outline-none" style={{ color: TEXT }}
            placeholder="Search sale no / customer…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
      </div>
      {/* Status filter tabs */}
      <div className="flex gap-1 px-4 py-2 border-b" style={{ borderColor: BORD }}>
        {SALE_STATUSES.map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className="px-2.5 py-1 rounded text-[11px] font-medium border transition-colors"
            style={{
              background: statusFilter === s ? STATUS_COLOR[s] : "transparent",
              color: statusFilter === s ? "#fff" : MUTED,
              borderColor: statusFilter === s ? STATUS_COLOR[s] : BORD,
            }}>
            {STATUS_LABEL[s]}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {isLoading ? <div className="flex justify-center p-8"><Spinner /></div>
          : sales.length === 0 ? <div className="text-center p-10 text-xs" style={{ color: DIM }}>No sales found</div>
          : sales.map((o: any) => {
            const isRefund = o.status === "refunded";
            const isPartial = o.status === "partially_refunded";
            const badgeColor = isRefund ? "var(--color-danger)" : isPartial ? "#F97316" : "var(--color-success)";
            const badgeLabel = isRefund ? "Refunded" : isPartial ? "Partial Ref." : "Completed";
            return (
              <div key={o.id}
                className="flex items-center justify-between px-3 py-2.5 rounded mb-1 border"
                style={{ background: SURF2, borderColor: BORD }}>
                <div className="cursor-pointer flex-1" onClick={() => onView(o.id)}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold font-mono" style={{ color: GOLD }}>{o.orderNumber}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold" style={{ background: badgeColor + "22", color: badgeColor }}>{badgeLabel}</span>
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: MUTED }}>{o.customerName || "Walk-in"} · {fmtTime(o.createdAt)}</div>
                </div>
                <div className="text-right mr-3">
                  <div className="text-xs font-bold" style={{ color: isRefund || isPartial ? "var(--color-danger)" : TEXT }}>{money(o.total)}</div>
                  <div className="text-[10px] uppercase mt-0.5" style={{ color: DIM }}>{o.type}</div>
                </div>
                <button onClick={() => onReprint(o.id)} title="Reprint invoice"
                  className="w-7 h-7 flex items-center justify-center rounded border shrink-0"
                  style={{ borderColor: BORD, color: GOLD }}>
                  <Printer size={13} />
                </button>
              </div>
            );
          })}
      </div>
    </Shell>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  SELF / ONLINE ORDERS — QR
// ════════════════════════════════════════════════════════════════════════════
export function SelfOrderQRModal({ branchId, onClose }: { branchId: number; onClose: () => void }) {
  const orderUrl = `${window.location.origin}/order?branch=${branchId}`;
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=8&data=${encodeURIComponent(orderUrl)}`;
  const [copied, setCopied] = useState(false);

  return (
    <Shell title="Self / Online Orders" onClose={onClose} width={400}>
      <div className="p-6 flex flex-col items-center">
        <p className="text-xs text-center mb-4" style={{ color: MUTED }}>
          Customers scan this QR to place self-service orders from their phone.
        </p>
        <div className="p-3 rounded-lg bg-white">
          <img src={qrSrc} alt="Order QR" width={240} height={240} />
        </div>
        <div className="mt-4 w-full flex items-center gap-2 px-2.5 py-1.5 rounded border" style={{ background: SURF2, borderColor: BORD }}>
          <QrCode size={13} style={{ color: GOLD }} />
          <input readOnly value={orderUrl} className="flex-1 bg-transparent text-[11px] focus:outline-none" style={{ color: TEXT }} />
          <button onClick={() => { navigator.clipboard.writeText(orderUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className="text-[11px] font-semibold px-2 py-1 rounded" style={{ background: GOLD, color: "#000" }}>
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
    </Shell>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  REGISTRY — Today's Register Summary
// ════════════════════════════════════════════════════════════════════════════
export function RegistryModal({ branchId, onClose }: { branchId: number; onClose: () => void }) {
  const qc = useQueryClient();
  const user = getUser();
  const [showSettlement, setShowSettlement] = useState(false);
  const [settledAmount, setSettledAmount] = useState("");
  const [justification, setJustification] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["orders", branchId, "registry"],
    queryFn: async () => (await api.orders.$get({ query: { branchId: String(branchId) } })).json(),
    refetchInterval: 15000,
  });
  const { data: settlementData } = useQuery({
    queryKey: ["settlements", branchId],
    queryFn: async () => (await fetch(`/api/settlements?branchId=${branchId}`)).json(),
    refetchInterval: 15000,
  });
  const settlements = (settlementData as any)?.settlements || [];
  const todaySettlement = settlements
    .filter((row: any) => new Date(row.settlementDate).toDateString() === new Date().toDateString())
    .sort((a: any, b: any) => new Date(b.settlementDate).getTime() - new Date(a.settlementDate).getTime())[0];
  const summary = useMemo(() => {
    const orders = (data as any)?.orders || [];
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const settlementTs = todaySettlement ? new Date(todaySettlement.settlementDate).getTime() : 0;
    const startTs = Math.max(start.getTime(), settlementTs);
    const isToday = (o: any) => {
      const raw = o.createdAt ?? 0;
      const ms = typeof raw === "number" ? (raw < 1e12 ? raw * 1000 : raw) : new Date(raw).getTime();
      return !isNaN(ms) && ms >= startTs;
    };
    const today = orders.filter(isToday);
    const completed = today.filter((o: any) => ["completed", "paid"].includes(o.status));
    const cancelled = today.filter((o: any) => o.status === "cancelled");
    const running = today.filter((o: any) => !["completed", "paid", "cancelled"].includes(o.status));
    const gross = completed.reduce((s: number, o: any) => s + Number(o.total || 0), 0);
    const byType = (t: string) => completed.filter((o: any) => o.type === t);
    const sumType = (t: string) => byType(t).reduce((s: number, o: any) => s + Number(o.total || 0), 0);
    return {
      totalOrders: today.length, completedCount: completed.length, cancelledCount: cancelled.length,
      runningCount: running.length, gross, avg: completed.length ? gross / completed.length : 0,
      dineIn: { c: byType("dine-in").length, v: sumType("dine-in") },
      takeaway: { c: byType("takeaway").length, v: sumType("takeaway") },
      delivery: { c: byType("delivery").length, v: sumType("delivery") },
    };
  }, [data, todaySettlement]);
  const openSettlement = () => {
    setSettledAmount(summary.gross.toFixed(2));
    setJustification("");
    setShowSettlement(true);
  };
  const settlementMutation = useMutation({
    mutationFn: async () => {
      const amount = Number(settledAmount);
      if (!Number.isFinite(amount) || amount < 0) throw new Error("Enter a valid settled amount.");
      if (Math.abs(amount - summary.gross) > 0.005 && justification.trim().length < 3) {
        throw new Error("Justification is required when the settled amount differs from billed amount.");
      }
      const res = await fetch("/api/settlements", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId, billedAmount: summary.gross, settledAmount: amount,
          justification, settledById: user?.id ?? null, settledByName: user?.name ?? user?.username ?? null,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Settlement failed.");
      return body;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["settlements", branchId] }); setShowSettlement(false); },
  });
  const Stat = ({ label, value, accent }: { label: string; value: string; accent?: string }) => (
    <div className="rounded-lg border px-4 py-3" style={{ background: SURF2, borderColor: BORD }}>
      <div className="text-[11px] uppercase tracking-wide" style={{ color: DIM }}>{label}</div>
      <div className="text-lg font-bold mt-1" style={{ color: accent || TEXT }}>{value}</div>
    </div>
  );
  const today = new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  return (
    <Shell title="Register — Today's Summary" onClose={onClose} width={580}>
      {isLoading ? <div className="flex justify-center p-12"><Spinner /></div> : (
        <div className="p-5 overflow-y-auto">
          <div className="text-xs mb-4" style={{ color: MUTED }}>{today}</div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <Stat label="Billed Amount" value={money(summary.gross)} accent={GOLD} />
            <Stat label="Completed Sales" value={String(summary.completedCount)} />
            <Stat label="Avg. Sale Value" value={money(summary.avg)} />
            <Stat label="Total Orders" value={String(summary.totalOrders)} />
          </div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <Stat label="Running" value={String(summary.runningCount)} accent="var(--color-info)" />
            <Stat label="Cancelled" value={String(summary.cancelledCount)} accent="var(--color-danger)" />
          </div>
          <div className="text-[11px] uppercase tracking-wide mb-2" style={{ color: DIM }}>Sales by Type</div>
          <div className="rounded-lg border overflow-hidden" style={{ borderColor: BORD }}>
            {[
              { label: "Dine In", d: summary.dineIn, color: "var(--color-success)" },
              { label: "Take Away", d: summary.takeaway, color: "var(--color-gold)" },
              { label: "Delivery", d: summary.delivery, color: "var(--color-info)" },
            ].map((row, i) => (
              <div key={row.label} className="flex items-center justify-between px-4 py-2.5" style={{ background: i % 2 ? SURF2 : SURF, borderTop: i ? `1px solid ${BORD}` : "none" }}>
                <span className="flex items-center gap-2 text-xs" style={{ color: TEXT }}><span className="w-2 h-2 rounded-full" style={{ background: row.color }} /> {row.label}</span>
                <span className="text-xs" style={{ color: MUTED }}>{row.d.c} orders</span>
                <span className="text-xs font-bold" style={{ color: TEXT }}>{money(row.d.v)}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-lg border p-3" style={{ background: SURF2, borderColor: todaySettlement ? "var(--color-success)" : BORD }}>
            <div className="flex items-center justify-between text-xs mb-2"><div><div className="font-semibold" style={{ color: todaySettlement ? "var(--color-success)" : TEXT }}>{todaySettlement ? "New register session" : "Not settled"}</div>{todaySettlement && <div style={{ color: MUTED }}>Last settled {fmtTime(todaySettlement.settlementDate)} · {todaySettlement.settledByName || "Staff"}</div>}</div><div className="text-right">{todaySettlement && <><div style={{ color: TEXT }}>Previous billed {money(todaySettlement.billedAmount)}</div><div style={{ color: GOLD }}>Previous settled {money(todaySettlement.settledAmount)}</div></>}</div></div>
            <button disabled={summary.gross <= 0} onClick={openSettlement} className="w-full rounded-md py-2 text-xs font-bold disabled:opacity-50" style={{ background: GOLD, color: "#111" }}>Settle Current Register</button>
          </div>
        </div>
      )}
      {showSettlement && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ background: "#00000099" }}>
          <div className="w-80 rounded-xl border p-5 shadow-2xl" style={{ background: SURF, borderColor: BORD }}>
            <div className="flex items-center justify-between mb-4"><span className="text-sm font-bold" style={{ color: GOLD }}>Settle Register</span><button onClick={() => setShowSettlement(false)} style={{ color: MUTED }}><X size={15} /></button></div>
            <label className="block text-xs mb-1" style={{ color: MUTED }}>Amount billed</label>
            <input readOnly value={money(summary.gross)} className="w-full rounded border px-3 py-2 text-sm mb-3" style={{ background: SURF2, color: TEXT, borderColor: BORD }} />
            <label className="block text-xs mb-1" style={{ color: MUTED }}>Settled amount</label>
            <input type="number" min="0" step="0.01" value={settledAmount} onChange={e => setSettledAmount(e.target.value)} className="w-full rounded border px-3 py-2 text-sm mb-3" style={{ background: SURF2, color: TEXT, borderColor: BORD }} />
            {Math.abs(Number(settledAmount || 0) - summary.gross) > 0.005 && <><label className="block text-xs mb-1" style={{ color: MUTED }}>Justification *</label><textarea value={justification} onChange={e => setJustification(e.target.value)} rows={3} placeholder="Explain the difference" className="w-full rounded border px-3 py-2 text-xs mb-3" style={{ background: SURF2, color: TEXT, borderColor: BORD }} /></>}
            {settlementMutation.error && <div className="text-xs mb-3" style={{ color: "var(--color-danger)" }}>{(settlementMutation.error as Error).message}</div>}
            <button disabled={settlementMutation.isPending} onClick={() => settlementMutation.mutate()} className="w-full rounded-md py-2 text-xs font-bold disabled:opacity-50" style={{ background: GOLD, color: "#111" }}>{settlementMutation.isPending ? "Saving…" : "Confirm Settlement"}</button>
          </div>
        </div>
      )}
    </Shell>
  );
}
// ════════════════════════════════════════════════════════════════════════════
//  REFUND MODAL
// ════════════════════════════════════════════════════════════════════════════
export function RefundModal({ branchId, onClose }: {
  branchId: number; onClose: () => void;
}) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [refundQtys, setRefundQtys] = useState<Record<number, number>>({});
  const [mode, setMode] = useState<"full" | "partial">("full");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [done, setDone] = useState<{ orderNumber: string; total: number } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["orders", branchId, "completed-for-refund"],
    queryFn: async () =>
      (await api.orders.$get({ query: { branchId: String(branchId), status: "completed" } })).json(),
  });

  const allOrders: any[] = ((data as any)?.orders || [])
    .filter((o: any) => o.status === "completed" || o.status === "partially_refunded");

  const filtered = useMemo(() => {
    if (!q) return allOrders;
    const lq = q.toLowerCase();
    return allOrders.filter(
      (o: any) =>
        o.orderNumber?.toLowerCase().includes(lq) ||
        o.customerName?.toLowerCase().includes(lq)
    );
  }, [allOrders, q]);

  const selected = allOrders.find((o: any) => o.id === selectedId);
  const items: any[] = selected?.items || [];

  function initRefundQtys(o: any) {
    const init: Record<number, number> = {};
    (o.items || []).forEach((it: any) => { init[it.id] = it.qty; });
    setRefundQtys(init);
  }

  const refundTotal = useMemo(() => {
    if (!selected) return 0;
    if (mode === "full") return selected.total;
    return items.reduce((sum: number, it: any) => {
      const qty = refundQtys[it.id] ?? 0;
      return sum + (it.price * qty);
    }, 0);
  }, [selected, mode, refundQtys, items]);

  const refundMut = useMutation({
    mutationFn: async () => {
      const body: any = { reason, mode };
      if (mode === "partial") {
        body.items = items
          .filter((it: any) => (refundQtys[it.id] ?? 0) > 0)
          .map((it: any) => ({ id: it.id, qty: refundQtys[it.id], name: it.name, price: it.price }));
        if (!body.items.length) throw new Error("Select at least one item to refund");
      }
      const res = await fetch(`/api/orders/${selectedId}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) { const e = await res.json() as any; throw new Error(e.error || "Refund failed"); }
      return res.json();
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["orders", branchId] });
      qc.invalidateQueries({ queryKey: ["orders", branchId, "completed-for-refund"] });
      setDone({ orderNumber: selected?.orderNumber, total: refundTotal });
      printRefundReceipt(data.refund, selected, refundTotal, mode, reason);
    },
  });

  function printRefundReceipt(refund: any, order: any, total: number, mode: string, reason: string) {
    const rows = (refund.refundItems || [])
      .map((it: any) => `<tr><td>${it.qty}× ${it.name}</td><td style="text-align:right">Rs ${Number(it.price * it.qty).toFixed(2)}</td></tr>`)
      .join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>REFUND-${order?.orderNumber}</title>
      <style>body{font-family:monospace;width:300px;margin:0 auto;padding:12px;color:#000}
      h2{text-align:center;margin:4px 0}.muted{color:#555;font-size:12px;text-align:center}
      table{width:100%;border-collapse:collapse;font-size:13px;margin-top:10px}
      td{padding:3px 0;border-bottom:1px dashed #ccc}.tot{font-weight:bold;font-size:15px;border-top:2px solid #000}
      .center{text-align:center}.red{color:#c00}</style></head><body>
      <h2>iDine</h2><div class="muted red">*** REFUND ***</div>
      <div class="muted">${order?.orderNumber} · ${mode === "full" ? "Full Refund" : "Partial Refund"}</div>
      <div class="muted">${order?.customerName || "Walk-in"}</div>
      ${reason ? `<div class="muted">Reason: ${reason}</div>` : ""}
      <table>${rows || `<tr><td colspan="2" style="text-align:center">Full order refund</td></tr>`}
      <tr class="tot red"><td>REFUND TOTAL</td><td style="text-align:right">- Rs ${Number(total).toFixed(2)}</td></tr></table>
      <p class="center" style="margin-top:16px">Refund processed. Thank you.</p>
      <script>window.print();</script>
      </body></html>`;
    const win = window.open("", "_blank", "width=400,height=600");
    if (win) { win.document.open(); win.document.write(html); win.document.close(); }
  }

  // ── Done screen
  if (done) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "#00000099" }}>
      <div className="rounded-lg border flex flex-col items-center p-10 gap-4" style={{ background: SURF, borderColor: BORD, width: 380 }}>
        <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: "var(--color-success)22" }}>
          <Check size={28} style={{ color: "var(--color-success)" }} />
        </div>
        <div className="text-sm font-bold" style={{ color: TEXT }}>Refund Processed</div>
        <div className="text-xs" style={{ color: MUTED }}>{done.orderNumber} — Rs {Number(done.total).toFixed(2)} refunded</div>
        <div className="text-[11px]" style={{ color: DIM }}>Receipt sent to print</div>
        <button onClick={onClose} className="mt-2 px-6 py-2 rounded text-xs font-bold"
          style={{ background: GOLD, color: "#000" }}>Done</button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "#00000099" }}>
      <div className="rounded-lg border flex" style={{ background: SURF, borderColor: BORD, width: 780, maxHeight: "88vh" }}>

        {/* LEFT — order list */}
        <div className="flex flex-col border-r" style={{ borderColor: BORD, width: 300 }}>
          <div className="flex items-center justify-between px-4 py-3 border-b shrink-0" style={{ borderColor: BORD }}>
            <span className="text-sm font-bold" style={{ color: GOLD }}>Refund</span>
            <button onClick={onClose} style={{ color: MUTED }}><X size={16} /></button>
          </div>
          <div className="px-3 py-2 border-b shrink-0" style={{ borderColor: BORD }}>
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded border" style={{ background: SURF2, borderColor: BORD }}>
              <Search size={12} style={{ color: MUTED }} />
              <input className="flex-1 bg-transparent text-xs focus:outline-none" style={{ color: TEXT }}
                placeholder="Order # or customer…" value={q} onChange={e => setQ(e.target.value)} />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {isLoading
              ? <div className="flex justify-center p-8"><Spinner /></div>
              : filtered.length === 0
                ? <div className="text-center p-8 text-xs" style={{ color: DIM }}>No completed sales</div>
                : filtered.map((o: any) => {
                    const isActive = o.id === selectedId;
                    const isPartial = o.status === "partially_refunded";
                    return (
                      <button key={o.id} onClick={() => {
                          setSelectedId(o.id); initRefundQtys(o);
                          setMode("full"); setConfirmed(false); setReason("");
                        }}
                        className="w-full flex items-start justify-between px-3 py-2.5 rounded mb-1 border text-left transition-all"
                        style={{ background: isActive ? "var(--color-gold)18" : SURF2, borderColor: isActive ? GOLD : BORD }}>
                        <div>
                          <div className="text-xs font-bold font-mono" style={{ color: GOLD }}>{o.orderNumber}</div>
                          <div className="text-[11px] mt-0.5" style={{ color: MUTED }}>{o.customerName || "Walk-in"}</div>
                          <div className="text-[10px] mt-0.5" style={{ color: DIM }}>{fmtTime(o.createdAt)}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs font-bold" style={{ color: TEXT }}>{money(o.total)}</div>
                          {isPartial && <div className="text-[10px] mt-0.5 px-1.5 py-0.5 rounded" style={{ background: "var(--color-gold)22", color: "var(--color-gold)" }}>Partial</div>}
                        </div>
                      </button>
                    );
                  })}
          </div>
        </div>

        {/* RIGHT — refund details */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!selected ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3" style={{ color: DIM }}>
              <RotateCcw size={32} />
              <p className="text-xs">Select an order to refund</p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="px-5 py-3 border-b shrink-0" style={{ borderColor: BORD }}>
                <div className="text-xs font-bold font-mono" style={{ color: GOLD }}>{selected.orderNumber}</div>
                <div className="text-[11px] mt-0.5" style={{ color: MUTED }}>
                  {selected.customerName || "Walk-in"} · {selected.type} · {fmtTime(selected.createdAt)}
                </div>
              </div>

              {/* Mode toggle */}
              <div className="px-5 py-3 border-b flex gap-2 shrink-0" style={{ borderColor: BORD }}>
                {(["full", "partial"] as const).map(m => (
                  <button key={m} onClick={() => setMode(m)}
                    className="px-4 py-1.5 rounded text-xs font-semibold border transition-all"
                    style={{
                      background: mode === m ? GOLD : SURF2,
                      color: mode === m ? "#000" : MUTED,
                      borderColor: mode === m ? GOLD : BORD,
                    }}>
                    {m === "full" ? "Full Refund" : "Partial Refund"}
                  </button>
                ))}
              </div>

              {/* Items (partial mode) */}
              <div className="flex-1 overflow-y-auto px-5 py-3">
                {mode === "partial" && (
                  <div className="mb-3">
                    <div className="text-[11px] font-semibold mb-2" style={{ color: MUTED }}>Select items & quantities</div>
                    {items.map((it: any) => (
                      <div key={it.id} className="flex items-center justify-between py-2 border-b" style={{ borderColor: BORD }}>
                        <div>
                          <div className="text-xs" style={{ color: TEXT }}>{it.name}</div>
                          <div className="text-[11px]" style={{ color: DIM }}>Rs {it.price} × {it.qty}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => setRefundQtys(p => ({ ...p, [it.id]: Math.max(0, (p[it.id] ?? it.qty) - 1) }))}
                            className="w-6 h-6 rounded border flex items-center justify-center text-xs"
                            style={{ borderColor: BORD, color: TEXT, background: SURF2 }}>−</button>
                          <span className="text-xs w-5 text-center font-bold" style={{ color: TEXT }}>{refundQtys[it.id] ?? it.qty}</span>
                          <button onClick={() => setRefundQtys(p => ({ ...p, [it.id]: Math.min(it.qty, (p[it.id] ?? it.qty) + 1) }))}
                            className="w-6 h-6 rounded border flex items-center justify-center text-xs"
                            style={{ borderColor: BORD, color: TEXT, background: SURF2 }}>+</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {mode === "full" && (
                  <div className="mb-3">
                    <div className="text-[11px] font-semibold mb-2" style={{ color: MUTED }}>Order items</div>
                    {items.map((it: any) => (
                      <div key={it.id} className="flex items-center justify-between py-2 border-b" style={{ borderColor: BORD }}>
                        <div className="text-xs" style={{ color: TEXT }}>{it.qty}× {it.name}</div>
                        <div className="text-xs" style={{ color: MUTED }}>{money(it.total)}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Reason */}
                <div className="mt-2">
                  <div className="text-[11px] font-semibold mb-1.5" style={{ color: MUTED }}>Reason (optional)</div>
                  <input className="w-full px-3 py-2 rounded border text-xs focus:outline-none"
                    style={{ background: SURF2, borderColor: BORD, color: TEXT }}
                    placeholder="e.g. Wrong item, customer complaint…"
                    value={reason} onChange={e => setReason(e.target.value)} />
                </div>
              </div>

              {/* Footer */}
              <div className="px-5 py-3 border-t shrink-0" style={{ borderColor: BORD }}>
                {refundMut.isError && (
                  <div className="flex items-center gap-2 mb-2 text-xs px-3 py-2 rounded" style={{ background: "var(--color-danger)22", color: "var(--color-danger)" }}>
                    <AlertTriangle size={12} /> {(refundMut.error as any)?.message || "Refund failed"}
                  </div>
                )}
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs" style={{ color: MUTED }}>Refund Amount</span>
                  <span className="text-base font-bold" style={{ color: "var(--color-danger)" }}>- {money(refundTotal)}</span>
                </div>
                {!confirmed ? (
                  <button onClick={() => setConfirmed(true)}
                    className="w-full py-2.5 rounded text-xs font-bold border transition-all"
                    style={{ background: "var(--color-danger)22", color: "var(--color-danger)", borderColor: "var(--color-danger)" }}>
                    Process Refund
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={() => setConfirmed(false)}
                      className="flex-1 py-2.5 rounded text-xs font-semibold border"
                      style={{ background: SURF2, color: MUTED, borderColor: BORD }}>
                      Cancel
                    </button>
                    <button onClick={() => refundMut.mutate()}
                      disabled={refundMut.isPending}
                      className="flex-1 py-2.5 rounded text-xs font-bold flex items-center justify-center gap-1"
                      style={{ background: "var(--color-danger)", color: "#fff" }}>
                      {refundMut.isPending ? <Spinner size={12} /> : <><Check size={13} /> Confirm Refund</>}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  QR ORDERS MODAL — Incoming orders from customer QR menu
// ════════════════════════════════════════════════════════════════════════════
export function QROrdersModal({ branchId, onClose }: { branchId: number; onClose: () => void }) {
  const qc = useQueryClient();
  const [assignMap, setAssignMap] = useState<Record<number, number | null>>({});
  const [processing, setProcessing] = useState<Set<number>>(new Set());

  const { data: ordersData, isLoading } = useQuery({
    queryKey: ["qr-orders-modal", branchId],
    queryFn: async () => {
      const r = await fetch(`/api/orders?branchId=${branchId}&source=qr&status=pending`);
      return r.json();
    },
    refetchInterval: 5000,
  });

  const { data: tablesData } = useQuery({
    queryKey: ["tables", branchId],
    queryFn: async () => (await api.tables.$get({ query: { branchId: String(branchId) } })).json(),
  });

  const { data: usersData } = useQuery({
    queryKey: ["users", branchId],
    queryFn: async () => {
      const r = await fetch(`/api/users?branchId=${branchId}`);
      return r.json();
    },
  });

  const pendingOrders: any[] = (ordersData as any)?.orders || [];
  const tables: any[] = (tablesData as any)?.tables || [];
  const waiters: any[] = ((usersData as any)?.users || []).filter((u: any) => u.role === "waiter" && u.isActive !== false);

  function getTableName(tableId: number | null) {
    if (!tableId) return "—";
    return tables.find(t => t.id === tableId)?.name || `#${tableId}`;
  }

  async function assignWaiter(order: any) {
    const waiterId = assignMap[order.id] ?? null;
    if (!waiterId) return;
    setProcessing(prev => new Set(prev).add(order.id));
    try {
      await fetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ waiterId }),
      });
      qc.invalidateQueries({ queryKey: ["qr-orders-modal", branchId] });
    } finally {
      setProcessing(prev => { const s = new Set(prev); s.delete(order.id); return s; });
    }
  }

  async function acceptOrder(order: any) {
    const waiterId = assignMap[order.id] ?? null;
    setProcessing(prev => new Set(prev).add(order.id));
    try {
      // 1. Confirm order + assign waiter
      await fetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "confirmed", waiterId, kotPrinted: false }),
      });

      // 2. Create print jobs for KOT (use all items, send to first printer or null)
      const items: any[] = order.items || [];
      if (items.length > 0) {
        // Get printers for this branch
        const printersRes = await fetch(`/api/printers?branchId=${branchId}`);
        const printersJson = await printersRes.json();
        const printers: any[] = printersJson.printers || [];
        const kotPrinter = printers.find((p: any) => p.isKot || p.is_kot || p.type === "kitchen") || printers[0];
        if (kotPrinter) {
          const now = Date.now();
          await fetch("/api/print-jobs/batch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jobs: [{
                branchId,
                orderId: order.id,
                printerId: kotPrinter.id,
                idempotencyKey: `${order.id}-${kotPrinter.id}-qr-kot-${now}`,
                type: "kot",
                status: "pending",
                payload: JSON.stringify({
                  orderId: order.id,
                  orderNumber: order.orderNumber,
                  type: order.type,
                  tableId: order.tableId,
                  source: "qr",
                  customerName: order.customerName,
                  items: items.map(i => ({ name: i.name, qty: i.qty, modifiers: [] })),
                }),
              }],
            }),
          });
        }
      }

      qc.invalidateQueries({ queryKey: ["qr-orders-modal"] });
      qc.invalidateQueries({ queryKey: ["qr-orders-pending"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
    } finally {
      setProcessing(prev => { const n = new Set(prev); n.delete(order.id); return n; });
    }
  }

  async function rejectOrder(order: any) {
    if (!confirm(`Reject order ${order.orderNumber}?`)) return;
    setProcessing(prev => new Set(prev).add(order.id));
    try {
      await fetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });
      qc.invalidateQueries({ queryKey: ["qr-orders-modal"] });
      qc.invalidateQueries({ queryKey: ["qr-orders-pending"] });
    } finally {
      setProcessing(prev => { const n = new Set(prev); n.delete(order.id); return n; });
    }
  }

  const ago = (ts: any) => {
    if (!ts) return "";
    const ms = ts < 1e12 ? ts * 1000 : ts;
    const diff = Math.round((Date.now() - ms) / 60000);
    if (diff < 1) return "just now";
    if (diff === 1) return "1 min ago";
    return `${diff} min ago`;
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.75)" }}>
      <div className="w-[640px] max-h-[85vh] flex flex-col rounded-2xl border" style={{ background: SURF, borderColor: BORD }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0" style={{ borderColor: BORD }}>
          <div className="flex items-center gap-2">
            <QrCode size={16} style={{ color: GOLD }} />
            <div>
              <span className="font-bold text-sm" style={{ color: TEXT }}>QR Table Orders</span>
              {pendingOrders.length > 0 && (
                <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full font-bold"
                  style={{ background: "var(--color-danger)", color: "#fff" }}>{pendingOrders.length} pending</span>
              )}
            </div>
          </div>
          <button onClick={onClose}><X size={16} style={{ color: MUTED }} /></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-40"><Spinner /></div>
          ) : pendingOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3">
              <QrCode size={40} className="opacity-20" style={{ color: DIM }} />
              <p className="text-sm" style={{ color: MUTED }}>No pending QR orders</p>
              <p className="text-xs" style={{ color: DIM }}>New orders will appear here automatically</p>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: BORD }}>
              {pendingOrders.map((order: any) => (
                <div key={order.id} className="p-5">
                  {/* Order header */}
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold" style={{ color: TEXT }}>{order.orderNumber}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded font-semibold"
                          style={{ background: GOLD + "22", color: GOLD }}>
                          Table {getTableName(order.tableId)}
                        </span>
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: DIM }}>
                        {order.customerName || "Customer"} · {ago(order.createdAt)}
                        {order.notes && <span className="ml-2 italic">"{order.notes}"</span>}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold" style={{ color: GOLD }}>LKR {Number(order.total || 0).toLocaleString()}</div>
                      <div className="text-[10px]" style={{ color: DIM }}>{(order.items || []).length} items</div>
                    </div>
                  </div>

                  {/* Items list */}
                  <div className="rounded-lg border mb-3 overflow-hidden" style={{ borderColor: BORD }}>
                    {(order.items || []).map((item: any, idx: number) => (
                      <div key={item.id ?? idx} className="flex justify-between px-3 py-1.5 text-xs border-b last:border-0"
                        style={{ borderColor: BORD }}>
                        <span style={{ color: TEXT }}>{item.qty}× {item.name}</span>
                        <span style={{ color: MUTED }}>LKR {Number(item.total || item.price * item.qty || 0).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>

                  {/* Assign waiter + actions */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <select
                      value={assignMap[order.id] ?? ""}
                      onChange={e => setAssignMap(prev => ({ ...prev, [order.id]: e.target.value ? parseInt(e.target.value) : null }))}
                      className="flex-1 min-w-0 px-2 py-1.5 text-xs rounded-lg border outline-none"
                      style={{ background: BG, borderColor: BORD, color: TEXT }}>
                      <option value="">— Assign Waiter (optional) —</option>
                      {waiters.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                    <button
                      onClick={() => rejectOrder(order)}
                      disabled={processing.has(order.id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold border disabled:opacity-50 shrink-0"
                      style={{ borderColor: "var(--color-danger)", color: "var(--color-danger)", background: "var(--color-danger)11" }}>
                      Reject
                    </button>
                    <button
                      onClick={() => acceptOrder(order)}
                      disabled={processing.has(order.id)}
                      className="px-4 py-1.5 rounded-lg text-xs font-bold disabled:opacity-50 flex items-center gap-1.5 shrink-0"
                      style={{ background: GOLD, color: "var(--color-surface)" }}>
                      {processing.has(order.id) ? <Spinner size={12} /> : <><Check size={13} /> Accept + Print KOT</>}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t shrink-0 text-right" style={{ borderColor: BORD }}>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-xs" style={{ background: BORD, color: MUTED }}>Close</button>
        </div>
      </div>
    </div>
  );
}
