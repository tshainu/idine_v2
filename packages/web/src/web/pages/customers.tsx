import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { getBranchId } from "../lib/store";
import { MONTHS, daysInMonth, monthDayOf, fmtDayMonth } from "../lib/daymonth";
import { Sidebar } from "../components/layout/sidebar";
import {
  Plus, Pencil, Trash2, Search, Phone, User, Star, MapPin, Calendar,
  MessageSquare, BarChart3, X, Cake, Gift, Baby, Award, Send, Tag as TagIcon,
  CheckCircle2, XCircle, MinusCircle,
} from "lucide-react";

const GOLD = "var(--color-gold)";
const BG = "var(--color-bg)";
const SURF = "var(--color-surface)";
const BORD = "var(--color-border)";
const MUTED = "var(--color-text-muted)";
const DIM = "var(--color-text-dim)";
const TEXT = "var(--color-text)";

function qualityScore(orderCnt: number, spent: number, createdAt: string | null): number {
  if (orderCnt === 0) return 3; // new customers default to 3
  const base = Math.min(5, orderCnt * 0.5);
  const spendScore = Math.min(3, spent / 5000);
  // regularity bonus: orders per month
  let regularityBonus = 0;
  if (createdAt) {
    const months = Math.max(1, (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24 * 30));
    const opm = orderCnt / months;
    regularityBonus = Math.min(2, opm * 0.5);
  }
  return Math.min(10, parseFloat((base + spendScore + regularityBonus).toFixed(1)));
}

function scoreColor(score: number) {
  if (score >= 8) return "var(--color-success)";
  if (score >= 5) return "var(--color-gold)";
  return "var(--color-danger)";
}

