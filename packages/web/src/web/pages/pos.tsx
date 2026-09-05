import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { getBranchId, getUser } from "../lib/store";
import { Spinner } from "../components/ui/spinner";
import {
  Search, Plus, Minus, Pencil, RotateCcw, FileText, Receipt, Printer,
  Ban, Edit3, Info, UtensilsCrossed, ShoppingBag, Truck, Grid3x3,
  RefreshCw, Camera, X, ChevronDown, Check, SlidersHorizontal,
  LogOut, FolderOpen, Bell, Monitor, Scissors,
  User, QrCode, BookOpen, Maximize, Home,
} from "lucide-react";
import { useLocation } from "wouter";
import { clearUser } from "../lib/store";
import { DraftSalesModal, RecentSalesModal, SelfOrderQRModal, QROrdersModal, RegistryModal, RefundModal } from "../components/pos-toolbar-modals";

// ── Theme tokens ──────────────────────────────────────────────────────────────
const BG    = "var(--color-bg)";
const SURF   = "var(--color-surface)";
const SURF2  = "var(--color-surface-2)";
const BORD   = "var(--color-border)";
const GOLD   = "var(--color-gold)";
const TEXT   = "var(--color-text)";
const MUTED  = "var(--color-text-muted)";
const PURPLE = "var(--color-purple)";
const DIM   = "var(--color-text-dim)";

// ── Types ─────────────────────────────────────────────────────────────────────
type OrderType = "dine-in" | "takeaway" | "delivery";
type Modifier  = { id: number; name: string; groupName: string; price: number };
type CartItem  = {
  cartKey: string;               // unique cart-row identity — "itemId" or "itemId-varId" for variations
  menuItemId: number | null;     // real menu_items.id — always numeric, used for DB writes/FK
  name: string;
  price: number;
  qty: number;
  discount: number;
  printerId: number | null;
  categoryId: number | null;
  modifiers: Modifier[];
  note?: string; // kitchen instruction, e.g. "Low spicy" — prints on the KOT only
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function waiterShortId(name: string | null | undefined): string {
  if (!name) return "WW";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    // First letter of first name + first letter of last name
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  // Single name: first two letters
  return name.slice(0, 2).toUpperCase();
}

function genOrderNumber(waiterName: string | null | undefined, seq: number): string {
  const now  = new Date();
  const mm   = String(now.getMonth() + 1).padStart(2, "0");
  const dd   = String(now.getDate()).padStart(2, "0");
  const ww   = waiterShortId(waiterName);
  const s    = String(seq).padStart(3, "0");
  return `${mm}${dd}${ww}-${s}`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** Small action button in left panel */
function Btn({ icon: Icon, label, onClick, danger }: {
  icon: any; label: string; onClick?: () => void; danger?: boolean;
}) {
  return (
    <button onClick={onClick}
      className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded border text-xs font-medium transition-all hover:brightness-110"
      style={{
        background: danger ? "var(--color-danger)22" : SURF2,
        color:      danger ? "var(--color-danger)"   : MUTED,
        borderColor: danger ? "var(--color-danger)"  : BORD,
      }}>
      <Icon size={11} /> {label}
    </button>
  );
}

/** Toast banner near the top title */
function Toast({ msg, onDone }: { msg: string; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 2800); return () => clearTimeout(t); }, [onDone]);
  return (
    <div className="px-3 py-1 rounded-lg text-xs font-semibold animate-fade-up"
      style={{ background: GOLD, color: "var(--color-surface)", whiteSpace: "nowrap" }}>
      {msg}
    </div>
  );
}

/** Customer search + add/edit dropdown */
function CustomerPicker({
  branchId, customerId, customerName,
  onChange,
}: {
  branchId: number;
  customerId: number | null;
  customerName: string;
  onChange: (id: number | null, name: string) => void;
}) {
  const [open,       setOpen]       = useState(false);
  const [search,     setSearch]     = useState("");
  const [showModal,  setShowModal]  = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [form,       setForm]       = useState({ name: "", phone: "", address: "" });
  const ref = useRef<HTMLDivElement>(null);
  const qc  = useQueryClient();

  const { data } = useQuery({
    queryKey: ["customers", branchId, search],
    queryFn: async () => (await api.customers.$get({ query: { branchId: String(branchId), search } })).json(),
    enabled: open,
  });
  const customers = (data as any)?.customers || [];

  // close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (editTarget) {
        return (await api.customers[":id"].$patch({ param: { id: String(editTarget.id) }, json: form })).json();
      }
      return (await api.customers.$post({ json: { ...form, branchId } })).json();
    },
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      const c = res.customer;
      onChange(c.id, c.name);
      setShowModal(false);
      setSearch("");
      setOpen(false);
    },
  });

  function openAdd() {
    setEditTarget(null);
    setForm({ name: "", phone: "", address: "" });
    setShowModal(true);
    setOpen(false);
  }
  function openEdit(c: any, e: React.MouseEvent) {
    e.stopPropagation();
    setEditTarget(c);
    setForm({ name: c.name, phone: c.phone || "", address: c.address || "" });
    setShowModal(true);
    setOpen(false);
  }

  return (
    <div className="relative flex-1" ref={ref}>
      {/* Trigger */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-1 px-2 py-1.5 rounded border text-xs focus:outline-none"
        style={{ background: SURF2, color: TEXT, borderColor: BORD }}>
        <User size={11} style={{ color: MUTED, flexShrink: 0 }} />
        <span className="flex-1 text-left truncate">{customerName || "Customer"}</span>
        <ChevronDown size={10} style={{ color: MUTED, flexShrink: 0 }} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-lg border shadow-xl"
          style={{ background: SURF, borderColor: BORD, minWidth: "180px" }}>
          <div className="p-1.5 border-b" style={{ borderColor: BORD }}>
            <div className="relative">
              <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2" style={{ color: DIM }} />
              <input autoFocus
                className="w-full pl-6 pr-2 py-1.5 rounded border text-xs focus:outline-none"
                style={{ background: SURF2, color: TEXT, borderColor: BORD }}
                placeholder="Search name or phone…"
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
          <div className="max-h-44 overflow-y-auto">
            {/* Walk-in */}
            <button
              onClick={() => { onChange(null, "Walk-in Customer"); setOpen(false); setSearch(""); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:brightness-125 transition-all"
              style={{ color: MUTED }}>
              <User size={11} /> Walk-in Customer
              {!customerId && <Check size={10} className="ml-auto" style={{ color: GOLD }} />}
            </button>
            {customers.map((c: any) => (
              <div key={c.id} className="flex items-center gap-1 px-2 py-1.5 hover:brightness-125 transition-all group">
                <button
                  onClick={() => { onChange(c.id, c.name); setOpen(false); setSearch(""); }}
                  className="flex-1 flex flex-col text-left text-xs">
                  <span style={{ color: TEXT }}>{c.name}</span>
                  {c.phone && <span style={{ color: DIM }}>{c.phone}</span>}
                </button>
                {customerId === c.id && <Check size={10} style={{ color: GOLD }} />}
                <button onClick={e => openEdit(c, e)}
                  className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded"
                  style={{ color: MUTED }}>
                  <Pencil size={10} />
                </button>
              </div>
            ))}
            {customers.length === 0 && search && (
              <div className="px-3 py-2 text-xs" style={{ color: DIM }}>No results</div>
            )}
          </div>
          <div className="border-t p-1.5" style={{ borderColor: BORD }}>
            <button onClick={openAdd}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-xs font-medium transition-all hover:brightness-110"
              style={{ background: GOLD + "22", color: GOLD, border: `1px solid ${GOLD}` }}>
              <Plus size={11} /> Add New Customer
            </button>
          </div>
        </div>
      )}

      {/* Add/Edit modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "#00000088" }}>
          <div className="rounded-xl border p-5 w-80 shadow-2xl" style={{ background: SURF, borderColor: BORD }}>
            <div className="flex items-center justify-between mb-4">
              <span className="font-bold text-sm" style={{ color: TEXT }}>{editTarget ? "Edit Customer" : "New Customer"}</span>
              <button onClick={() => setShowModal(false)} style={{ color: MUTED }}><X size={14} /></button>
            </div>
            {(["name", "phone", "address"] as const).map(f => (
              <div key={f} className="mb-3">
                <label className="block text-xs mb-1 capitalize" style={{ color: MUTED }}>{f}</label>
                <input
                  className="w-full px-2.5 py-1.5 rounded border text-xs focus:outline-none"
                  style={{ background: SURF2, color: TEXT, borderColor: BORD }}
                  value={(form as any)[f]}
                  onChange={e => setForm(v => ({ ...v, [f]: e.target.value }))}
                  placeholder={f === "name" ? "Full name *" : f === "phone" ? "Phone number" : "Address"} />
              </div>
            ))}
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowModal(false)}
                className="flex-1 py-2 rounded border text-xs" style={{ borderColor: BORD, color: MUTED }}>Cancel</button>
              <button onClick={() => saveMut.mutate()}
                disabled={!form.name || saveMut.isPending}
                className="flex-1 py-2 rounded text-xs font-semibold disabled:opacity-40"
                style={{ background: GOLD, color: "var(--color-surface)" }}>
                {saveMut.isPending ? <Spinner size={12} /> : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Modifier selector popup for a cart item */
function ModifierPicker({
  branchId,
  selected,
  onChange,
  onClose,
}: {
  branchId: number;
  selected: Modifier[];
  onChange: (mods: Modifier[]) => void;
  onClose: () => void;
}) {
  const { data } = useQuery({
    queryKey: ["modifiers", branchId],
    queryFn: async () => (await api.modifiers.$get({ query: { branchId: String(branchId) } })).json(),
  });
  const modifiers: Modifier[] = (data as any)?.modifiers || [];

  // group by groupName
  const groups = modifiers.reduce((acc, m) => {
    (acc[m.groupName] ||= []).push(m);
    return acc;
  }, {} as Record<string, Modifier[]>);

  function toggle(m: Modifier) {
    const has = selected.some(s => s.id === m.id);
    onChange(has ? selected.filter(s => s.id !== m.id) : [...selected, m]);
  }

  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "#00000088" }}>
      <div ref={ref} className="rounded-xl border shadow-2xl w-72 max-h-96 flex flex-col"
        style={{ background: SURF, borderColor: BORD }}>
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: BORD }}>
          <span className="font-bold text-sm" style={{ color: TEXT }}>Modifiers / Add-ons</span>
          <button onClick={onClose} style={{ color: MUTED }}><X size={14} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {Object.keys(groups).length === 0
            ? <p className="text-xs p-4 text-center" style={{ color: DIM }}>No modifiers configured</p>
            : Object.entries(groups).map(([group, items]) => (
              <div key={group} className="mb-2">
                <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: DIM }}>{group}</div>
                {items.map(m => {
                  const active = selected.some(s => s.id === m.id);
                  return (
                    <button key={m.id} onClick={() => toggle(m)}
                      className="w-full flex items-center justify-between px-3 py-1.5 rounded text-xs transition-all"
                      style={{
                        background: active ? GOLD + "22" : "transparent",
                        color: active ? GOLD : TEXT,
                      }}>
                      <span>{m.name}</span>
                      <span className="flex items-center gap-2">
                        {m.price > 0 && <span style={{ color: MUTED }}>+{m.price.toFixed(2)}</span>}
                        {active && <Check size={10} style={{ color: GOLD }} />}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))
          }
        </div>
        <div className="border-t px-3 py-2" style={{ borderColor: BORD }}>
          <button onClick={onClose}
            className="w-full py-2 rounded text-xs font-semibold"
            style={{ background: GOLD, color: "var(--color-surface)" }}>
            Done ({selected.length} selected)
          </button>
        </div>
      </div>
    </div>
  );
}

/** Order Details modal */
function OrderDetailsModal({ order, items, onClose, onCreateInvoice, onPrintBill }: {
  order: any;
  items: any[];
  onClose: () => void;
  onCreateInvoice: () => void;
  onPrintBill: () => void;
}) {
  const subtotal = items.reduce((s: number, i: any) => s + (i.total ?? i.qty * i.price), 0);
  const tax      = 0;
  const charge   = 0;
  const tips     = 0;
  const discount = items.reduce((s: number, i: any) => s + (i.discount ?? 0), 0);
  const total    = subtotal - discount + tax + charge + tips;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "#00000099" }}>
      <div className="rounded-xl border shadow-2xl w-[520px] max-h-[90vh] flex flex-col overflow-hidden"
        style={{ background: SURF, borderColor: BORD }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: BORD }}>
          <span className="font-bold text-sm" style={{ color: TEXT }}>Order Details</span>
          <button onClick={onClose} style={{ color: MUTED }}><X size={14} /></button>
        </div>

        {/* Meta */}
        <div className="grid grid-cols-3 gap-3 px-5 py-3 border-b text-xs" style={{ borderColor: BORD }}>
          {[
            ["Order Type",   order.type === "dine-in" ? "Dine In" : order.type === "takeaway" ? "Take Away" : "Delivery"],
            ["Order Number", order.orderNumber],
            ["Waiter",       order.waiterName || "—"],
            ["Customer",     order.customerName || "Walk-in"],
            ["Table",        order.tableId ? `Table ${order.tableId}` : "—"],
            ["Status",       order.status],
          ].map(([k, v]) => (
            <div key={k}>
              <div style={{ color: DIM }} className="mb-0.5">{k}</div>
              <div style={{ color: TEXT }} className="font-medium">{v}</div>
            </div>
          ))}
        </div>

        {/* Items table */}
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0" style={{ background: SURF }}>
              <tr style={{ color: MUTED }} className="font-semibold">
                <th className="text-left px-4 py-2">Item</th>
                <th className="text-right px-2 py-2">Price</th>
                <th className="text-center px-2 py-2">Qty</th>
                <th className="text-center px-2 py-2">Discount</th>
                <th className="text-right px-4 py-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item: any, idx: number) => (
                <tr key={idx} className="border-t" style={{ borderColor: BORD }}>
                  <td className="px-4 py-2" style={{ color: TEXT }}>{item.name}</td>
                  <td className="px-2 py-2 text-right font-mono" style={{ color: MUTED }}>{item.price.toFixed(2)}</td>
                  <td className="px-2 py-2 text-center" style={{ color: TEXT }}>{item.qty}</td>
                  <td className="px-2 py-2 text-center" style={{ color: MUTED }}>{(item.discount ?? 0).toFixed(2)}</td>
                  <td className="px-4 py-2 text-right font-mono font-bold" style={{ color: GOLD }}>
                    {(item.total ?? item.qty * item.price).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="border-t px-5 py-3 space-y-1.5 text-xs" style={{ borderColor: BORD }}>
          {[
            ["Total Items", items.length],
            ["Sub Total",   subtotal.toFixed(2)],
            ["Discount",    discount.toFixed(2)],
            ["Tax",         tax.toFixed(2)],
            ["Charge",      charge.toFixed(2)],
            ["Tips",        tips.toFixed(2)],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between">
              <span style={{ color: MUTED }}>{k}</span>
              <span style={{ color: TEXT }}>{v}</span>
            </div>
          ))}
          <div className="flex justify-between font-bold text-sm pt-1.5 border-t" style={{ borderColor: BORD }}>
            <span style={{ color: TEXT }}>Total Payable</span>
            <span style={{ color: GOLD }}>{total.toFixed(2)}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 px-5 py-3 border-t" style={{ borderColor: BORD }}>
          <button onClick={onCreateInvoice}
            className="flex-1 py-2 rounded text-xs font-semibold transition-all hover:brightness-110"
            style={{ background: GOLD, color: "var(--color-surface)" }}>
            Create Invoice & Close
          </button>
          <button onClick={onPrintBill}
            className="flex-1 py-2 rounded border text-xs font-semibold transition-all hover:brightness-110 flex items-center justify-center gap-1.5"
            style={{ borderColor: GOLD, color: GOLD, background: `${GOLD}18` }}>
            <Printer size={13} /> Print Bill
          </button>
          <button onClick={onClose}
            className="flex-1 py-2 rounded border text-xs font-medium"
            style={{ borderColor: BORD, color: MUTED }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/** Finalize Sale (Cash Tender) modal — replaces both BillModal and InvoiceModal */
const PAYMENT_METHODS = ["Cash", "Credit Card", "Check", "Bank Transfer", "Loyalty Point"] as const;
type PaymentMethod = typeof PAYMENT_METHODS[number];

interface PaymentEntry { method: PaymentMethod; amount: number; ref?: string }

function FinalizeModal({
  order,
  items,
  onClose,
  onSubmit,
  loading,
}: {
  order: any;
  items: any[];
  onClose: () => void;
  onSubmit?: (payments: PaymentEntry[], summary: { subtotal: number; discount: number; serviceCharge: number; total: number; amountPaid: number; cashGiven: number; balance: number; paymentMethod: string }) => void;
  loading?: boolean;
}) {
  const branchId = getBranchId();
  const { data: settingsRaw } = useQuery({
    queryKey: ["settings", branchId],
    queryFn: async () => (await api.settings.$get({ query: { branchId: String(branchId) } })).json() as any,
  });
  const settings: Record<string, string> = (settingsRaw as any)?.settings || {};
  // Parse service charge % from settings e.g. "10%" or "10"
  const serviceChargeRate = parseFloat((settings.serviceCharge || "0").replace("%", "")) / 100;

  const subtotal      = items.reduce((s: number, i: any) => s + (i.total ?? i.qty * i.price), 0);
  const itemDiscount  = items.reduce((s: number, i: any) => s + (i.discount ?? 0), 0);
  const [extraDiscount, setExtraDiscount] = useState(0);
  const afterDiscount = Math.max(0, subtotal - itemDiscount - extraDiscount);
  const serviceCharge = parseFloat((afterDiscount * serviceChargeRate).toFixed(2));
  const payable       = parseFloat((afterDiscount + serviceCharge).toFixed(2));

  const [activeMethod,    setActiveMethod]    = useState<PaymentMethod>("Cash");
  const [givenAmount,     setGivenAmount]     = useState("");
  const [amount,          setAmount]          = useState("");
  const [refNote,         setRefNote]         = useState(""); // for card/check/bank
  const [payments,        setPayments]        = useState<PaymentEntry[]>([]);
  const [showCartDetails, setShowCartDetails] = useState(false);
  const [sendSMS,         setSendSMS]         = useState(false);
  const [discountInput,   setDiscountInput]   = useState("");
  const [phone,           setPhone]           = useState("");

  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
  const due       = Math.max(0, payable - totalPaid);
  const balanceToReturn = Math.max(0, totalPaid - payable);
  const change    = activeMethod === "Cash" ? Math.max(0, (parseFloat(givenAmount) || 0) - (parseFloat(amount) || 0)) : 0;
  const canSubmit = payments.length > 0 && due <= 0;

  const QUICK_AMOUNTS = [500, 1000, 2000, 5000];

  function addQuickAmount(val: number) {
    setAmount(prev => {
      const current = parseFloat(prev) || 0;
      return (current + val).toFixed(2);
    });
  }

  function handleAddPayment() {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return;
    setPayments(prev => [...prev, { method: activeMethod, amount: amt, ref: refNote || undefined }]);
    setAmount(""); setGivenAmount(""); setRefNote("");
  }

  function handleBillAmount() {
    const amt = due > 0 ? due : payable;
    if (!amt || amt <= 0) return;
    setPayments(prev => [...prev, { method: activeMethod, amount: amt, ref: refNote || undefined }]);
    setAmount(""); setGivenAmount(""); setRefNote("");
  }

  function handleClear() {
    setGivenAmount(""); setAmount(""); setRefNote(""); setPayments([]);
  }

  function handleDiscount() {
    const val = parseFloat(discountInput);
    if (!isNaN(val) && val >= 0) setExtraDiscount(val);
    setDiscountInput("");
  }

  function handleSubmit() {
    const totalPaidNow = payments.reduce((s, p) => s + p.amount, 0);
    const cashEntry = payments.find(p => p.method === "Cash");
    const cashGivenVal = cashEntry ? parseFloat(givenAmount || "0") || cashEntry.amount : 0;
    const balanceVal = parseFloat((totalPaidNow - payable).toFixed(2));
    const primaryMethod = payments.length === 1 ? payments[0].method : payments.length > 1 ? "Split" : "Cash";
    const summary = {
      subtotal,
      discount: itemDiscount + extraDiscount,
      serviceCharge,
      total: payable,
      amountPaid: totalPaidNow,
      cashGiven: cashGivenVal,
      balance: balanceVal,
      paymentMethod: primaryMethod,
    };
    if (onSubmit) onSubmit(payments, summary);
    else onClose();
  }

  // method-specific placeholder / label
  const methodConfig: Record<PaymentMethod, { showGiven: boolean; refLabel?: string; refPlaceholder?: string; amountLabel: string }> = {
    "Cash":          { showGiven: true,  amountLabel: "Cash Amount" },
    "Credit Card":   { showGiven: false, refLabel: "Card / Reference No.", refPlaceholder: "e.g. XXXX-1234", amountLabel: "Charge Amount" },
    "Check":         { showGiven: false, refLabel: "Check No.",             refPlaceholder: "Check number",  amountLabel: "Check Amount" },
    "Bank Transfer": { showGiven: false, refLabel: "Transfer Ref / Slip",   refPlaceholder: "Ref number",    amountLabel: "Transfer Amount" },
    "Loyalty Point": { showGiven: false, refLabel: "Points to Redeem",      refPlaceholder: "e.g. 200",      amountLabel: "Equivalent Amount" },
  };
  const cfg = methodConfig[activeMethod];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "#00000099" }}>
      <div className="rounded-xl border shadow-2xl overflow-hidden flex flex-col"
        style={{ background: SURF, borderColor: BORD, width: "min(1100px, 96vw)", height: "min(760px, 94vh)" }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: BORD }}>
          <span className="font-bold text-base" style={{ color: TEXT }}>Finalize Sale</span>
          <button onClick={onClose} style={{ color: MUTED }}><X size={16} /></button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-sm" style={{ color: MUTED }}>
            <Spinner size={16} /> <span className="ml-2">Loading order…</span>
          </div>
        ) : (
        <>
        {/* Body */}
        <div className="flex flex-1 overflow-hidden min-h-0">

          {/* Left — payment method sidebar */}
          <div className="w-52 border-r flex flex-col shrink-0" style={{ borderColor: BORD, background: BG }}>
            {PAYMENT_METHODS.map(m => (
              <button key={m}
                onClick={() => { setActiveMethod(m); setAmount(""); setGivenAmount(""); setRefNote(""); }}
                className="px-4 py-4 text-left text-sm border-b transition-colors"
                style={{
                  borderColor: BORD,
                  background: activeMethod === m ? PURPLE : "transparent",
                  color: activeMethod === m ? "#fff" : MUTED,
                  fontWeight: activeMethod === m ? 600 : 400,
                }}>
                {m}
              </button>
            ))}
          </div>

          {/* Right — payment entry + summary */}
          <div className="flex-1 flex flex-col p-4 gap-3 overflow-y-auto">

            {/* Active method title */}
            <div className="font-semibold text-sm" style={{ color: GOLD }}>{activeMethod}</div>

            {/* Input row — dynamic per method */}
            <div className="grid gap-2" style={{ gridTemplateColumns: cfg.showGiven ? "1fr 1fr 1fr auto" : cfg.refLabel ? "1fr 1fr auto" : "1fr auto" }}>
              {cfg.showGiven && (
                <div className="flex flex-col gap-1">
                  <label className="text-base" style={{ color: MUTED }}>Given Amount</label>
                  <input value={givenAmount} onChange={e => setGivenAmount(e.target.value)}
                    placeholder="0.00" type="number" min="0"
                    className="border rounded px-2 py-2.5 text-base outline-none"
                    style={{ borderColor: BORD, background: BG, color: TEXT }} />
                </div>
              )}
              {cfg.refLabel && (
                <div className="flex flex-col gap-1">
                  <label className="text-base" style={{ color: MUTED }}>{cfg.refLabel}</label>
                  <input value={refNote} onChange={e => setRefNote(e.target.value)}
                    placeholder={cfg.refPlaceholder}
                    className="border rounded px-2 py-2.5 text-base outline-none"
                    style={{ borderColor: BORD, background: BG, color: TEXT }} />
                </div>
              )}
              <div className="flex flex-col gap-1">
                <label className="text-base" style={{ color: MUTED }}>{cfg.amountLabel}</label>
                <input value={amount} onChange={e => setAmount(e.target.value)}
                  placeholder="0.00" type="number" min="0"
                  className="border rounded px-2 py-2.5 text-base outline-none"
                  style={{ borderColor: BORD, background: BG, color: TEXT }} />
              </div>
              <div className="flex flex-col justify-end">
                <button onClick={handleAddPayment}
                  className="px-4 py-2.5 rounded text-base font-semibold"
                  style={{ background: PURPLE, color: "#fff" }}>
                  Add
                </button>
              </div>
            </div>

            {/* Change for cash */}
            {activeMethod === "Cash" && (parseFloat(givenAmount) || 0) > 0 && (
              <div className="text-base px-3 py-2 rounded border" style={{ borderColor: BORD, background: BG }}>
                <span style={{ color: MUTED }}>Change: </span>
                <span className="font-bold font-mono" style={{ color: "var(--color-success)" }}>LKR {change.toFixed(2)}</span>
              </div>
            )}

            {/* Middle: payments list + right controls */}
            <div className="flex gap-3">

              {/* Payments list */}
              <div className="flex-1 rounded border min-h-[160px]"
                style={{ borderColor: BORD }}>
                {payments.length === 0 ? (
                  <div className="flex items-center justify-center h-full min-h-[160px] text-base" style={{ color: DIM }}>
                    Your added payments will be shown here
                  </div>
                ) : (
                  <div className="w-full">
                    {payments.map((p, i) => (
                      <div key={i} className="flex justify-between items-center px-3 py-2 border-b text-base"
                        style={{ borderColor: BORD }}>
                        <div>
                          <span style={{ color: TEXT }}>{p.method}</span>
                          {p.ref && <span className="ml-2 text-base" style={{ color: DIM }}>#{p.ref}</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold" style={{ color: GOLD }}>{p.amount.toFixed(2)}</span>
                          <button onClick={() => setPayments(prev => prev.filter((_, j) => j !== i))}
                            style={{ color: MUTED }}><X size={11} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Right controls */}
              <div className="flex flex-col gap-2 w-44 shrink-0">

                {/* Discount */}
                <div className="flex gap-1">
                  <input value={discountInput} onChange={e => setDiscountInput(e.target.value)}
                    placeholder="Discount" type="number" min="0"
                    className="flex-1 border rounded px-2 py-2.5 text-base outline-none w-0"
                    style={{ borderColor: BORD, background: BG, color: TEXT }}
                    onKeyDown={e => e.key === "Enter" && handleDiscount()} />
                  <button onClick={handleDiscount}
                    className="px-2 py-2.5 rounded text-base font-semibold"
                    style={{ background: BORD, color: MUTED }}>✓</button>
                </div>

                {/* Totals */}
                <div className="rounded border p-2 space-y-1 text-base" style={{ borderColor: BORD, background: BG }}>
                  <div className="flex justify-between">
                    <span style={{ color: MUTED }}>Payable</span>
                    <span className="font-bold font-mono" style={{ color: TEXT }}>LKR{payable.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: MUTED }}>Paid</span>
                    <span className="font-bold font-mono" style={{ color: "var(--color-success)" }}>LKR{totalPaid.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-1" style={{ borderColor: BORD }}>
                    <span style={{ color: MUTED }}>Due</span>
                    <span className="font-bold font-mono" style={{ color: due > 0 ? "var(--color-danger)" : "var(--color-success)" }}>
                      LKR{due.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: MUTED }}>Balance</span>
                    <span className="font-bold font-mono" style={{ color: balanceToReturn > 0 ? "var(--color-info)" : MUTED }}>
                      LKR{balanceToReturn.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Quick amounts */}
                <div className="grid grid-cols-2 gap-1">
                  {QUICK_AMOUNTS.map(v => (
                    <button key={v} onClick={() => addQuickAmount(v)}
                      className="py-2.5 rounded text-base font-mono font-semibold border"
                      style={{ borderColor: BORD, background: BORD, color: TEXT }}>
                      {v}
                    </button>
                  ))}
                  <button onClick={handleBillAmount}
                    className="col-span-2 py-2.5 rounded text-base font-semibold border"
                    style={{ borderColor: GOLD, background: `${GOLD}22`, color: GOLD }}>
                    Bill Amount
                  </button>
                </div>

                {/* Send SMS */}
                <div className="flex items-center gap-1.5 text-base" style={{ color: MUTED }}>
                  <input type="checkbox" id="sms-chk" checked={sendSMS}
                    onChange={e => setSendSMS(e.target.checked)} />
                  <label htmlFor="sms-chk" className="cursor-pointer">Send SMS</label>
                </div>
                {sendSMS && (
                  <input value={phone} onChange={e => setPhone(e.target.value)}
                    placeholder="Phone number"
                    className="border rounded px-2 py-2.5 text-base outline-none"
                    style={{ borderColor: BORD, background: BG, color: TEXT }} />
                )}

                {/* Cart details + Clear */}
                <button onClick={() => setShowCartDetails(v => !v)}
                  className="py-2.5 rounded border text-base font-medium"
                  style={{ borderColor: BORD, background: BORD, color: TEXT }}>
                  {showCartDetails ? "Hide Details" : "Cart Details"}
                </button>
                <button onClick={handleClear}
                  className="py-2.5 rounded border text-base font-medium"
                  style={{ borderColor: "var(--color-danger)", color: "var(--color-danger)", background: "transparent" }}>
                  Clear
                </button>
              </div>
            </div>

            {/* Cart details */}
            {showCartDetails && (
              <div className="rounded border overflow-hidden" style={{ borderColor: BORD }}>
                <div className="px-3 py-2 text-base font-semibold border-b" style={{ borderColor: BORD, color: TEXT, background: BG }}>
                  Order #{order.orderNumber} — Cart
                </div>
                <table className="w-full text-base">
                  <thead>
                    <tr className="border-b" style={{ borderColor: BORD, background: BG }}>
                      <th className="text-left px-3 py-2.5" style={{ color: DIM }}>Item</th>
                      <th className="text-center px-3 py-2.5" style={{ color: DIM }}>Qty</th>
                      <th className="text-right px-3 py-2.5" style={{ color: DIM }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item: any, idx: number) => (
                      <tr key={idx} className="border-t" style={{ borderColor: BORD }}>
                        <td className="px-3 py-2.5" style={{ color: TEXT }}>{item.name}</td>
                        <td className="px-3 py-2.5 text-center" style={{ color: MUTED }}>{item.qty}</td>
                        <td className="px-3 py-2.5 text-right font-mono" style={{ color: GOLD }}>
                          {(item.total ?? item.qty * item.price).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="px-3 py-2 border-t text-base space-y-0.5" style={{ borderColor: BORD, background: BG }}>
                  <div className="flex justify-between">
                    <span style={{ color: MUTED }}>Sub Total</span>
                    <span style={{ color: TEXT }}>{subtotal.toFixed(2)}</span>
                  </div>
                  {(itemDiscount + extraDiscount) > 0 && (
                    <div className="flex justify-between">
                      <span style={{ color: MUTED }}>Discount</span>
                      <span style={{ color: "var(--color-danger)" }}>-{(itemDiscount + extraDiscount).toFixed(2)}</span>
                    </div>
                  )}
                  {serviceCharge > 0 && (
                    <div className="flex justify-between">
                      <span style={{ color: MUTED }}>Service Charge</span>
                      <span style={{ color: TEXT }}>+{serviceCharge.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold border-t pt-1" style={{ borderColor: BORD }}>
                    <span style={{ color: TEXT }}>Payable</span>
                    <span style={{ color: GOLD }}>{payable.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>

        {/* Footer */}
        <div className="grid grid-cols-2 border-t" style={{ borderColor: BORD }}>
          <button onClick={onClose}
            className="py-3 text-sm font-semibold"
            style={{ background: "var(--color-danger)", color: "#fff" }}>
            ✕ Cancel
          </button>
          <button onClick={handleSubmit} disabled={!canSubmit}
            className="py-3 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: "var(--color-success)", color: "#fff" }}
            title={!canSubmit ? "Add full payment amount before submitting" : ""}>
            ⊞ Submit{!canSubmit && due > 0 ? ` (Due LKR${due.toFixed(2)})` : ""}
          </button>
        </div>
        </>
        )}

      </div>
    </div>
  );
}

// ── Shared print helper ───────────────────────────────────────────────────────
function triggerPrint(printableId: string) {
  const styleId = "idine-print-style";
  if (!document.getElementById(styleId)) {
    const s = document.createElement("style");
    s.id = styleId;
    s.innerHTML = `@page {
      size: 3in auto;
      margin: 0;
    }
    @media print {
      html, body {
        width: 3in !important;
        min-width: 3in !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      body > * { display: none !important; }
      #idine-invoice-print-root {
        display: block !important;
        position: static !important;
        width: 3in !important;
        min-width: 3in !important;
        max-width: 3in !important;
        margin: 0 !important;
        padding: 0 !important;
        background: #fff !important;
      }
      #idine-invoice-print-root > #idine-invoice-printable,
      #idine-invoice-print-root > #idine-kot-printable {
        width: 3in !important;
        min-width: 3in !important;
        max-width: 3in !important;
        box-sizing: border-box !important;
        margin: 0 !important;
      }
      #idine-invoice-print-root img {
        width: 100% !important;
        max-width: 100% !important;
        height: auto !important;
      }
    }`;
    document.head.appendChild(s);
  }
  let root = document.getElementById("idine-invoice-print-root");
  if (!root) {
    root = document.createElement("div");
    root.id = "idine-invoice-print-root";
    root.style.display = "none";
    document.body.appendChild(root);
  }
  const src = document.getElementById(printableId);
  // Use outerHTML (not innerHTML) so the source element's own inline styles
  // (color, font-weight, font-family, etc.) travel with it — innerHTML only
  // copied the children, silently dropping the wrapper's styling on print.
  root.innerHTML = src ? src.outerHTML : "";
  root.style.display = "block";
  window.print();
  root.style.display = "none";
}

// ── Shared receipt header ─────────────────────────────────────────────────────
function ReceiptHeader({ settings, label }: { settings: Record<string, string>; label: "INVOICE" | "BILL" }) {
  const headerImg = settings?.invoiceHeader;
  const name      = settings?.restaurantName || settings?.outletName || "iDine";
  const phone     = settings?.outletPhone || "";
  const email     = settings?.outletEmail || "";
  const address   = settings?.outletAddress || "";

  if (headerImg) {
    return (
      <div style={{ textAlign: "center", marginBottom: 12 }}>
        <img src={headerImg} alt="Header" style={{ width: "100%", maxWidth: "100%", maxHeight: 130, objectFit: "contain", display: "block", margin: "0 auto" }} />
        <div style={{ marginTop: 6, fontSize: 11, fontWeight: 700, letterSpacing: 3, color: "#000" }}>{label}</div>
      </div>
    );
  }
  return (
    <div style={{ textAlign: "center", marginBottom: 12 }}>
      <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: 1, color: "#000" }}>{name}</div>
      {address && <div style={{ fontSize: 11, color: "#000", marginTop: 2 }}>{address}</div>}
      {phone && <div style={{ fontSize: 11, color: "#000" }}>Tel: {phone}</div>}
      {email && <div style={{ fontSize: 11, color: "#000" }}>{email}</div>}
      <div style={{ marginTop: 6, fontSize: 11, fontWeight: 700, letterSpacing: 3, color: "#000" }}>{label}</div>
    </div>
  );
}

// ── Invoice / Bill Overlay ────────────────────────────────────────────────────
function InvoiceOverlay({ orderId, onClose, mode = "invoice" }: {
  orderId: number; onClose: () => void; mode?: "invoice" | "bill";
}) {
  const branchId = getBranchId();
  const { data, isLoading } = useQuery({
    queryKey: ["invoice-overlay", orderId],
    queryFn: async () => (await api.orders[":id"].$get({ param: { id: String(orderId) } })).json() as any,
  });
  const { data: settingsRaw } = useQuery({
    queryKey: ["settings", branchId],
    queryFn: async () => (await api.settings.$get({ query: { branchId: String(branchId) } })).json() as any,
  });
  const settings: Record<string, string> = (settingsRaw as any)?.settings || {};
  const order = (data as any)?.order;
  const items: any[] = (data as any)?.items || [];
  // Plain number, no currency symbol, no trailing ".00" on whole numbers
  const num = (n: number) => {
    const v = Number(n || 0);
    return v.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 });
  };
  // LKR-prefixed — used only for TOTAL / Cash Given / Amount Paid / Balance
  const money = (n: number) => `LKR ${num(n)}`;
  const isInvoice = mode === "invoice";
  const label = isInvoice ? "INVOICE" : "BILL";
  const printId = "idine-invoice-printable";
  const footerText = settings?.invoiceFooter || "Thank you for visiting us!";

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const timeStr = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

  const subtotal      = items.reduce((s, it) => s + Number(it.total || 0), 0);
  const discount      = Number(order?.discount || 0);
  const serviceCharge = Number(order?.serviceCharge || 0);
  const total         = Number(order?.total || subtotal);
  const amountPaid    = Number(order?.amountPaid || 0);
  const cashGiven     = Number(order?.cashGiven || 0);
  const balance       = Number(order?.balance || 0);
  const paymentMethod = order?.paymentMethod || "Cash";
  let payments: PaymentEntry[] = [];
  try { payments = JSON.parse(order?.paymentsJson || "[]"); } catch {}
  const tax = 0;

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center" style={{ background: "#00000099" }}>
      <div className="rounded-xl shadow-2xl flex flex-col" style={{ background: "#fff", width: 420, maxHeight: "92vh", color: "#000" }}>

        {/* ── Modal header bar ── */}
        <div className="flex items-center justify-between px-5 py-3 border-b rounded-t-xl"
          style={{ borderColor: "#e5e7eb", background: "#f9fafb" }}>
          <div className="flex items-center gap-2">
            <Printer size={14} style={{ color: "#000" }} />
            <span className="text-sm font-semibold" style={{ color: "#000" }}>{label} Preview</span>
          </div>
          <button onClick={onClose} style={{ color: "#000" }}><X size={16} /></button>
        </div>

        {/* ── Scrollable receipt ── */}
        <div className="flex-1 overflow-y-auto" style={{ padding: "0 0 0 0" }}>
          {isLoading
            ? <div className="flex justify-center items-center py-16 text-sm" style={{ color: "#000" }}>Loading…</div>
            : !order
              ? <div className="text-center py-16 text-sm" style={{ color: "var(--color-danger)" }}>Failed to load order</div>
              : (
                <div id={printId} style={{
                  width: "3in",
                  minWidth: "3in",
                  maxWidth: "3in",
                  boxSizing: "border-box",
                  margin: "0 auto",
                  fontFamily: "'Roboto', Arial, sans-serif",
                  background: "#fff",
                  color: "#000",
                  fontWeight: 500,
                  padding: "20px 10px 16px",
                  fontSize: 13,
                  lineHeight: 1.5,
                }}>
                  {/* Restaurant header */}
                  <ReceiptHeader settings={settings} label={label} />

                  {/* Order type — big & centered, right under the Bill/Invoice label */}
                  <div style={{ textAlign: "center", marginBottom: 8 }}>
                    <span style={{ fontSize: 16, fontWeight: 900, letterSpacing: 1.5, textTransform: "uppercase", color: "#000" }}>
                      {order.type === "dine-in" ? "DINE IN" : order.type === "takeaway" ? "TAKEAWAY" : order.type === "delivery" ? "DELIVERY" : order.type}
                    </span>
                  </div>

                  {/* Divider */}
                  <div style={{ borderTop: "1px solid #000", margin: "10px 0" }} />

                  {/* Order meta */}
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 700, color: "#000", marginBottom: 2 }}>
                    <span>Order #: <strong style={{ color: "#000" }}>{order.orderNumber}</strong></span>
                    <span>{dateStr}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 700, color: "#000", marginBottom: 2 }}>
                    <span>{timeStr}</span>
                  </div>
                  {order.customerName && order.customerName !== "Walk-in Customer" && (
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#000", marginBottom: 2 }}>
                      Customer: <strong style={{ color: "#000" }}>{order.customerName}</strong>
                    </div>
                  )}
                  {order.tableId && (
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#000", marginBottom: 2 }}>
                      Table: <strong style={{ color: "#000" }}>{order.tableId}</strong>
                    </div>
                  )}

                  {/* Divider */}
                  <div style={{ borderTop: "1px solid #000", margin: "10px 0" }} />

                  {/* Items header */}
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 900, color: "#000", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    <span style={{ flex: 1 }}>Item</span>
                    <span style={{ width: 18, textAlign: "right" }}>Qty</span>
                    <span style={{ width: 46, textAlign: "right", marginLeft: 4 }}>Price</span>
                    <span style={{ width: 52, textAlign: "right", marginLeft: 4 }}>Amount</span>
                  </div>
                  <div style={{ borderTop: "2px solid #000", marginBottom: 6 }} />

                  {/* Items */}
                  {items.map((it: any, i: number) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 3, paddingBottom: 3, borderBottom: "1px dotted #999" }}>
                      <span style={{ flex: 1, paddingRight: 16, fontWeight: 500 }}>{it.name}</span>
                      <span style={{ width: 18, textAlign: "right", color: "#000" }}>{it.qty}</span>
                      <span style={{ width: 46, textAlign: "right", color: "#000", marginLeft: 4 }}>{num(it.price)}</span>
                      <span style={{ width: 52, textAlign: "right", fontWeight: 700, marginLeft: 4 }}>{num(it.total)}</span>
                    </div>
                  ))}

                  {/* Totals block */}
                  <div style={{ borderTop: "1px solid #000", marginTop: 8, paddingTop: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700, color: "#000", marginBottom: 3 }}>
                      <span>Subtotal</span>
                      <span>{num(subtotal)}</span>
                    </div>
                    {discount > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700, color: "#000", marginBottom: 3 }}>
                        <span>Discount</span>
                        <span>- {num(discount)}</span>
                      </div>
                    )}
                    {serviceCharge > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700, color: "#000", marginBottom: 3 }}>
                        <span>Service Charge</span>
                        <span>{num(serviceCharge)}</span>
                      </div>
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: 800, borderTop: "2px solid #000", marginTop: 6, paddingTop: 6 }}>
                      <span>TOTAL</span>
                      <span>{money(total)}</span>
                    </div>

                    {/* Payment breakdown — invoice only */}
                    {isInvoice && amountPaid > 0 && (
                      <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #000" }}>
                        {payments.length > 1 ? (
                          payments.map((p, i) => (
                            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700, color: "#000", marginBottom: 3 }}>
                              <span>Paid ({p.method}){p.ref ? ` — ${p.ref}` : ""}</span>
                              <span>{money(p.amount)}</span>
                            </div>
                          ))
                        ) : (
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700, color: "#000", marginBottom: 3 }}>
                            <span>Payment Method</span>
                            <span style={{ fontWeight: 700 }}>{paymentMethod}</span>
                          </div>
                        )}
                        {paymentMethod === "Cash" && cashGiven > 0 && (
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700, color: "#000", marginBottom: 3 }}>
                            <span>Cash Given</span>
                            <span>{money(cashGiven)}</span>
                          </div>
                        )}
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700, color: "#000", marginBottom: 3 }}>
                          <span>Amount Paid</span>
                          <span>{money(amountPaid)}</span>
                        </div>
                        {balance > 0 && (
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700, color: "#000", marginBottom: 3 }}>
                            <span>Balance (Change)</span>
                            <span>{money(balance)}</span>
                          </div>
                        )}
                        {balance < 0 && (
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700, color: "#000", marginBottom: 3 }}>
                            <span>Balance Due</span>
                            <span>{money(Math.abs(balance))}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Status badge */}
                  <div style={{ textAlign: "center", margin: "10px 0 4px" }}>
                    <span style={{
                      display: "inline-block",
                      padding: "2px 12px",
                      borderRadius: 20,
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: 1,
                      textTransform: "uppercase",
                      background: isInvoice ? "#dcfce7" : "#fef9c3",
                      color: "#000",
                      border: `1px solid ${isInvoice ? "#86efac" : "#fde047"}`,
                    }}>
                      {isInvoice ? "✓ PAID" : "PENDING PAYMENT"}
                    </span>
                  </div>

                  {/* Footer */}
                  <div style={{ borderTop: "1px solid #000", marginTop: 12, paddingTop: 10, textAlign: "center" }}>
                    {footerText.split("\n").map((line, i) => (
                      <div key={i} style={{ fontSize: 11, fontWeight: 700, color: "#000", marginBottom: 2 }}>{line}</div>
                    ))}
                  </div>
                </div>
              )}
        </div>

        {/* ── Action bar ── */}
        {order && (
          <div className="flex gap-2 px-5 py-3 border-t rounded-b-xl" style={{ borderColor: "#e5e7eb", background: "#f9fafb" }}>
            <button onClick={onClose}
              className="flex-1 py-2 rounded-lg text-xs font-medium border"
              style={{ color: "#000", borderColor: "#d1d5db", background: "#fff" }}>
              Close
            </button>
            <button onClick={() => triggerPrint(printId)}
              className="flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5"
              style={{ background: "#111", color: "#fff" }}>
              <Printer size={13} /> Print {label}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── KOT print preview overlay (mirrors InvoiceOverlay: preview + native browser print dialog) ──
function KotOverlay({ kot, onClose, onPrinted }: { kot: any; onClose: () => void; onPrinted: () => void }) {
  const printId = "idine-kot-printable";
  const typeLabel = kot.type === "dine-in" ? "DINE IN" : kot.type === "takeaway" ? "TAKEAWAY" : kot.type === "delivery" ? "DELIVERY" : (kot.type || "").toUpperCase();
  const now = new Date();

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center" style={{ background: "#00000099" }}>
      <div className="rounded-xl shadow-2xl flex flex-col" style={{ background: "#fff", width: 380, maxHeight: "92vh", color: "#000" }}>

        {/* Modal header bar */}
        <div className="flex items-center justify-between px-5 py-3 border-b rounded-t-xl"
          style={{ borderColor: "#e5e7eb", background: "#f9fafb" }}>
          <div className="flex items-center gap-2">
            <Printer size={14} style={{ color: "#000" }} />
            <span className="text-sm font-bold" style={{ color: "#000" }}>KOT Preview</span>
          </div>
          <button onClick={onClose} style={{ color: "#000" }}><X size={16} /></button>
        </div>

        {/* Scrollable ticket */}
        <div className="flex-1 overflow-y-auto">
          <div id={printId} style={{
            fontFamily: "'Courier New', Courier, monospace",
            background: "#fff", color: "#000", fontWeight: 700,
            padding: "20px 24px 16px", fontSize: 13, lineHeight: 1.5,
          }}>
            {/* Title */}
            <div style={{ textAlign: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 22, fontWeight: 900, letterSpacing: 3, color: "#000" }}>***KOT***</span>
            </div>
            <div style={{ textAlign: "center", marginBottom: 8 }}>
              <span style={{
                fontSize: 13, fontWeight: 900, letterSpacing: 1.5, color: "#000",
                border: "2px solid #000", padding: "2px 10px",
              }}>{typeLabel}</span>
            </div>
            <div style={{ borderTop: "2px solid #000", margin: "8px 0" }} />

            {/* Meta */}
            <div style={{ fontSize: 12, fontWeight: 800, color: "#000", marginBottom: 3 }}>Order #: {kot.orderNumber}</div>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#000", marginBottom: 3 }}>Time: {now.toLocaleTimeString("en-GB")}</div>
            {kot.tableId && <div style={{ fontSize: 12, fontWeight: 800, color: "#000", marginBottom: 3 }}>Table: {kot.tableId}</div>}
            <div style={{ fontSize: 12, fontWeight: 800, color: "#000", marginBottom: 3 }}>Placed By: {kot.placedBy || "—"}</div>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#000", marginBottom: 3 }}>Waiter: {kot.waiterName || "—"}</div>
            {kot.customerName && <div style={{ fontSize: 12, fontWeight: 800, color: "#000", marginBottom: 3 }}>Customer: {kot.customerName}</div>}

            <div style={{ borderTop: "2px solid #000", margin: "8px 0" }} />

            {/* Items */}
            {kot.items.map((it: any, i: number) => (
              <div key={i} style={{ marginBottom: 7, paddingBottom: 5, borderBottom: "1px dashed #000" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: 900, color: "#000" }}>
                  <span>{it.cancelled ? `-${it.qty} ${it.name}` : `${it.qty}x ${it.name}`}</span>
                  {it.cancelled && <span style={{ fontSize: 11, fontWeight: 900, border: "1px solid #000", padding: "0 6px" }}>CANCEL</span>}
                </div>
                {it.modifiers?.length > 0 && it.modifiers.map((m: string, j: number) => (
                  <div key={j} style={{ fontSize: 12, fontWeight: 800, color: "#000", paddingLeft: 12 }}>+ {m}</div>
                ))}
                {it.note && (
                  <div style={{ fontSize: 12, fontWeight: 900, color: "#000", paddingLeft: 12, fontStyle: "italic" }}>
                    ** {it.note} **
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Action bar */}
        <div className="flex gap-2 px-5 py-3 border-t rounded-b-xl" style={{ borderColor: "#e5e7eb", background: "#f9fafb" }}>
          <button onClick={onClose}
            className="flex-1 py-2 rounded-lg text-xs font-bold border"
            style={{ color: "#000", borderColor: "#d1d5db", background: "#fff" }}>
            Skip
          </button>
          <button onClick={() => { triggerPrint(printId); onPrinted(); }}
            className="flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5"
            style={{ background: "#111", color: "#fff" }}>
            <Printer size={13} /> Print KOT
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function POSPage() {
  const branchId = getBranchId();
  const qc = useQueryClient();
  const [, navigate] = useLocation();

  // ── Toolbar feature state
  const [showDrafts,         setShowDrafts]         = useState(false);
  const [showRecentSales,    setShowRecentSales]    = useState(false);
  const [showRefund,         setShowRefund]         = useState(false);
  const [invoicePreviewId,   setInvoicePreviewId]   = useState<number | null>(null);
  const [invoicePreviewMode, setInvoicePreviewMode] = useState<"invoice" | "bill">("invoice");
  const [showSelfOrderQR,    setShowSelfOrderQR]    = useState(false);
  const [showQROrders,       setShowQROrders]       = useState(false);
  const [showRegistry,       setShowRegistry]       = useState(false);
  const [showKotMenu,        setShowKotMenu]        = useState(false);

  // ── State
  const [selectedOrderId,    setSelectedOrderId]    = useState<number | null>(null);
  const [orderType,          setOrderType]          = useState<OrderType>("dine-in");
  const [selectedWaiterId,   setSelectedWaiterId]   = useState<number | null>(null);
  const [selectedWaiterName, setSelectedWaiterName] = useState<string | null>(null);
  const [customerId,         setCustomerId]         = useState<number | null>(null);
  const [customerName,       setCustomerName]       = useState("Walk-in Customer");
  const [selectedTableId,    setSelectedTableId]    = useState<number | null>(null);
  const [cartItems,          setCartItems]          = useState<CartItem[]>([]);
  const [categoryId,         setCategoryId]         = useState<number | null>(null);
  const [searchQuery,        setSearchQuery]        = useState("");
  const [activeFilter,       setActiveFilter]       = useState<string | null>(null);
  const [orderSearch,        setOrderSearch]        = useState("");
  const [toast,              setToast]              = useState<string | null>(null);

  // Modifier picker state
  const [modPickerItemId,    setModPickerItemId]    = useState<string | null>(null);

  // Per-item kitchen note (e.g. "Low spicy") — prints on the KOT only
  const [notePickerItemId,   setNotePickerItemId]   = useState<string | null>(null);
  const [noteDraft,          setNoteDraft]          = useState("");

  // Variation picker state
  const [varPickerItem,      setVarPickerItem]      = useState<any | null>(null);

  // Modal states
  const [detailsOrderId,     setDetailsOrderId]     = useState<number | null>(null);
  const [billOrderId,        setBillOrderId]        = useState<number | null>(null);
  const [invoiceOrderId,     setInvoiceOrderId]     = useState<number | null>(null);
  // finalizeOrderId = open FinalizeModal; finalizeIsQuick = was a quick-invoice (mark completed on submit)
  const [finalizeOrderId,    setFinalizeOrderId]    = useState<number | null>(null);
  const [finalizeIsQuick,    setFinalizeIsQuick]    = useState(false);
  const [cancelConfirmId,    setCancelConfirmId]    = useState<number | null>(null);
  const [modifyOrderId,      setModifyOrderId]      = useState<number | null>(null);
  const [modifyOriginalItems, setModifyOriginalItems] = useState<{ menuItemId: number | null; name: string; qty: number }[]>([]);
  const [pendingKotChoice,   setPendingKotChoice]   = useState<any | null>(null);
  // Print KOT preview — auto-print is suspended; this sits here until the user opens the print dialog
  const [pendingKot,         setPendingKot]         = useState<any | null>(null);

  // Quick Add Item modal
  const [showQuickAddItem,   setShowQuickAddItem]   = useState(false);
  const [qaForm,             setQaForm]             = useState({ name: "", code: "", categoryId: "" as string | number, priceDineIn: "", priceTakeaway: "", priceDelivery: "", isVeg: false, isBeverage: false });
  const [qaError,            setQaError]            = useState<string | null>(null);

  // ── Queries
  const { data: ordersData, isLoading: ordersLoading } = useQuery({
    queryKey: ["orders", branchId],
    queryFn: async () => (await api.orders.$get({ query: { branchId: String(branchId) } })).json(),
    refetchInterval: 10000,
  });
  // Loaded so the running-orders search can also match a customer's mobile number
  const { data: allCustomersData } = useQuery({
    queryKey: ["all-customers", branchId],
    queryFn: async () => (await api.customers.$get({ query: { branchId: String(branchId) } })).json(),
  });
  const { data: categoriesData } = useQuery({
    queryKey: ["categories", branchId],
    queryFn: async () => (await api.categories.$get({ query: { branchId: String(branchId) } })).json(),
  });
  const { data: menuData } = useQuery({
    queryKey: ["menu-items", branchId, categoryId],
    queryFn: async () => {
      const q: Record<string, string> = { branchId: String(branchId) };
      if (categoryId) q.categoryId = String(categoryId);
      return (await api["menu-items"].$get({ query: q })).json();
    },
  });
  // Best-sellers ranking — used to sort the "All" category tab top-selling first
  const { data: bestSellersData } = useQuery({
    queryKey: ["best-sellers", branchId],
    queryFn: async () => (await api["menu-items"]["best-sellers"].$get({ query: { branchId: String(branchId) } })).json(),
  });
  const { data: tablesData } = useQuery({
    queryKey: ["tables", branchId],
    queryFn: async () => (await api.tables.$get({ query: { branchId: String(branchId) } })).json(),
  });
  const { data: usersData } = useQuery({
    queryKey: ["users", branchId],
    queryFn: async () => (await api.users.$get({ query: { branchId: String(branchId) } })).json(),
  });
  const waiters = ((usersData as any)?.users || []).filter((u: any) => u.role === "waiter" || u.role === "manager");

  // Printer setup settings — for category→printer routing
  const { data: printerSettingsData } = useQuery({
    queryKey: ["settings", branchId],
    queryFn: async () => (await api.settings.$get({ query: { branchId: String(branchId) } })).json(),
    staleTime: 30_000,
  });
  // categoryPrinterMap: { [categoryId]: printerId }
  const categoryPrinterMap = useMemo<Record<number, number>>(() => {
    try {
      const raw = (printerSettingsData as any)?.settings?.printerSetup;
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      const pc: Record<string, number[]> = parsed.printerCategories || {};
      const map: Record<number, number> = {};
      Object.entries(pc).forEach(([pid, cats]) => {
        cats.forEach((cid: number) => { map[cid] = parseInt(pid); });
      });
      return map;
    } catch { return {}; }
  }, [printerSettingsData]);

  // Fetch details for the Order Details modal — own query, keyed only by detailsOrderId
  // (previously shared one query across 4 unrelated modal ids, which could serve stale/empty
  // data to whichever modal read it last — root cause of "Finalize Sale shows 0 / cart details
  // not showing" reports).
  const { data: orderDetailData } = useQuery({
    queryKey: ["order-detail", detailsOrderId],
    queryFn: async () => (await api.orders[":id"].$get({ param: { id: String(detailsOrderId) } })).json(),
    enabled: !!detailsOrderId,
  });

  // Fetch details for the Finalize Sale modal — own query, keyed only by finalizeOrderId
  const { data: finalizeDetailData, isLoading: finalizeLoading } = useQuery({
    queryKey: ["finalize-order-detail", finalizeOrderId],
    queryFn: async () => (await api.orders[":id"].$get({ param: { id: String(finalizeOrderId) } })).json(),
    enabled: !!finalizeOrderId,
  });

  // ── Mutations
  const placeOrder = useMutation({
    mutationFn: async (status: string) => {
      const apiStatus = status === "quick-invoice" ? "confirmed" : status;
      const subtotal = cartItems.reduce((s, i) => s + (i.qty * i.price - i.discount + i.modifiers.reduce((ms, m) => ms + m.price, 0) * i.qty), 0);

      // ── Modifying an existing running order — UPDATE it instead of creating a new one ──
      if (modifyOrderId) {
        const orderId = modifyOrderId;
        const existingOrder = (ordersData as any)?.orders?.find((o: any) => o.id === orderId);

        await api.orders[":id"].$patch({
          param: { id: String(orderId) },
          json: {
            type: orderType, status: apiStatus, tableId: selectedTableId,
            waiterId: selectedWaiterId, customerId, customerName,
            subtotal, total: subtotal,
          },
        });

        // Reconcile order items: drop the old set, insert the current cart as the new set
        let createdItemIds: number[] = [];
        try {
          const oldItemsRes = await (await api["order-items"].$get({ query: { orderId: String(orderId) } })).json() as any;
          const oldItems: any[] = oldItemsRes?.orderItems || [];
          await Promise.all(oldItems.map((it: any) => api["order-items"][":id"].$delete({ param: { id: String(it.id) } })));
          const created = await (await api["order-items"].bulk.$post({
            json: {
              items: cartItems.map(i => ({
                orderId, menuItemId: i.menuItemId, name: i.name, price: i.price,
                qty: i.qty, printerId: i.printerId,
                total: i.qty * i.price - i.discount + i.modifiers.reduce((ms, m) => ms + m.price, 0) * i.qty,
                modifiers: i.modifiers.length ? JSON.stringify(i.modifiers.map(m => m.name)) : null,
                note: i.note || null,
              })),
            },
          })).json();
          createdItemIds = ((created as any)?.orderItems || []).map((i: any) => i.id);
        } catch (e) {
          console.error("[placeOrder] modify reconcile failed:", e);
        }

        // Diff original vs current cart to find added / reduced-or-cancelled items.
        // Keyed by name (not menuItemId) — different variations of the same base item
        // (e.g. "Juice (Small)" vs "Juice (Large)") share one menuItemId but must stay distinct.
        const origMap = new Map<string, { name: string; qty: number }>();
        modifyOriginalItems.forEach(i => {
          const key = i.name;
          origMap.set(key, { name: i.name, qty: (origMap.get(key)?.qty || 0) + i.qty });
        });
        const newMap = new Map<string, { name: string; qty: number }>();
        cartItems.forEach(i => {
          const key = i.name;
          newMap.set(key, { name: i.name, qty: (newMap.get(key)?.qty || 0) + i.qty });
        });
        const addedItems: { name: string; qty: number }[] = [];
        const reducedItems: { name: string; qty: number }[] = [];
        new Set([...origMap.keys(), ...newMap.keys()]).forEach(key => {
          const oldQty = origMap.get(key)?.qty || 0;
          const newQty = newMap.get(key)?.qty || 0;
          const name = newMap.get(key)?.name || origMap.get(key)?.name || "";
          const delta = newQty - oldQty;
          if (delta > 0) addedItems.push({ name, qty: delta });
          else if (delta < 0) reducedItems.push({ name, qty: -delta });
        });

        const kotBase = {
          orderId, itemIds: createdItemIds,
          orderNumber: existingOrder?.orderNumber || "",
          type: orderType, tableId: selectedTableId, waiterName: selectedWaiterName,
          placedBy: getUser()?.name || null,
          customerName: customerName !== "Walk-in Customer" ? customerName : null,
        };

        return {
          order: { id: orderId }, isModify: true,
          kotChoice: apiStatus === "draft" ? null : {
            ...kotBase,
            allItems: cartItems.map(i => ({ name: i.name, qty: i.qty, note: i.note, modifiers: i.modifiers.map(m => m.name) })),
            addedItems, reducedItems,
          },
        };
      }

      // ── New order ──
      const now = new Date();
      const mm  = String(now.getMonth() + 1).padStart(2, "0");
      const dd  = String(now.getDate()).padStart(2, "0");
      const ww  = waiterShortId(selectedWaiterName);
      // get seq from existing orders today
      const orders = (ordersData as any)?.orders || [];
      const prefix = `${mm}${dd}${ww}-`;
      const todayOrders = orders.filter((o: any) => o.orderNumber?.startsWith(`${mm}${dd}`));
      const seq = todayOrders.length + 1;
      const orderNumber = `${prefix}${String(seq).padStart(3, "0")}`;

      const order = await (await api.orders.$post({
        json: {
          branchId, type: orderType, status: apiStatus, tableId: selectedTableId,
          waiterId: selectedWaiterId, customerId, customerName,
          subtotal, total: subtotal, orderNumber, placedBy: getUser()?.name || null,
        },
      })).json();
      const orderId = (order as any).order.id;

      let createdItemIds: number[] = [];
      try {
        const created = await (await api["order-items"].bulk.$post({
          json: {
            items: cartItems.map(i => ({
              orderId, menuItemId: i.menuItemId, name: i.name, price: i.price,
              qty: i.qty, printerId: i.printerId,
              total: i.qty * i.price - i.discount + i.modifiers.reduce((ms, m) => ms + m.price, 0) * i.qty,
              modifiers: i.modifiers.length ? JSON.stringify(i.modifiers.map(m => m.name)) : null,
              note: i.note || null,
            })),
          },
        })).json();
        createdItemIds = ((created as any)?.orderItems || []).map((i: any) => i.id);
      } catch (e) {
        console.error("[placeOrder] order-items bulk failed:", e);
      }

      // Auto KOT print is suspended — instead surface a KOT print preview modal
      // (like Bill/Invoice) that opens the browser print dialog on demand.
      let kotPreview: any = null;
      if (apiStatus !== "draft") {
        kotPreview = {
          orderId, itemIds: createdItemIds,
          orderNumber: (order as any).order.orderNumber,
          type: orderType, tableId: selectedTableId, waiterName: selectedWaiterName,
          placedBy: getUser()?.name || null,
          customerName: customerName !== "Walk-in Customer" ? customerName : null,
          items: cartItems.map(i => ({
            name: i.name, qty: i.qty, note: i.note,
            modifiers: i.modifiers.map(m => m.name),
          })),
        };
      }
      return { ...order, kotPreview };
    },
    onSuccess: (res: any, status) => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      const newOrderId = res?.order?.id ?? null;
      if (status === "quick-invoice" && newOrderId) {
        // Open Finalize Sale modal immediately; mark as quick so Submit → completed
        setFinalizeIsQuick(true);
        setFinalizeOrderId(newOrderId);
      }
      if (res?.isModify) {
        if (res.kotChoice) setPendingKotChoice(res.kotChoice);
        resetOrder();
        showToast(status === "draft" ? "Order saved as draft" : "Order updated.");
        return;
      }
      if (res?.kotPreview) {
        setPendingKot(res.kotPreview);
      }
      resetOrder();
      showToast(status === "draft" ? "Order saved as draft" : "Order placed.");
    },
    onError: (err: any) => {
      console.error("[placeOrder] failed:", err);
      showToast("Failed to place order. Please try again.");
    },
  });

  const markKotPrinted = useMutation({
    mutationFn: async (itemIds: number[]) => {
      await Promise.all(itemIds.map(id => api["order-items"][":id"].$patch({ param: { id: String(id) }, json: { kotPrinted: true } })));
    },
  });

  const updateOrderStatus = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) =>
      (await api.orders[":id"].$patch({ param: { id: String(id) }, json: { status } })).json(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["orders"] }); setCancelConfirmId(null); setSelectedOrderId(null); },
  });

  // Re-print KOT — same browser print dialog as the initial KOT (no more silent auto-print to a thermal printer)
  const reprintKOT = useMutation({
    mutationFn: async ({ orderId, mode }: { orderId: number; mode: "all" | "new" }) => {
      const res = await (await api.orders[":id"].$get({ param: { id: String(orderId) } })).json() as any;
      const { order, items } = res;
      const ts = (v: any) => {
        const t = v ?? 0;
        if (typeof t === "number") return t < 1e12 ? t * 1000 : t;
        const parsed = new Date(t).getTime();
        return isNaN(parsed) ? 0 : parsed;
      };
      let printItems = items || [];
      if (mode === "new") {
        const orderTs = ts(order.createdAt);
        // "New items" = items added after the initial order creation (later edit batch)
        printItems = (items || []).filter((it: any) => ts(it.createdAt) - orderTs > 5000);
        // Fallback: if none flagged by time, use the latest-created cluster
        if (printItems.length === 0 && (items || []).length) {
          const maxTs = Math.max(...items.map((it: any) => ts(it.createdAt)));
          printItems = items.filter((it: any) => maxTs - ts(it.createdAt) < 3000 && ts(it.createdAt) - orderTs > 1000);
        }
        if (printItems.length === 0) { showToast("No new items to print"); return null; }
      }
      const waiter = waiters.find((w: any) => w.id === order.waiterId);
      return {
        orderId, itemIds: printItems.map((it: any) => it.id),
        orderNumber: order.orderNumber,
        type: order.type, tableId: order.tableId, waiterName: waiter?.name || null,
        placedBy: order.placedBy || null,
        customerName: order.customerName !== "Walk-in Customer" ? order.customerName : null,
        items: printItems.map((it: any) => ({
          name: it.name, qty: it.qty, note: it.note,
          modifiers: (() => { try { return JSON.parse(it.modifiers || "[]"); } catch { return []; } })(),
        })),
      };
    },
    onSuccess: (kotPreview) => { if (kotPreview) setPendingKot(kotPreview); },
  });

  // Load order into cart for modification
  const loadOrderForEdit = useCallback(async (orderId: number) => {
    const res = await (await api.orders[":id"].$get({ param: { id: String(orderId) } })).json() as any;
    const { order, items } = res;
    setOrderType(order.type as OrderType);
    setSelectedWaiterId(order.waiterId ?? null);
    setSelectedWaiterName(order.waiterName ?? waiters.find((w: any) => w.id === order.waiterId)?.name ?? null);
    setCustomerId(order.customerId ?? null);
    setCustomerName(order.customerName || "Walk-in Customer");
    setSelectedTableId(order.tableId ?? null);
    setCartItems((items || []).map((i: any) => ({
      cartKey: String(i.id), menuItemId: i.menuItemId, name: i.name, price: i.price, qty: i.qty,
      discount: i.discount ?? 0, printerId: i.printerId ?? null, categoryId: i.categoryId ?? null, modifiers: [],
      note: i.note || undefined,
    })));
    setModifyOriginalItems((items || []).map((i: any) => ({ menuItemId: i.menuItemId ?? null, name: i.name, qty: i.qty })));
    setModifyOrderId(orderId);
    showToast("Order loaded for editing");
  }, []);

  // ── Helpers
  function resetOrder() {
    setCartItems([]); setOrderType("dine-in"); setSelectedTableId(null);
    setCustomerName("Walk-in Customer"); setCustomerId(null);
    setSelectedOrderId(null); setSelectedWaiterId(null); setSelectedWaiterName(null);
    setModifyOrderId(null); setModifyOriginalItems([]);
  }
  function showToast(msg: string) { setToast(msg); }

  function addToCart(item: any, variation?: any) {
    if (!variation && item.variations && item.variations.length > 0) {
      // Has variations — open picker modal
      setVarPickerItem(item);
      return;
    }
    // Determine price based on order type
    const priceByType = variation
      ? (orderType === "dine-in" ? variation.priceDineIn : orderType === "takeaway" ? variation.priceTakeaway : variation.priceDelivery)
      : (orderType === "dine-in" ? (item.priceDineIn || item.price) : orderType === "takeaway" ? (item.priceTakeaway || item.price) : (item.priceDelivery || item.price));
    const cartKey = variation ? `${item.id}-${variation.id}` : String(item.id);
    // Abbreviate the variation to its first letter, capitalized, e.g. "Full" -> "(F)"
    const varInitial = variation?.name?.trim()?.[0]?.toUpperCase();
    const name = variation ? `${item.name} (${varInitial})` : item.name;
    setCartItems(prev => {
      const ex = prev.find(i => i.cartKey === cartKey);
      if (ex) return prev.map(i => i.cartKey === cartKey ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { cartKey, menuItemId: item.id, name, price: priceByType, qty: 1, discount: 0, printerId: item.printerId ?? null, categoryId: item.categoryId ?? null, modifiers: [] }];
    });
  }
  function changeQty(cartKey: string, delta: number) {
    setCartItems(prev => prev.map(i => i.cartKey === cartKey ? { ...i, qty: i.qty + delta } : i).filter(i => i.qty > 0));
  }
  function setDiscount(cartKey: string, val: number) {
    setCartItems(prev => prev.map(i => i.cartKey === cartKey ? { ...i, discount: isNaN(val) ? 0 : val } : i));
  }
  function removeItem(cartKey: string) { setCartItems(prev => prev.filter(i => i.cartKey !== cartKey)); }
  function setItemModifiers(cartKey: string, mods: Modifier[]) {
    setCartItems(prev => prev.map(i => i.cartKey === cartKey ? { ...i, modifiers: mods } : i));
  }

  function setItemNote(cartKey: string, note: string) {
    setCartItems(prev => prev.map(i => i.cartKey === cartKey ? { ...i, note: note.trim() || undefined } : i));
  }

  // Quick Add Item mutation
  const quickAddItem = useMutation({
    mutationFn: async () => {
      const price = parseFloat(qaForm.priceDineIn);
      if (!qaForm.name.trim()) throw new Error("Name is required");
      if (isNaN(price) || price < 0) throw new Error("Invalid price");
      return (await api["menu-items"].$post({
        json: {
          branchId,
          name: qaForm.name.trim(),
          code: qaForm.code.trim() || null,
          categoryId: qaForm.categoryId ? Number(qaForm.categoryId) : null,
          priceDineIn: price,
          priceTakeaway: qaForm.priceTakeaway ? parseFloat(qaForm.priceTakeaway) : price,
          priceDelivery: qaForm.priceDelivery ? parseFloat(qaForm.priceDelivery) : price,
          isVeg: qaForm.isVeg,
          isBeverage: qaForm.isBeverage,
          isAvailable: true,
        },
      })).json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["menu-items", branchId] });
      setShowQuickAddItem(false);
      setQaForm({ name: "", code: "", categoryId: "", priceDineIn: "", priceTakeaway: "", priceDelivery: "", isVeg: false, isBeverage: false });
      setQaError(null);
      showToast("Item added!");
    },
    onError: (e: any) => setQaError(e?.message || "Failed to add item"),
  });

  // ── Derived data
  const orders      = (ordersData as any)?.orders || [];
  const categories  = ((categoriesData as any)?.categories || []).filter((c: any) => c.isActive);
  const allMenuItems = (menuData as any)?.menuItems || [];
  const bestSellerRank = new Map<number, number>(
    ((bestSellersData as any)?.bestSellers || []).map((b: any, i: number) => [b.menuItemId, i])
  );
  const menuItemsFiltered = allMenuItems.filter((item: any) => {
    if (activeFilter === "veg"   && !item.isVeg)      return false;
    if (activeFilter === "bev"   && !item.isBeverage)  return false;
    if (activeFilter === "promo" && !item.isPromo)     return false;
    if (activeFilter === "combo" && !item.isCombo)     return false;
    if (searchQuery && !item.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });
  // "All" tab (no category selected) — show top-selling items first
  const menuItems = categoryId === null
    ? [...menuItemsFiltered].sort((a: any, b: any) => {
        const ra = bestSellerRank.has(a.id) ? bestSellerRank.get(a.id)! : Infinity;
        const rb = bestSellerRank.has(b.id) ? bestSellerRank.get(b.id)! : Infinity;
        return ra - rb;
      })
    : menuItemsFiltered;
  const tables      = (tablesData as any)?.tables || [];
  const runningOrders = orders.filter((o: any) =>
    o.status !== "completed" && o.status !== "cancelled" &&
    o.status !== "refunded" && o.status !== "partially_refunded"
  );
  const customersById = new Map(((allCustomersData as any)?.customers || []).map((c: any) => [c.id, c]));
  const filteredOrders = runningOrders.filter((o: any) => {
    if (!orderSearch) return true;
    const q = orderSearch.toLowerCase();
    const customerPhone = (customersById.get(o.customerId) as any)?.phone || "";
    return (
      o.orderNumber?.toLowerCase().includes(q) ||
      o.customerName?.toLowerCase().includes(q) ||
      customerPhone.toLowerCase().includes(q)
    );
  });

  // Modal data
  const modalOrderData  = (orderDetailData as any) ?? {};
  const modalOrder      = modalOrderData.order  ?? {};
  const modalItems      = modalOrderData.items  ?? [];
  const modalWaiterName = modalOrder.waiterName || modalOrder.placedBy || waiters.find((waiter: any) => waiter.id === modalOrder.waiterId)?.name || "Unassigned";
  const finalizeOrderData = (finalizeDetailData as any) ?? {};
  const finalizeOrder     = finalizeOrderData.order ?? {};
  const finalizeItems     = finalizeOrderData.items ?? [];

  // Item row total (with modifiers)
  function itemTotal(item: CartItem) {
    const modCost = item.modifiers.reduce((s, m) => s + m.price, 0);
    return (item.qty * (item.price + modCost)) - item.discount;
  }
  const total = cartItems.reduce((s, i) => s + itemTotal(i), 0);

  // ── Customer Display: mirror live cart to localStorage for the popup window
  const customerWinRef = useRef<Window | null>(null);

  useEffect(() => {
    const payload = {
      items: cartItems.map(i => ({
        name: i.name, qty: i.qty, price: i.price, lineTotal: itemTotal(i),
      })),
      total, customerName, orderType, ts: Date.now(),
    };
    try { localStorage.setItem("idine_customer_display", JSON.stringify(payload)); } catch {}
  }, [cartItems, total, customerName, orderType]);

  function openCustomerDisplay() {
    const w = window.open("/customer-display", "idineCustomerDisplay",
      "width=520,height=760,menubar=no,toolbar=no,location=no,status=no");
    customerWinRef.current = w;
    if (w) showToast("Customer display opened");
    else showToast("Popup blocked — allow popups for this site");
  }

  // ── Kitchen "done cooking" notification
  const [kitchenSeen, setKitchenSeen] = useState<Set<number>>(new Set());
  const [kitchenReady, setKitchenReady] = useState<any[]>([]);
  const chimeRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    const ready = orders.filter((o: any) => o.status === "ready");
    setKitchenReady(ready);
    const fresh = ready.filter((o: any) => !kitchenSeen.has(o.id));
    if (fresh.length > 0) {
      // chime
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = "sine"; osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
        osc.start(); osc.stop(ctx.currentTime + 0.5);
      } catch {}
      showToast(`Kitchen ready: ${fresh.map((o: any) => o.orderNumber).join(", ")}`);
      setKitchenSeen(prev => { const n = new Set(prev); fresh.forEach((o: any) => n.add(o.id)); return n; });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders]);

  // ── QR Orders polling (incoming customer orders from QR menu)
  const [qrOrdersSeen, setQrOrdersSeen] = useState<Set<number>>(new Set());
  const { data: qrOrdersData } = useQuery({
    queryKey: ["qr-orders-pending", branchId],
    enabled: !!branchId,
    queryFn: async () => {
      const r = await fetch(`/api/orders?branchId=${branchId}&source=qr&status=pending`);
      return r.json();
    },
    refetchInterval: 6000,
  });
  const pendingQROrders: any[] = (qrOrdersData as any)?.orders || [];
  useEffect(() => {
    const fresh = pendingQROrders.filter((o: any) => !qrOrdersSeen.has(o.id));
    if (fresh.length > 0) {
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        [0, 0.18].forEach(delay => {
          const osc = ctx.createOscillator(); const gain = ctx.createGain();
          osc.connect(gain); gain.connect(ctx.destination);
          osc.type = "sine"; osc.frequency.value = 660;
          gain.gain.setValueAtTime(0.001, ctx.currentTime + delay);
          gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + delay + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.35);
          osc.start(ctx.currentTime + delay); osc.stop(ctx.currentTime + delay + 0.4);
        });
      } catch {}
      showToast(`New QR order from Table ${fresh[0].tableId || "?"}!`);
      setQrOrdersSeen(prev => { const n = new Set(prev); fresh.forEach((o: any) => n.add(o.id)); return n; });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingQROrders]);

  // ── Logout
  function handleLogout() { clearUser(); navigate("/"); }

  // ── Fullscreen toggle
  function toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => showToast("Fullscreen not allowed"));
    else document.exitFullscreen();
  }

  // ── Print last invoice — open printable preview window
  function printLastInvoice() {
    const PRINTABLE = ["completed", "paid", "served", "confirmed"];
    const printable = orders
      .filter((o: any) => PRINTABLE.includes(o.status))
      .sort((a: any, b: any) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    const last = printable[0];
    if (!last) { showToast("No sale to print"); return; }
    openInvoicePreview(last.id);
  }
  function openInvoicePreview(orderId: number, mode: "invoice" | "bill" = "invoice") {
    setInvoicePreviewMode(mode);
    setInvoicePreviewId(orderId);
  }

  // ── Toolbar config (final order)
  const TOOLBAR = [
    { icon: Home,      title: "Home",              onClick: () => navigate("/home") },
    { icon: LogOut,    title: "Logout",            onClick: handleLogout },
    { icon: FolderOpen,title: "Draft Sale",        onClick: () => setShowDrafts(true) },
    { icon: Printer,   title: "Print Last Invoice",onClick: printLastInvoice },
    { icon: Receipt,   title: "Recent Sales",      onClick: () => setShowRecentSales(true) },
    { icon: RotateCcw, title: "Refund",            onClick: () => setShowRefund(true) },
    { icon: QrCode,    title: "QR Table Orders", onClick: () => setShowQROrders(true), badge: pendingQROrders.length },
    { icon: Bell,      title: "Kitchen Ready",     onClick: () => { if (kitchenReady.length) showToast(`Ready: ${kitchenReady.map((o:any)=>o.orderNumber).join(", ")}`); else showToast("No orders ready"); }, badge: kitchenReady.length },
    { icon: BookOpen,  title: "Register Summary",  onClick: () => setShowRegistry(true) },
    { icon: Monitor,   title: "Customer Display",  onClick: openCustomerDisplay },
    { icon: Maximize,  title: "Fullscreen",        onClick: toggleFullscreen },
  ];

  // ── Constants
  const TABS: { key: OrderType; label: string; icon: any }[] = [
    { key: "dine-in",   label: "Dine In",   icon: Grid3x3  },
    { key: "takeaway",  label: "Take Away", icon: ShoppingBag },
    { key: "delivery",  label: "Delivery",  icon: Truck },
  ];
  const FILTER_PILLS = [
    { key: "online", label: "Online",     color: "var(--color-success)" },
    { key: "veg",    label: "Vegetarian", color: "var(--color-success)" },
    { key: "bev",    label: "Beverage",   color: "var(--color-text-dim)" },
    { key: "combo",  label: "Combo",      color: "var(--color-gold)" },
    { key: "promo",  label: "Promo",      color: "var(--color-pink)" },
  ];

  // ── Render
  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: BG }}>

      {/* ===== TOP TOOLBAR ===== */}
      <div className="flex items-center h-10 px-2 border-b shrink-0" style={{ background: SURF, borderColor: BORD }}>
        {/* Icon strip */}
        <div className="flex items-center gap-0.5 shrink-0">
          {TOOLBAR.map((btn, i) => {
            const Icon = btn.icon;
            return (
              <button key={i} title={btn.title} onClick={btn.onClick}
                className="relative w-7 h-7 flex items-center justify-center rounded transition-colors"
                style={{ color: MUTED }}
                onMouseEnter={e => (e.currentTarget.style.background = SURF2)}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                <Icon size={15} />
                {!!btn.badge && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-0.5 flex items-center justify-center rounded-full text-[9px] font-bold"
                    style={{ background: "var(--color-danger)", color: "#fff" }}>{btn.badge}</span>
                )}
              </button>
            );
          })}
        </div>
        {/* Logo */}
        <div className="ml-3 flex items-center gap-2 shrink-0">
          <img src="/logo-icon.png" alt="iDine" style={{ width: 26, height: 26, borderRadius: 6, objectFit: "contain" }} />
          <span className="text-sm font-bold" style={{ color: GOLD }}>iDine POS</span>
        </div>
        {/* Toast — centered in the bar, between the logo and the filter pills */}
        <div className="flex-1 flex items-center justify-center min-w-0">
          {toast && <Toast msg={toast} onDone={() => setToast(null)} />}
        </div>
        {/* Filter pills pushed to right */}
        <div className="flex items-center gap-1.5 pr-1">
          {FILTER_PILLS.map(p => (
            <button key={p.key}
              onClick={() => setActiveFilter(activeFilter === p.key ? null : p.key)}
              className="px-3 py-1 rounded text-xs font-semibold transition-all"
              style={{
                background:  activeFilter === p.key ? p.color : p.color + "22",
                color:       activeFilter === p.key ? "#fff"  : p.color,
                border:      `1px solid ${p.color}`,
                opacity:     activeFilter && activeFilter !== p.key ? 0.5 : 1,
              }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ===== BODY ===== */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── LEFT: Running Orders ── */}
        <div className="w-56 flex flex-col border-r shrink-0" style={{ background: SURF, borderColor: BORD }}>
          <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: BORD }}>
            <span className="font-semibold text-sm" style={{ color: GOLD }}>Running Orders</span>
            <button onClick={() => qc.invalidateQueries({ queryKey: ["orders"] })} style={{ color: MUTED }}>
              <RefreshCw size={13} />
            </button>
          </div>
          <div className="px-2 py-1.5 border-b" style={{ borderColor: BORD }}>
            <input
              className="w-full px-2.5 py-1.5 rounded text-xs border focus:outline-none"
              style={{ background: SURF2, color: TEXT, borderColor: BORD }}
              placeholder="Order No, Customer, Mobile…"
              value={orderSearch} onChange={e => setOrderSearch(e.target.value)} />
          </div>

          {/* Order list */}
          <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
            {ordersLoading
              ? <div className="flex justify-center p-6"><Spinner /></div>
              : filteredOrders.length === 0
                ? <div className="text-center p-6 text-xs" style={{ color: DIM }}>No running orders</div>
                : filteredOrders.map((order: any) => (
                  <button key={order.id}
                    onClick={() => setSelectedOrderId(selectedOrderId === order.id ? null : order.id)}
                    onDoubleClick={() => setDetailsOrderId(order.id)}
                    className="w-full p-2 rounded text-left transition-all"
                    style={{
                      background:  selectedOrderId === order.id ? SURF2 : "transparent",
                      border:      `1px solid ${selectedOrderId === order.id ? GOLD : BORD}`,
                    }}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex items-center gap-1.5">
                        <span className="font-bold text-xs font-mono shrink-0" style={{ color: GOLD }}>{order.orderNumber}</span>
                        <span className="text-[10px] truncate" style={{ color: MUTED }}>
                          ({order.waiterName || order.placedBy || waiters.find((waiter: any) => waiter.id === order.waiterId)?.name || "Unassigned"})
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {order.source === "qr" && (
                          <span className="text-[9px] px-1 py-0.5 rounded font-bold text-white" style={{ background: "#8B5CF6" }}>QR</span>
                        )}
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold text-white"
                          style={{ background: order.type === "dine-in" ? "var(--color-success)" : order.type === "takeaway" ? "var(--color-gold)" : "var(--color-info)" }}>
                          {order.type === "dine-in" ? "Dine" : order.type === "takeaway" ? "Take" : "Deliv"}
                        </span>
                      </div>
                    </div>
                    <div className="text-xs mt-0.5 truncate" style={{ color: MUTED }}>{order.customerName}</div>
                    {order.tableId && <div className="text-[10px] mt-0.5" style={{ color: DIM }}>Table {order.tableId}</div>}
                  </button>
                ))
            }
          </div>

          {/* Action buttons */}
          <div className="p-2 space-y-1 border-t" style={{ borderColor: BORD }}>
            <Btn icon={Edit3}    label="Modify Order"
              onClick={() => selectedOrderId && loadOrderForEdit(selectedOrderId)} />
            <Btn icon={Info}     label="Order Details"
              onClick={() => selectedOrderId && setDetailsOrderId(selectedOrderId)} />
            <div className="relative">
              {showKotMenu && selectedOrderId && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowKotMenu(false)} />
                  <div className="absolute bottom-full left-0 mb-1.5 z-50 w-full rounded-lg border shadow-xl p-1.5 space-y-1"
                    style={{ background: SURF2, borderColor: BORD }}>
                    <button onClick={() => { reprintKOT.mutate({ orderId: selectedOrderId, mode: "all" }); setShowKotMenu(false); }}
                      className="w-full py-2 rounded text-xs font-semibold transition-all hover:brightness-110"
                      style={{ background: GOLD, color: "#000" }}>All Items</button>
                    <button onClick={() => { reprintKOT.mutate({ orderId: selectedOrderId, mode: "new" }); setShowKotMenu(false); }}
                      className="w-full py-2 rounded text-xs font-semibold transition-all hover:brightness-110"
                      style={{ background: "var(--color-success)", color: "#000" }}>New Items</button>
                    {/* pointer */}
                    <div className="absolute -bottom-1.5 left-6 w-3 h-3 rotate-45" style={{ background: SURF2, borderRight: `1px solid ${BORD}`, borderBottom: `1px solid ${BORD}` }} />
                  </div>
                </>
              )}
              <Btn icon={RotateCcw} label="Re-print KOT"
                onClick={() => { if (selectedOrderId) setShowKotMenu(v => !v); }} />
            </div>
            <div className="grid grid-cols-2 gap-1">
              <Btn icon={Receipt} label="Invoice"
                onClick={() => { if (selectedOrderId) { setFinalizeIsQuick(false); setFinalizeOrderId(selectedOrderId); } }} />
              <Btn icon={Printer} label="Bill"
                onClick={() => { if (selectedOrderId) { setInvoicePreviewMode("bill"); setInvoicePreviewId(selectedOrderId); } }} />
            </div>
            <Btn icon={Ban} label="Cancel Order" danger
              onClick={() => selectedOrderId && setCancelConfirmId(selectedOrderId)} />
          </div>
        </div>

        {/* ── CENTER: Order entry ── */}
        <div className="flex-1 flex flex-col min-w-0 border-r" style={{ borderColor: BORD }}>

          {/* Order type tabs */}
          <div className="flex border-b" style={{ borderColor: BORD }}>
            {TABS.map(t => {
              const Icon   = t.icon;
              const active = orderType === t.key;
              return (
                <button key={t.key} onClick={() => setOrderType(t.key)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium border-b-2 transition-all"
                  style={{
                    background:      active ? SURF2 : "transparent",
                    color:           active ? GOLD  : MUTED,
                    borderBottomColor: active ? GOLD : "transparent",
                  }}>
                  <Icon size={13} /> {t.label}
                </button>
              );
            })}
          </div>

          {/* Waiter + Customer + Table row */}
          <div className="flex items-center gap-2 p-2 border-b" style={{ borderColor: BORD }}>
            <select className="flex-1 px-2 py-1.5 rounded border text-xs focus:outline-none"
              style={{ background: SURF2, color: TEXT, borderColor: BORD }}
              value={selectedWaiterId || ""}
              onChange={e => {
                const id = e.target.value ? parseInt(e.target.value) : null;
                setSelectedWaiterId(id);
                setSelectedWaiterName(waiters.find((w: any) => w.id === id)?.name ?? null);
              }}>
              <option value="">Waiter</option>
              {waiters.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <CustomerPicker
              branchId={branchId!}
              customerId={customerId}
              customerName={customerName}
              onChange={(id, name) => { setCustomerId(id); setCustomerName(name); }} />
            {orderType === "dine-in" && (
              <select className="px-2 py-1.5 rounded border text-xs focus:outline-none"
                style={{ background: SURF2, color: TEXT, borderColor: BORD, minWidth: "70px" }}
                value={selectedTableId || ""}
                onChange={e => setSelectedTableId(e.target.value ? parseInt(e.target.value) : null)}>
                <option value="">Table</option>
                {tables.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}
          </div>

          {/* Cart */}
          <div className="flex-1 overflow-y-auto">
            {cartItems.length === 0
              ? <div className="flex flex-col items-center justify-center h-full gap-2" style={{ color: DIM }}>
                  <UtensilsCrossed size={38} strokeWidth={1} />
                  <p className="text-sm">Select items from the menu</p>
                </div>
              : <table className="w-full text-sm">
                  <thead className="sticky top-0" style={{ background: SURF }}>
                    <tr style={{ color: MUTED }} className="text-xs font-semibold">
                      <th className="text-left px-3 py-2">Item</th>
                      <th className="text-right px-2 py-2">Price</th>
                      <th className="text-center px-2 py-2">Qty</th>
                      <th className="text-center px-2 py-2">Discount</th>
                      <th className="text-right px-2 py-2">Total</th>
                      <th className="px-2 py-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {cartItems.map((item) => (
                      <tr key={item.cartKey} className="border-t animate-fade-up" style={{ borderColor: BORD }}>
                        <td className="px-3 py-2">
                          <div className="text-xs font-medium" style={{ color: TEXT }}>{item.name}</div>
                          {/* Modifiers */}
                          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                            {item.modifiers.map(m => (
                              <span key={m.id} className="text-[10px] px-1.5 py-0.5 rounded"
                                style={{ background: SURF2, color: MUTED }}>
                                {m.name}{m.price > 0 ? ` +${m.price.toFixed(2)}` : ""}
                              </span>
                            ))}
                            <button onClick={() => setModPickerItemId(item.cartKey)}
                              className="text-[10px] px-1.5 py-0.5 rounded border transition-colors hover:brightness-110"
                              style={{ borderColor: BORD, color: DIM }}>
                              <SlidersHorizontal size={9} className="inline mr-0.5" />
                              Mod
                            </button>
                            <button onClick={() => { setNotePickerItemId(item.cartKey); setNoteDraft(item.note || ""); }}
                              className="text-[10px] px-1.5 py-0.5 rounded border transition-colors hover:brightness-110"
                              style={{ borderColor: item.note ? GOLD : BORD, color: item.note ? GOLD : DIM }}>
                              <FileText size={9} className="inline mr-0.5" />
                              Note
                            </button>
                          </div>
                          {item.note && (
                            <div className="text-[10px] mt-0.5 italic" style={{ color: GOLD }}>
                              "{item.note}"
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-2 text-xs text-right font-mono" style={{ color: MUTED }}>{item.price.toFixed(2)}</td>
                        <td className="px-2 py-2">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => changeQty(item.cartKey, -1)}
                              className="w-5 h-5 flex items-center justify-center rounded border transition-colors"
                              style={{ borderColor: BORD, color: TEXT }}><Minus size={9} /></button>
                            <span className="w-5 text-center text-xs font-bold" style={{ color: TEXT }}>{item.qty}</span>
                            <button onClick={() => changeQty(item.cartKey, 1)}
                              className="w-5 h-5 flex items-center justify-center rounded transition-colors"
                              style={{ background: GOLD, color: "var(--color-surface)" }}><Plus size={9} /></button>
                          </div>
                        </td>
                        <td className="px-2 py-2">
                          <input type="number" placeholder="0" value={item.discount || ""}
                            onChange={e => setDiscount(item.cartKey, parseFloat(e.target.value))}
                            className="w-14 px-1.5 py-1 rounded border text-xs text-center focus:outline-none"
                            style={{ background: SURF2, borderColor: BORD, color: TEXT }} />
                        </td>
                        <td className="px-2 py-2 text-xs text-right font-mono font-bold" style={{ color: GOLD }}>
                          {itemTotal(item).toFixed(2)}
                        </td>
                        <td className="px-2 py-2">
                          <button onClick={() => removeItem(item.cartKey)}
                            className="w-5 h-5 flex items-center justify-center rounded-full text-white"
                            style={{ background: "var(--color-danger)" }}><X size={10} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
            }
          </div>

          {/* Total payable (no Calendar/Eye icons) */}
          <div className="flex items-center px-3 py-2.5 border-t" style={{ background: SURF, borderColor: BORD }}>
            <span className="ml-auto font-bold text-base" style={{ color: TEXT }}>
              Total Payable: <span style={{ color: GOLD }}>{total.toFixed(2)}</span>
            </span>
          </div>

          {/* Bottom action row */}
          <div className="flex">
            <button onClick={resetOrder}
              className="flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-semibold text-white transition-all hover:brightness-110"
              style={{ background: "var(--color-danger)", filter: "brightness(0.8)" }}>
              <X size={14} /> Cancel
            </button>
            <button onClick={() => placeOrder.mutate("draft")} disabled={cartItems.length === 0 || placeOrder.isPending}
              className="flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:opacity-40"
              style={{ background: "var(--color-purple)", filter: "brightness(0.8)" }}>
              <FileText size={14} /> Draft
            </button>
            <button onClick={() => placeOrder.mutate("quick-invoice")} disabled={cartItems.length === 0 || placeOrder.isPending}
              className="flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:opacity-40"
              style={{ background: "var(--color-info)", filter: "brightness(0.8)" }}>
              {placeOrder.isPending ? <Spinner size={14} /> : <><Receipt size={14} /> Quick Invoice</>}
            </button>
            <button onClick={() => placeOrder.mutate("confirmed")} disabled={cartItems.length === 0 || placeOrder.isPending}
              className="flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:opacity-40"
              style={{ background: "var(--color-success)", filter: "brightness(0.8)" }}>
              {placeOrder.isPending
                ? <Spinner size={14} />
                : <><UtensilsCrossed size={14} /> {modifyOrderId ? "Update Order" : "Place Order"}</>}
            </button>
          </div>
        </div>

        {/* ── RIGHT: Menu ── */}
        <div className="flex-1 flex flex-col min-w-0" style={{ background: BG }}>
          {/* Search */}
          <div className="p-2 border-b" style={{ borderColor: BORD }}>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: DIM }} />
                <input className="w-full pl-8 pr-3 py-2 rounded border text-xs focus:outline-none"
                  style={{ background: SURF2, color: TEXT, borderColor: BORD }}
                  placeholder="Name or Code or Category…"
                  value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
              </div>
              <button
                onClick={() => { setQaError(null); setQaForm({ name: "", code: "", categoryId: "", priceDineIn: "", priceTakeaway: "", priceDelivery: "", isVeg: false, isBeverage: false }); setShowQuickAddItem(true); }}
                title="Quick Add Item"
                className="flex items-center justify-center w-8 h-8 rounded border shrink-0 transition-all hover:brightness-125"
                style={{ background: SURF2, borderColor: GOLD, color: GOLD }}>
                <Plus size={14} />
              </button>
            </div>
          </div>

          <div className="flex flex-1 overflow-hidden">
            {/* Category column */}
            <div className="w-44 shrink-0 overflow-y-auto border-r py-1" style={{ borderColor: BORD, background: SURF }}>
              {[{ id: null, name: "All" }, ...categories].map((cat: any, idx: number) => {
                const active = categoryId === cat.id;
                const isAll  = cat.id === null;
                return (
                  <div key={cat.id ?? "all"}>
                    {!isAll && idx > 1 && (
                      <div className="mx-3 my-0.5 border-t" style={{ borderColor: BORD }} />
                    )}
                    <button onClick={() => setCategoryId(cat.id)}
                      className="w-full px-3 py-2 text-left text-sm transition-colors"
                      style={{
                        background:  active ? SURF2 : "transparent",
                        color:       active ? GOLD  : MUTED,
                        fontWeight:  active ? 600   : 400,
                        borderLeft:  active ? `3px solid ${GOLD}` : "3px solid transparent",
                      }}>
                      {cat.name}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Menu grid */}
            <div className="flex-1 overflow-y-auto p-2">
              {menuItems.length === 0
                ? <div className="flex flex-col items-center justify-center py-16 gap-2" style={{ color: DIM }}>
                    <Camera size={36} strokeWidth={1} />
                    <p className="text-xs">No items found</p>
                  </div>
                : <div className="grid grid-cols-3 gap-2">
                    {menuItems.map((item: any) => {
                      const inCart = cartItems.find(i => i.menuItemId === item.id);
                      return (
                        <button key={item.id} onClick={() => addToCart(item)}
                          className="rounded-xl border overflow-hidden text-left transition-all hover:brightness-110 hover:-translate-y-0.5"
                          style={{
                            background:  SURF2,
                            borderColor: inCart ? GOLD : BORD,
                            boxShadow:   inCart ? `0 0 0 2px ${GOLD}44` : "none",
                          }}>
                          <div className="w-full aspect-[4/3] flex items-center justify-center relative"
                            style={{ background: SURF }}>
                            {item.imageUrl
                              ? <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                              : <Camera size={32} strokeWidth={1} style={{ color: DIM }} />}
                            {inCart && (
                              <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                                style={{ background: GOLD, color: "var(--color-surface)" }}>
                                {inCart.qty}
                              </span>
                            )}
                          </div>
                          <div className="px-2 py-1.5">
                            <div className="text-sm font-semibold truncate" style={{ color: TEXT }}>{item.name}</div>
                            <div className="text-sm font-bold font-mono mt-0.5" style={{ color: GOLD }}>{item.price.toFixed(2)}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
              }
            </div>
          </div>
        </div>

      </div>

      {/* ── MODALS ── */}

      {/* Variation picker */}
      {/* Variation picker — redesigned: item preview header + aligned grid of variation cards */}
      {varPickerItem && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.75)" }}>
          <div className="w-[480px] rounded-2xl border overflow-hidden" style={{ background: SURF, borderColor: BORD }}>
            {/* Header with item preview */}
            <div className="flex items-center gap-3 px-5 py-4 border-b" style={{ borderColor: BORD, background: SURF2 }}>
              <div className="w-12 h-12 rounded-xl overflow-hidden flex items-center justify-center shrink-0" style={{ background: BG }}>
                {varPickerItem.imageUrl
                  ? <img src={varPickerItem.imageUrl} alt={varPickerItem.name} className="w-full h-full object-cover" />
                  : <Camera size={20} strokeWidth={1} style={{ color: DIM }} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm truncate" style={{ color: TEXT }}>{varPickerItem.name}</div>
                <div className="text-xs mt-0.5" style={{ color: DIM }}>
                  Choose a variation · {varPickerItem.variations.length} option{varPickerItem.variations.length !== 1 ? "s" : ""}
                </div>
              </div>
              <button onClick={() => setVarPickerItem(null)}
                className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors hover:brightness-125"
                style={{ color: DIM, background: BG }}><X size={15} /></button>
            </div>

            {/* Variation grid */}
            <div className="p-4 max-h-[65vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-2.5">
                {varPickerItem.variations.map((v: any) => {
                  const price = orderType === "dine-in" ? v.priceDineIn : orderType === "takeaway" ? v.priceTakeaway : v.priceDelivery;
                  return (
                    <button key={v.id}
                      onClick={() => { addToCart(varPickerItem, v); setVarPickerItem(null); }}
                      className="flex flex-col rounded-xl border text-left transition-all hover:-translate-y-0.5"
                      style={{ background: BG, borderColor: BORD, padding: "12px 14px" }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = GOLD)}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = BORD)}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold truncate" style={{ color: TEXT }}>{v.name}</span>
                        <Plus size={13} style={{ color: GOLD }} />
                      </div>
                      <div className="flex items-baseline justify-between mt-2">
                        <span className="text-[10px] uppercase tracking-wide" style={{ color: DIM }}>
                          {orderType === "dine-in" ? "Dine In" : orderType === "takeaway" ? "Takeaway" : "Delivery"}
                        </span>
                        <span className="text-base font-bold font-mono" style={{ color: GOLD }}>{Number(price).toFixed(2)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modifier picker */}
      {modPickerItemId !== null && (() => {
        const item = cartItems.find(i => i.cartKey === modPickerItemId);
        if (!item) return null;
        return (
          <ModifierPicker
            branchId={branchId!}
            selected={item.modifiers}
            onChange={mods => setItemModifiers(modPickerItemId, mods)}
            onClose={() => setModPickerItemId(null)} />
        );
      })()}

      {/* Kitchen note picker — per cart item, prints only on the KOT */}
      {notePickerItemId !== null && (() => {
        const item = cartItems.find(i => i.cartKey === notePickerItemId);
        if (!item) return null;
        return (
          <div className="fixed inset-0 z-[999] flex items-center justify-center" style={{ background: "#00000099" }}>
            <div className="w-80 rounded-xl border shadow-2xl p-4" style={{ background: SURF, borderColor: BORD }}>
              <div className="font-bold text-sm mb-1" style={{ color: TEXT }}>Note for Kitchen</div>
              <div className="text-xs mb-3" style={{ color: MUTED }}>{item.name} — prints on the KOT only</div>
              <textarea value={noteDraft} onChange={e => setNoteDraft(e.target.value)}
                placeholder='e.g. "Low spicy", "No onion"' rows={3}
                className="w-full px-3 py-2 text-sm rounded-lg border bg-transparent outline-none resize-none"
                style={{ background: BG, borderColor: BORD, color: TEXT }} />
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => setNotePickerItemId(null)}
                  className="px-4 py-2 rounded-lg text-xs" style={{ background: BORD, color: MUTED }}>Cancel</button>
                <button onClick={() => { setItemNote(notePickerItemId, noteDraft); setNotePickerItemId(null); }}
                  className="px-4 py-2 rounded-lg text-xs font-semibold"
                  style={{ background: GOLD, color: "var(--color-surface)" }}>Save</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Order Details modal */}
      {detailsOrderId && modalOrder.id && (
        <OrderDetailsModal
          order={{ ...modalOrder, waiterName: modalWaiterName }} items={modalItems}
          onClose={() => setDetailsOrderId(null)}
          onCreateInvoice={() => { setDetailsOrderId(null); setFinalizeIsQuick(false); setFinalizeOrderId(detailsOrderId); }}
          onPrintBill={() => { setDetailsOrderId(null); setInvoicePreviewMode("bill"); setInvoicePreviewId(detailsOrderId); }} />
      )}

      {/* ── Toolbar modals ── */}
      {showDrafts && (
        <DraftSalesModal branchId={branchId!} onClose={() => setShowDrafts(false)}
          onLoad={(id) => loadOrderForEdit(id)} />
      )}
      {showRefund && (
        <RefundModal branchId={branchId!} onClose={() => setShowRefund(false)} />
      )}

      {invoicePreviewId && (
        <InvoiceOverlay orderId={invoicePreviewId} mode={invoicePreviewMode} onClose={() => setInvoicePreviewId(null)} />
      )}

      {showRecentSales && (
        <RecentSalesModal branchId={branchId!} onClose={() => setShowRecentSales(false)}
          onView={(id) => { setShowRecentSales(false); setDetailsOrderId(id); }}
          onReprint={(id) => openInvoicePreview(id)} />
      )}
      {showQROrders && (
        <QROrdersModal branchId={branchId!} onClose={() => setShowQROrders(false)} />
      )}
      {showSelfOrderQR && (
        <SelfOrderQRModal branchId={branchId!} onClose={() => setShowSelfOrderQR(false)} />
      )}
      {showRegistry && (
        <RegistryModal branchId={branchId!} onClose={() => setShowRegistry(false)} />
      )}

      {/* Finalize Sale modal — for Invoice (running order) and Quick Invoice */}
      {finalizeOrderId && (finalizeLoading || finalizeOrder.id) && (
        <FinalizeModal
          order={finalizeOrder}
          items={finalizeItems}
          loading={finalizeLoading}
          onClose={() => { setFinalizeOrderId(null); setFinalizeIsQuick(false); }}
          onSubmit={async (_payments, summary) => {
            const completedId = finalizeOrderId!;
            // Save payment data + mark completed
            await fetch(`/api/orders/${completedId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                status: "completed",
                subtotal: summary.subtotal,
                discount: summary.discount,
                serviceCharge: summary.serviceCharge,
                total: summary.total,
                paymentMethod: summary.paymentMethod,
                amountPaid: summary.amountPaid,
                cashGiven: summary.cashGiven,
                balance: summary.balance,
                paymentsJson: JSON.stringify(_payments),
              }),
            });
            qc.invalidateQueries({ queryKey: ["orders"] });
            setFinalizeOrderId(null);
            setFinalizeIsQuick(false);
            showToast("Payment recorded. Sale finalized!");
            setInvoicePreviewMode("invoice");
            setInvoicePreviewId(completedId);
          }}
        />
      )}

      {/* Cancel confirmation */}
      {cancelConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "#00000099" }}>
          <div className="rounded-xl border shadow-2xl p-5 w-72" style={{ background: SURF, borderColor: BORD }}>
            <div className="font-bold text-sm mb-2" style={{ color: TEXT }}>Cancel Order?</div>
            <div className="text-xs mb-4" style={{ color: MUTED }}>
              This will cancel the selected order. This action cannot be undone.
            </div>
            <div className="flex gap-2">
              <button onClick={() => setCancelConfirmId(null)}
                className="flex-1 py-2 rounded border text-xs" style={{ borderColor: BORD, color: MUTED }}>Keep</button>
              <button
                onClick={() => updateOrderStatus.mutate({ id: cancelConfirmId, status: "cancelled" })}
                disabled={updateOrderStatus.isPending}
                className="flex-1 py-2 rounded text-xs font-semibold disabled:opacity-40"
                style={{ background: "var(--color-danger)", color: "#fff" }}>
                {updateOrderStatus.isPending ? <Spinner size={12} /> : "Cancel Order"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Print KOT preview — auto-print is suspended; shows items, Print opens the native browser print dialog */}
      {pendingKot && (
        <KotOverlay
          kot={pendingKot}
          onClose={() => setPendingKot(null)}
          onPrinted={() => {
            if (pendingKot.itemIds?.length > 0) markKotPrinted.mutate(pendingKot.itemIds);
            showToast("KOT sent to print.");
            setPendingKot(null);
          }}
        />
      )}

      {/* Order updated (modify mode) — ask whether to print full KOT or only the changes */}
      {pendingKotChoice && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center" style={{ background: "#00000099" }}>
          <div className="rounded-xl border shadow-2xl p-5 w-80" style={{ background: SURF, borderColor: BORD }}>
            <div className="font-bold text-sm mb-2" style={{ color: TEXT }}>Order Updated</div>
            <div className="text-xs mb-4" style={{ color: MUTED }}>
              Do you want to print the updated items only, or reprint the full KOT?
            </div>
            {(pendingKotChoice.addedItems.length === 0 && pendingKotChoice.reducedItems.length === 0) ? (
              <div className="flex flex-col gap-2">
                <div className="text-xs mb-1" style={{ color: DIM }}>No item changes detected.</div>
                <button onClick={() => setPendingKotChoice(null)}
                  className="py-2 rounded text-xs font-semibold" style={{ background: BORD, color: TEXT }}>Close</button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => {
                    setPendingKot({ ...pendingKotChoice, items: pendingKotChoice.allItems });
                    setPendingKotChoice(null);
                  }}
                  className="py-2.5 rounded text-xs font-bold border"
                  style={{ borderColor: BORD, background: BORD, color: TEXT }}>
                  All Items (full reprint)
                </button>
                <button
                  onClick={() => {
                    const items = [
                      ...pendingKotChoice.addedItems.map((i: any) => ({ ...i, modifiers: [], cancelled: false })),
                      ...pendingKotChoice.reducedItems.map((i: any) => ({ ...i, modifiers: [], cancelled: true })),
                    ];
                    setPendingKot({ ...pendingKotChoice, items });
                    setPendingKotChoice(null);
                  }}
                  className="py-2.5 rounded text-xs font-bold"
                  style={{ background: GOLD, color: "var(--color-surface)" }}>
                  Updated Items Only
                </button>
                <button onClick={() => setPendingKotChoice(null)}
                  className="py-2 rounded text-xs" style={{ color: MUTED }}>Skip Printing</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Quick Add Item Modal */}
      {showQuickAddItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.75)" }}>
          <div className="w-96 rounded-2xl border shadow-2xl flex flex-col" style={{ background: SURF, borderColor: BORD }}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: BORD }}>
              <div className="flex items-center gap-2">
                <Plus size={14} style={{ color: GOLD }} />
                <span className="font-bold text-sm" style={{ color: TEXT }}>Quick Add Item</span>
              </div>
              <button onClick={() => setShowQuickAddItem(false)} style={{ color: MUTED }}><X size={15} /></button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-3 overflow-y-auto max-h-[70vh]">
              {/* Name */}
              <div>
                <label className="block text-xs mb-1 font-medium" style={{ color: MUTED }}>Name <span style={{ color: "var(--color-danger)" }}>*</span></label>
                <input
                  className="w-full px-3 py-2 rounded border text-xs focus:outline-none"
                  style={{ background: "var(--color-bg)", color: TEXT, borderColor: BORD }}
                  placeholder="e.g. Chicken Burger"
                  value={qaForm.name}
                  onChange={e => setQaForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>

              {/* Code */}
              <div>
                <label className="block text-xs mb-1 font-medium" style={{ color: MUTED }}>Item Code</label>
                <input
                  className="w-full px-3 py-2 rounded border text-xs focus:outline-none"
                  style={{ background: "var(--color-bg)", color: TEXT, borderColor: BORD }}
                  placeholder="e.g. CB01 (optional)"
                  value={qaForm.code}
                  onChange={e => setQaForm(f => ({ ...f, code: e.target.value }))}
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-xs mb-1 font-medium" style={{ color: MUTED }}>Category</label>
                <select
                  className="w-full px-3 py-2 rounded border text-xs focus:outline-none"
                  style={{ background: "var(--color-bg)", color: TEXT, borderColor: BORD }}
                  value={qaForm.categoryId}
                  onChange={e => setQaForm(f => ({ ...f, categoryId: e.target.value }))}
                >
                  <option value="">— None —</option>
                  {categories.map((c: any) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Prices */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Dine-In Price", key: "priceDineIn" as const, required: true },
                  { label: "Takeaway", key: "priceTakeaway" as const },
                  { label: "Delivery", key: "priceDelivery" as const },
                ].map(({ label, key, required }) => (
                  <div key={key}>
                    <label className="block text-xs mb-1 font-medium" style={{ color: MUTED }}>
                      {label}{required && <span style={{ color: "var(--color-danger)" }}> *</span>}
                    </label>
                    <input
                      type="number" min="0" step="0.01"
                      className="w-full px-2 py-2 rounded border text-xs focus:outline-none"
                      style={{ background: "var(--color-bg)", color: TEXT, borderColor: BORD }}
                      placeholder="0.00"
                      value={qaForm[key]}
                      onChange={e => setQaForm(f => ({ ...f, [key]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>

              {/* Toggles */}
              <div className="flex gap-3">
                {[
                  { label: "Vegetarian", key: "isVeg" as const },
                  { label: "Beverage", key: "isBeverage" as const },
                ].map(({ label, key }) => (
                  <button
                    key={key}
                    onClick={() => setQaForm(f => ({ ...f, [key]: !f[key] }))}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs font-medium transition-all"
                    style={{
                      borderColor: qaForm[key] ? GOLD : BORD,
                      background: qaForm[key] ? GOLD + "18" : "transparent",
                      color: qaForm[key] ? GOLD : MUTED,
                    }}
                  >
                    <div className="w-3 h-3 rounded-sm border flex items-center justify-center"
                      style={{ borderColor: qaForm[key] ? GOLD : BORD, background: qaForm[key] ? GOLD : "transparent" }}>
                      {qaForm[key] && <span className="text-[8px] font-bold" style={{ color: "var(--color-bg)" }}>✓</span>}
                    </div>
                    {label}
                  </button>
                ))}
              </div>

              {qaError && (
                <div className="text-xs px-3 py-2 rounded border" style={{ color: "#F87171", borderColor: "var(--color-danger)44", background: "var(--color-danger)11" }}>
                  {qaError}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="grid grid-cols-2 border-t" style={{ borderColor: BORD }}>
              <button
                onClick={() => setShowQuickAddItem(false)}
                className="py-3 text-xs font-semibold"
                style={{ color: MUTED }}>
                Cancel
              </button>
              <button
                onClick={() => quickAddItem.mutate()}
                disabled={quickAddItem.isPending}
                className="py-3 text-xs font-semibold disabled:opacity-50"
                style={{ background: GOLD, color: "var(--color-bg)" }}>
                {quickAddItem.isPending ? "Adding…" : "Add Item"}
              </button>
            </div>
          </div>
        </div>
      )}


    </div>
  );
}