export default function CustomersPage() {
  const branchId = getBranchId();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  // Mini dashboard + private SMS panels, both keyed on the selected customer.
  const [dashFor, setDashFor] = useState<any>(null);
  const [smsFor, setSmsFor] = useState<any>(null);

  const { data: customersData, isLoading } = useQuery({
    queryKey: ["customers", branchId],
    queryFn: async () => (await api.customers.$get({ query: { branchId: String(branchId) } })).json(),
    refetchInterval: 30000,
  });

  const { data: ordersData } = useQuery({
    queryKey: ["sales-orders", branchId],
    queryFn: async () => (await api.orders.$get({ query: { branchId: String(branchId) } })).json(),
  });

  const customers: any[] = (customersData as any)?.customers || [];
  const orders: any[] = (ordersData as any)?.orders || [];

  const filtered = customers.filter(c =>
    !search ||
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.phone || "").includes(search) ||
    (c.address || "").toLowerCase().includes(search.toLowerCase())
  );

  function orderCount(customerId: number) {
    return orders.filter(o => o.customerId === customerId).length;
  }
  function totalSpent(customerId: number) {
    return orders.filter(o => o.customerId === customerId).reduce((s, o) => s + (Number(o.total) || 0), 0);
  }
  function ordersPerMonth(customerId: number, createdAt: string | null): string {
    const cnt = orderCount(customerId);
    if (!createdAt || cnt === 0) return "—";
    const months = Math.max(1, (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24 * 30));
    return (cnt / months).toFixed(1) + "/mo";
  }

  const createCustomer = useMutation({
    mutationFn: async (data: any) => (await api.customers.$post({ json: { ...data, branchId } })).json(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["customers"] }); resetForm(); },
  });
  const updateCustomer = useMutation({
    mutationFn: async ({ id, data }: any) => (await api.customers[":id"].$patch({ param: { id: String(id) }, json: data })).json(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["customers"] }); resetForm(); },
  });
  const deleteCustomer = useMutation({
    mutationFn: async (id: number) => (await api.customers[":id"].$delete({ param: { id: String(id) } })).json(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customers"] }),
  });

  function resetForm() { setShowForm(false); setEditItem(null); setForm({}); }
  function openEdit(c: any) {
    setEditItem(c);
    setForm({
      name: c.name, phone: c.phone || "", address: c.address || "",
      email: c.email || "", gender: c.gender || "", dob: c.dob || "",
      weddingAnniversary: c.weddingAnniversary || "",
      child1Name: c.child1Name || "", child1Dob: c.child1Dob || "",
      child2Name: c.child2Name || "", child2Dob: c.child2Dob || "",
      child3Name: c.child3Name || "", child3Dob: c.child3Dob || "",
      loyaltyPoints: c.loyaltyPoints ?? 0,
      notes: c.notes || "", tags: c.tags || "",
      smsOptOut: Boolean(c.smsOptOut), autoWishes: c.autoWishes !== false,
    });
    setShowForm(true);
  }
  function handleSubmit() {
    if (!form.name?.trim()) return;
    const str = (v: any) => (String(v ?? "").trim() || null);
    const data = {
      name: form.name.trim(),
      phone: str(form.phone),
      address: str(form.address),
      email: str(form.email),
      gender: str(form.gender),
      dob: str(form.dob),
      weddingAnniversary: str(form.weddingAnniversary),
      child1Name: str(form.child1Name), child1Dob: str(form.child1Dob),
      child2Name: str(form.child2Name), child2Dob: str(form.child2Dob),
      child3Name: str(form.child3Name), child3Dob: str(form.child3Dob),
      loyaltyPoints: Number(form.loyaltyPoints) || 0,
      notes: str(form.notes),
      // Normalise groups to lowercase, comma separated, de-duped.
      tags: form.tags
        ? [...new Set(String(form.tags).split(",").map((t: string) => t.trim().toLowerCase()).filter(Boolean))].join(",")
        : null,
      smsOptOut: Boolean(form.smsOptOut),
      autoWishes: form.autoWishes !== false,
    };
    if (editItem) updateCustomer.mutate({ id: editItem.id, data });
    else createCustomer.mutate(data);
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: BG }}>
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="h-14 flex items-center justify-between px-6 border-b shrink-0" style={{ background: SURF, borderColor: BORD }}>
          <div className="font-bold text-base" style={{ color: TEXT }}>Customers</div>
          <button onClick={() => { resetForm(); setShowForm(true); }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold"
            style={{ background: GOLD, color: "var(--color-surface)" }}>
            <Plus size={13} />
            Add Customer
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Stats */}
          <div className="flex gap-3 flex-wrap">
            {[
              { label: "Total Customers", value: customers.length, color: GOLD },
              { label: "This Month", value: customers.filter(c => {
                if (!c.createdAt) return false;
                const d = new Date(c.createdAt);
                const now = new Date();
                return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
              }).length, color: "var(--color-success)" },
              { label: "Regulars (≥5 orders)", value: customers.filter(c => orderCount(c.id) >= 5).length, color: "var(--color-purple-light)" },
            ].map(s => (
              <div key={s.label} className="px-4 py-2.5 rounded-xl border" style={{ background: SURF, borderColor: BORD }}>
                <span className="text-base font-bold" style={{ color: s.color }}>{s.value}</span>
                <span className="text-xs ml-2" style={{ color: MUTED }}>{s.label}</span>
              </div>
            ))}
          </div>

          {/* Search */}
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: DIM }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, phone or address..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border bg-transparent outline-none"
              style={{ background: SURF, borderColor: BORD, color: TEXT }} />
          </div>

          {/* Table */}
          <div className="rounded-2xl border overflow-hidden" style={{ background: SURF, borderColor: BORD }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: `1px solid ${BORD}` }}>
                  {["Customer", "Phone", "Address", "Orders", "Total Spent", "Regularity", "Quality", "Since", "Actions"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold" style={{ color: DIM }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={9} className="text-center py-10 text-xs" style={{ color: DIM }}>Loading...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-10" style={{ color: DIM }}>
                    <User size={32} className="mx-auto mb-2 opacity-30" />
                    <p className="text-xs">No customers found</p>
                  </td></tr>
                ) : filtered.map((c: any) => {
                  const cnt = orderCount(c.id);
                  const spent = totalSpent(c.id);
                  const score = qualityScore(cnt, spent, c.createdAt);
                  const color = scoreColor(score);
                  return (
                    <tr key={c.id} className="border-t" style={{ borderColor: BORD }}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                            style={{ background: "rgba(245,166,35,0.2)", color: GOLD }}>
                            {c.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-xs font-medium" style={{ color: TEXT }}>{c.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: MUTED }}>
                        {c.phone ? (
                          <span className="flex items-center gap-1"><Phone size={11} />{c.phone}</span>
                        ) : <span style={{ color: DIM }}>—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: MUTED, maxWidth: 140 }}>
                        {c.address ? (
                          <span className="flex items-center gap-1 truncate" title={c.address}>
                            <MapPin size={11} className="shrink-0" />{c.address}
                          </span>
                        ) : <span style={{ color: DIM }}>—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: "rgba(245,166,35,0.15)", color: GOLD }}>
                          {cnt}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold" style={{ color: "var(--color-success)" }}>
                        LKR {spent.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: MUTED }}>
                        {ordersPerMonth(c.id, c.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <Star size={11} color={color} fill={color} />
                          <span className="text-xs font-bold" style={{ color }}>{score}/10</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: DIM }}>
                        {c.createdAt ? (
                          <span className="flex items-center gap-1">
                            <Calendar size={11} />
                            {new Date(c.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" })}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button onClick={() => setDashFor(c)} className="p-1 rounded" title="View dashboard"
                            style={{ color: "var(--color-purple-light)" }}>
                            <BarChart3 size={13} />
                          </button>
                          <button onClick={() => setSmsFor(c)} className="p-1 rounded" title="Send a private SMS"
                            style={{ color: c.smsOptOut ? DIM : "var(--color-success)" }}>
                            <MessageSquare size={13} />
                          </button>
                          <button onClick={() => openEdit(c)} className="p-1 rounded" title="Edit" style={{ color: GOLD }}>
                            <Pencil size={13} />
                          </button>
                          <button onClick={() => { if (confirm(`Delete ${c.name}?`)) deleteCustomer.mutate(c.id); }} className="p-1 rounded" title="Delete" style={{ color: "var(--color-danger)" }}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: "rgba(0,0,0,0.7)" }}>
          <div className="w-full max-w-2xl max-h-full overflow-auto rounded-2xl p-6 border" style={{ background: SURF, borderColor: BORD }}>
            <div className="font-bold text-sm mb-4" style={{ color: TEXT }}>{editItem ? "Edit Customer" : "Add Customer"}</div>

            <div className="grid grid-cols-2 gap-3">
              <Fld label="Name *">
                <input value={form.name || ""} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  style={cinp} placeholder="Customer name" />
              </Fld>
              <Fld label="Phone">
                <input value={form.phone || ""} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                  style={cinp} placeholder="07X XXX XXXX" />
              </Fld>
              <Fld label="Email">
                <input value={form.email || ""} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                  style={cinp} placeholder="name@example.com" />
              </Fld>
              <Fld label="Gender">
                <select value={form.gender || ""} onChange={e => setForm(p => ({ ...p, gender: e.target.value }))} style={cinp}>
                  <option value="">Not specified</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </Fld>
              <Fld label="Date of birth (day & month)">
                <DayMonth value={form.dob} onChange={v => setForm(p => ({ ...p, dob: v }))} />
              </Fld>
              <Fld label="Wedding anniversary (day & month)">
                <DayMonth value={form.weddingAnniversary}
                  onChange={v => setForm(p => ({ ...p, weddingAnniversary: v }))} />
              </Fld>
            </div>

            {/* Children — drives the children's-birthday automation */}
            <div className="mt-4 pt-4 border-t" style={{ borderColor: BORD }}>
              <div className="flex items-center gap-1.5 mb-2">
                <Baby size={12} style={{ color: GOLD }} />
                <span className="text-[10px] uppercase tracking-wide" style={{ color: DIM }}>Children (up to 3)</span>
              </div>
              {[1, 2, 3].map(n => (
                <div key={n} className="grid grid-cols-2 gap-3 mb-2">
                  <input value={form[`child${n}Name`] || ""}
                    onChange={e => setForm(p => ({ ...p, [`child${n}Name`]: e.target.value }))}
                    style={cinp} placeholder={`Child ${n} name`} />
                  <DayMonth value={form[`child${n}Dob`]}
                    onChange={v => setForm(p => ({ ...p, [`child${n}Dob`]: v }))} />
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t" style={{ borderColor: BORD }}>
              <Fld label="Loyalty points">
                <input type="number" step="0.01" value={form.loyaltyPoints ?? 0}
                  onChange={e => setForm(p => ({ ...p, loyaltyPoints: e.target.value }))} style={cinp} />
              </Fld>
              <Fld label="Groups / tags (comma separated)">
                <input value={form.tags || ""} onChange={e => setForm(p => ({ ...p, tags: e.target.value }))}
                  style={cinp} placeholder="vip, regular, corporate" />
              </Fld>
              <Fld label="Address" className="col-span-2">
                <textarea value={form.address || ""} onChange={e => setForm(p => ({ ...p, address: e.target.value }))}
                  rows={2} style={{ ...cinp, resize: "vertical" }} placeholder="Street, City..." />
              </Fld>
              <Fld label="Notes & preferences" className="col-span-2">
                <textarea value={form.notes || ""} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                  rows={2} style={{ ...cinp, resize: "vertical" }} placeholder="Allergic to prawns, prefers window table..." />
              </Fld>
            </div>

            <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t" style={{ borderColor: BORD }}>
              <button onClick={() => setForm(p => ({ ...p, autoWishes: p.autoWishes === false }))}
                className="px-3 py-1.5 rounded-lg text-[11px] font-semibold"
                style={{
                  background: form.autoWishes !== false ? "rgba(34,197,94,0.15)" : BG,
                  border: `1px solid ${form.autoWishes !== false ? "var(--color-success)" : BORD}`,
                  color: form.autoWishes !== false ? "var(--color-success)" : MUTED,
                }}>
                Automated wishes: {form.autoWishes !== false ? "ON" : "STOPPED"}
              </button>
              <button onClick={() => setForm(p => ({ ...p, smsOptOut: !p.smsOptOut }))}
                className="px-3 py-1.5 rounded-lg text-[11px] font-semibold"
                style={{
                  background: form.smsOptOut ? "rgba(239,68,68,0.15)" : BG,
                  border: `1px solid ${form.smsOptOut ? "var(--color-danger)" : BORD}`,
                  color: form.smsOptOut ? "var(--color-danger)" : MUTED,
                }}>
                {form.smsOptOut ? "Opted out of all messages" : "Receives messages"}
              </button>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button onClick={resetForm} className="px-4 py-2 rounded-lg text-xs" style={{ background: BORD, color: MUTED }}>Cancel</button>
              <button onClick={handleSubmit} disabled={!form.name?.trim()}
                className="px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
                style={{ background: GOLD, color: "var(--color-surface)" }}>
                {editItem ? "Update" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {dashFor && <CustomerDashboard customer={dashFor} onClose={() => setDashFor(null)} onSms={c => { setDashFor(null); setSmsFor(c); }} />}
      {smsFor && <SendSmsPanel customer={smsFor} branchId={branchId} onClose={() => setSmsFor(null)} />}
    </div>
  );
}

// ── Shared form bits ────────────────────────────────────────────────────────

const cinp: React.CSSProperties = {
  width: "100%", padding: "8px 10px", borderRadius: 8,
  border: `1px solid ${BORD}`, background: BG, color: TEXT,
  fontSize: 12, outline: "none", boxSizing: "border-box",
};

function Fld({ label, children, className = "" }: any) {
  return (
    <div className={className}>
      <label className="block text-[10px] uppercase tracking-wide mb-1" style={{ color: DIM }}>{label}</label>
      {children}
    </div>
  );
}

const money = (n: number) => `LKR ${Number(n || 0).toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ── Per-customer mini dashboard ─────────────────────────────────────────────

function CustomerDashboard({ customer, onClose, onSms }: any) {
  const { data, isLoading } = useQuery({
    queryKey: ["customer-dashboard", customer.id],
    queryFn: async () => (await api.customers[":id"].dashboard.$get({ param: { id: String(customer.id) } })).json(),
  });

  const d: any = (data as any) || {};
  const stats: any = d.stats || {};
  const visits: any[] = d.visits || [];
  const favourites: any[] = d.favourites || [];
  const messages: any[] = d.messages || [];
  const cust: any = d.customer || customer;

  const maxAmount = Math.max(1, ...visits.map(v => v.amount));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: "rgba(0,0,0,0.7)" }}>
      <div className="w-full max-w-4xl max-h-full overflow-auto rounded-2xl border" style={{ background: SURF, borderColor: BORD }}>
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b sticky top-0" style={{ background: SURF, borderColor: BORD }}>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full flex items-center justify-center text-base font-bold"
              style={{ background: "rgba(245,166,35,0.2)", color: GOLD }}>
              {cust.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="font-bold text-sm" style={{ color: TEXT }}>{cust.name}</div>
              <div className="text-[11px] flex items-center gap-2" style={{ color: MUTED }}>
                {cust.phone && <span className="flex items-center gap-1"><Phone size={10} />{cust.phone}</span>}
                {cust.email && <span>{cust.email}</span>}
                {cust.smsOptOut && <span style={{ color: "var(--color-danger)" }}>· opted out</span>}
              </div>
              {cust.tags && (
                <div className="flex items-center gap-1 mt-1">
                  <TagIcon size={9} style={{ color: DIM }} />
                  {String(cust.tags).split(",").filter(Boolean).map((t: string) => (
                    <span key={t} className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: BG, color: MUTED }}>{t}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => onSms(cust)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold"
              style={{ background: GOLD, color: SURF }}>
              <MessageSquare size={12} /> Send SMS
            </button>
            <button onClick={onClose} className="p-1.5 rounded" style={{ color: MUTED }}><X size={16} /></button>
          </div>
        </div>

        {isLoading ? (
          <div className="p-16 text-center text-xs" style={{ color: DIM }}>Loading dashboard…</div>
        ) : (
          <div className="p-5 space-y-5">
            {/* Headline stats */}
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
              <Kpi label="Visits" value={stats.visitCount ?? 0} />
              <Kpi label="Orders" value={stats.orderCount ?? 0} />
              <Kpi label="Total spent" value={money(stats.totalSpent ?? 0)} accent="var(--color-success)" />
              <Kpi label="Avg order" value={money(stats.avgOrderValue ?? 0)} />
              <Kpi label="Loyalty points" value={Math.round(stats.loyaltyPoints ?? 0)} accent={GOLD} icon={Award} />
              <Kpi label="Messages sent" value={stats.messagesSent ?? 0} />
            </div>

            {/* Occasions on file */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Occ icon={Cake} label="Birthday" value={fmtDayMonth(cust.dob)} />
              <Occ icon={Gift} label="Anniversary" value={fmtDayMonth(cust.weddingAnniversary)} />
              <Occ icon={Baby} label={cust.child1Name || "Child 1"} value={fmtDayMonth(cust.child1Dob)} />
              <Occ icon={Baby} label={cust.child2Name || "Child 2"} value={fmtDayMonth(cust.child2Dob)} />
            </div>

            {cust.notes && (
              <div className="rounded-lg p-3 text-[11px]" style={{ background: BG, border: `1px solid ${BORD}`, color: MUTED }}>
                <span className="uppercase text-[9px] mr-2" style={{ color: DIM }}>Notes</span>{cust.notes}
              </div>
            )}

            {/* Visits by date */}
            <Section title="Visits by date" subtitle={
              stats.firstVisit ? `First visit ${stats.firstVisit} · last visit ${stats.lastVisit}` : "No visits recorded yet"
            }>
              {visits.length === 0 ? (
                <div className="text-xs py-6 text-center" style={{ color: DIM }}>No orders linked to this customer yet.</div>
              ) : (
                <div className="space-y-1.5 max-h-56 overflow-auto">
                  {visits.map(v => (
                    <div key={v.date} className="flex items-center gap-3">
                      <span className="text-[11px] w-20 shrink-0" style={{ color: MUTED }}>{v.date}</span>
                      <div className="flex-1 h-4 rounded" style={{ background: BG }}>
                        <div className="h-full rounded" style={{ width: `${(v.amount / maxAmount) * 100}%`, background: GOLD, opacity: 0.75 }} />
                      </div>
                      <span className="text-[11px] w-14 text-right shrink-0" style={{ color: DIM }}>{v.orders} ord</span>
                      <span className="text-[11px] w-28 text-right shrink-0 font-semibold" style={{ color: TEXT }}>{money(v.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* Favourites */}
            {favourites.length > 0 && (
              <Section title="Favourite items">
                <div className="flex flex-wrap gap-2">
                  {favourites.map(f => (
                    <div key={f.name} className="px-2.5 py-1.5 rounded-lg text-[11px]" style={{ background: BG, border: `1px solid ${BORD}` }}>
                      <span style={{ color: TEXT }}>{f.name}</span>
                      <span style={{ color: GOLD }}> ×{f.qty}</span>
                      <span style={{ color: DIM }}> · {money(f.amount)}</span>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Message history */}
            <Section title="Message history">
              {messages.length === 0 ? (
                <div className="text-xs py-6 text-center" style={{ color: DIM }}>No messages sent to this customer yet.</div>
              ) : (
                <div className="space-y-1.5 max-h-56 overflow-auto">
                  {messages.map(m => (
                    <div key={m.id} className="flex items-start gap-2 rounded-lg p-2.5" style={{ background: BG, border: `1px solid ${BORD}` }}>
                      {m.status === "sent" ? <CheckCircle2 size={12} style={{ color: "var(--color-success)", marginTop: 2 }} />
                        : m.status === "failed" ? <XCircle size={12} style={{ color: "var(--color-danger)", marginTop: 2 }} />
                        : <MinusCircle size={12} style={{ color: MUTED, marginTop: 2 }} />}
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] whitespace-pre-wrap" style={{ color: TEXT }}>{m.body}</div>
                        <div className="text-[10px] mt-0.5" style={{ color: DIM }}>
                          {m.channel === "sms" ? "SMS" : "WhatsApp"} · {m.kind.replace("_", " ")} ·{" "}
                          {new Date(m.sentAt ?? m.createdAt).toLocaleString("en-GB")}
                          {m.cost > 0 && ` · ${money(m.cost)}`}
                          {m.error && <span style={{ color: "var(--color-danger)" }}> · {m.error}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, accent, icon: Icon }: any) {
  return (
    <div className="rounded-xl p-3" style={{ background: BG, border: `1px solid ${BORD}` }}>
      <div className="text-[9px] uppercase tracking-wide flex items-center gap-1" style={{ color: DIM }}>
        {Icon && <Icon size={9} />}{label}
      </div>
      <div className="text-sm font-bold mt-0.5" style={{ color: accent || TEXT }}>{value}</div>
    </div>
  );
}

function Occ({ icon: Icon, label, value }: any) {
  return (
    <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: BG, border: `1px solid ${BORD}` }}>
      <Icon size={13} style={{ color: value ? GOLD : DIM }} />
      <div className="min-w-0">
        <div className="text-[9px] uppercase truncate" style={{ color: DIM }}>{label}</div>
        <div className="text-[11px] font-semibold" style={{ color: value ? TEXT : DIM }}>{value || "not set"}</div>
      </div>
    </div>
  );
}

/**
 * Day + month picker — no year, because wishes only ever need the day and month.
 * Stores "MM-DD"; also reads legacy "YYYY-MM-DD" values so old rows still show.
 */
function DayMonth({ value, onChange }: { value?: string; onChange: (v: string) => void }) {
  const initial = monthDayOf(value);
  // Month and day are held locally so a half-finished pick (month chosen, day not
  // yet) survives. Reporting upward only happens once both are set — otherwise
  // picking a month would clear itself and the day list could never unlock.
  const [mm, setMm] = useState(initial ? initial.split("-")[0] : "");
  const [dd, setDd] = useState(initial ? initial.split("-")[1] : "");

  // Re-sync when the parent swaps in a different customer, but ignore the value
  // we ourselves just reported (or cleared) so local half-picks aren't wiped.
  useEffect(() => {
    const incoming = monthDayOf(value);
    if (incoming === (mm && dd ? `${mm}-${dd}` : "")) return;
    setMm(incoming ? incoming.split("-")[0] : "");
    setDd(incoming ? incoming.split("-")[1] : "");
  }, [value]);

  const report = (nextMm: string, nextDd: string) =>
    onChange(nextMm && nextDd ? `${nextMm}-${nextDd}` : "");

  const pickMonth = (next: string) => {
    setMm(next);
    // 31 -> February must not stay out of range
    const capped = dd && Number(dd) > daysInMonth(next)
      ? String(daysInMonth(next)).padStart(2, "0")
      : dd;
    setDd(capped);
    report(next, capped);
  };

  const pickDay = (next: string) => {
    setDd(next);
    report(mm, next);
  };

  return (
    <div className="grid grid-cols-2 gap-2">
      <select value={mm} onChange={e => pickMonth(e.target.value)} style={cinp}>
        <option value="">Month</option>
        {MONTHS.map((name, i) => (
          <option key={name} value={String(i + 1).padStart(2, "0")}>{name}</option>
        ))}
      </select>
      <select value={dd} onChange={e => pickDay(e.target.value)} style={cinp} disabled={!mm}>
        <option value="">Day</option>
        {Array.from({ length: daysInMonth(mm) }, (_, i) => String(i + 1).padStart(2, "0"))
          .map(d => <option key={d} value={d}>{Number(d)}</option>)}
      </select>
    </div>
  );
}

function Section({ title, subtitle, children }: any) {
  return (
    <div>
      <div className="mb-2">
        <div className="text-xs font-bold" style={{ color: TEXT }}>{title}</div>
        {subtitle && <div className="text-[10px]" style={{ color: DIM }}>{subtitle}</div>}
      </div>
      {children}
    </div>
  );
}

// ── Private single SMS / WhatsApp send ──────────────────────────────────────

function SendSmsPanel({ customer, branchId, onClose }: any) {
  const qc = useQueryClient();
  const [channel, setChannel] = useState<"sms" | "whatsapp">("sms");
  const [body, setBody] = useState("");
  const [senderId, setSenderId] = useState("");
  const [result, setResult] = useState<string>("");

  const { data: balanceData } = useQuery({
    queryKey: ["msg-balance", branchId],
    queryFn: async () => (await api.messaging.balance.$get({ query: { branchId: String(branchId) } })).json(),
  });
  const { data: templatesData } = useQuery({
    queryKey: ["msg-templates", branchId],
    queryFn: async () => (await api.messaging.templates.$get({ query: { branchId: String(branchId) } })).json(),
  });

  const bal: any = (balanceData as any) || {};
  const templates: any[] = ((templatesData as any)?.templates || []).filter((t: any) => t.isActive);
  const senderIds: string[] = bal.senderIds || [];
  const segments = Math.max(1, Math.ceil(body.length / 160));
  const cost = channel === "sms" ? segments * Number(bal.rate ?? 1) : 0;

  const send = useMutation({
    mutationFn: async () => (await api.messaging.send.$post({
      json: { branchId, customerId: customer.id, body, channel, senderId: senderId || undefined, kind: "manual" },
    })).json(),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["msg-balance"] });
      qc.invalidateQueries({ queryKey: ["customer-dashboard", customer.id] });
      qc.invalidateQueries({ queryKey: ["msg-log"] });
      if (res.status === "sent") { setResult("Sent."); setBody(""); }
      else setResult(res.reason || "Could not send.");
    },
    onError: (e: any) => setResult(`Failed: ${e.message}`),
  });

  const blocked = customer.smsOptOut || !customer.phone;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: "rgba(0,0,0,0.7)" }}>
      <div className="w-full max-w-lg rounded-2xl border p-5" style={{ background: SURF, borderColor: BORD }}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="font-bold text-sm" style={{ color: TEXT }}>Send a private message</div>
            <div className="text-[11px]" style={{ color: MUTED }}>
              To {customer.name} · {customer.phone || "no phone on file"}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded" style={{ color: MUTED }}><X size={16} /></button>
        </div>

        {blocked ? (
          <div className="rounded-lg p-3 text-xs" style={{ background: BG, border: `1px solid var(--color-danger)`, color: "var(--color-danger)" }}>
            {customer.smsOptOut
              ? "This customer has opted out of messages. Turn that off in their profile before sending."
              : "This customer has no phone number on file."}
          </div>
        ) : (
          <>
            <div className="flex p-1 rounded-xl w-fit mb-3" style={{ background: BG, border: `1px solid ${BORD}` }}>
              {(["sms", "whatsapp"] as const).map(ch => (
                <button key={ch} onClick={() => setChannel(ch)}
                  className="px-3.5 py-1 rounded-lg text-[11px] font-bold"
                  style={{ background: channel === ch ? GOLD : "transparent", color: channel === ch ? SURF : MUTED }}>
                  {ch === "sms" ? "SMS" : "WhatsApp"}
                </button>
              ))}
            </div>

            {channel === "sms" && senderIds.length > 0 && (
              <Fld label="Sender ID" className="mb-3">
                <select value={senderId} onChange={e => setSenderId(e.target.value)} style={cinp}>
                  <option value="">Default ({bal.defaultSenderId})</option>
                  {senderIds.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </Fld>
            )}

            {templates.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap mb-2">
                <span className="text-[10px] uppercase" style={{ color: DIM }}>Templates:</span>
                {templates.map(t => (
                  <button key={t.id} onClick={() => setBody(t.body)} className="px-2 py-0.5 rounded text-[10px]"
                    style={{ background: BG, border: `1px solid ${BORD}`, color: MUTED }}>{t.name}</button>
                ))}
              </div>
            )}

            <textarea value={body} onChange={e => setBody(e.target.value)} rows={5}
              placeholder="Hi {first_name}, ..." style={{ ...cinp, resize: "vertical", fontFamily: "inherit" }} />

            <div className="flex items-center gap-2 mt-2 text-[11px]" style={{ color: DIM }}>
              <span>{body.length} chars · {segments} segment{segments > 1 ? "s" : ""}</span>
              {channel === "sms" && <span>· costs {money(cost)} of {money(bal.credits ?? 0)}</span>}
              {["{name}", "{first_name}", "{points}"].map(t => (
                <button key={t} onClick={() => setBody(b => b + t)} className="px-1.5 py-0.5 rounded"
                  style={{ background: BG, border: `1px solid ${BORD}`, color: MUTED }}>{t}</button>
              ))}
            </div>

            {result && (
              <div className="mt-3 text-[11px] px-3 py-2 rounded-lg"
                style={{ background: BG, border: `1px solid ${BORD}`, color: result === "Sent." ? "var(--color-success)" : "var(--color-danger)" }}>
                {result}
              </div>
            )}

            <div className="flex justify-end gap-2 mt-4">
              <button onClick={onClose} className="px-4 py-2 rounded-lg text-xs" style={{ background: BORD, color: MUTED }}>Close</button>
              <button onClick={() => send.mutate()} disabled={!body.trim() || send.isPending}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold disabled:opacity-50"
                style={{ background: GOLD, color: SURF }}>
                <Send size={12} /> {send.isPending ? "Sending…" : "Send"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
