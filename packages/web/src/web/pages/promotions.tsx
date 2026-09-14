import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tag, Plus, Search, Pencil, Trash2, X, Calendar } from "lucide-react";
import { Sidebar } from "../components/layout/sidebar";
import { api } from "../lib/api";
import { getBranchId } from "../lib/store";

const BG = "var(--color-bg)";
const SURF = "var(--color-surface)";
const BORD = "var(--color-border)";
const GOLD = "var(--color-gold)";
const TEXT = "var(--color-text)";
const MUTED = "var(--color-text-muted)";

const PROMO_TYPES = [
  { value: "percent", label: "Percentage (%)" },
  { value: "flat", label: "Flat Amount (Rs.)" },
  { value: "bogo", label: "Buy 1 Get 1 (BOGO)" },
];

const today = new Date().toISOString().split("T")[0];
const EMPTY_FORM = { name: "", type: "percent", value: 0, minOrderAmount: 0, startDate: today, endDate: "", targetItemIds: [] as number[] };

function isActive(p: any) {
  if (!p.isActive) return false;
  const now = today;
  if (p.startDate && p.startDate > now) return false;
  if (p.endDate && p.endDate < now) return false;
  return true;
}

export default function PromotionsPage() {
  const qc = useQueryClient();
  const branchId = getBranchId();
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [selected, setSelected] = useState<any>(null);
  const [form, setForm] = useState<any>(EMPTY_FORM);

  const { data, isLoading } = useQuery({
    queryKey: ["promotions", branchId],
    queryFn: async () => {
      const res = await (api as any).promotions.$get({ query: branchId ? { branchId: String(branchId) } : {} });
      return res.json();
    },
  });

  const { data: menuData } = useQuery({
    queryKey: ["promotion-menu-items", branchId],
    queryFn: async () => (await (api as any)["menu-items"].$get({ query: { branchId: String(branchId) } })).json(),
  });

  const items: any[] = (data as any)?.promotions || [];
  const menuItems: any[] = (menuData as any)?.menuItems || [];

  const createPromo = useMutation({
    mutationFn: async (body: any) => (await (api as any).promotions.$post({ json: { ...body, branchId } })).json(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["promotions"] }); closeModal(); },
  });
  const updatePromo = useMutation({
    mutationFn: async ({ id, body }: any) => (await (api as any).promotions[":id"].$patch({ param: { id: String(id) }, json: body })).json(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["promotions"] }); closeModal(); },
  });
  const deletePromo = useMutation({
    mutationFn: async (id: number) => (await (api as any).promotions[":id"].$delete({ param: { id: String(id) } })).json(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["promotions"] }),
  });
  const toggleEnabled = useMutation({
    mutationFn: async ({ id, isActive }: any) => (await (api as any).promotions[":id"].$patch({ param: { id: String(id) }, json: { isActive } })).json(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["promotions"] }),
  });

  function openCreate() { setForm(EMPTY_FORM); setSelected(null); setModal("create"); }
  function openEdit(p: any) {
    setSelected(p);
    let targetItemIds: number[] = [];
    try { targetItemIds = JSON.parse(p.targetItemIds || "[]").map((id: any) => Number(id)); } catch {}
    setForm({ name: p.name, type: p.type, value: p.value, minOrderAmount: p.minOrderAmount, startDate: p.startDate || today, endDate: p.endDate || "", targetItemIds });
    setModal("edit");
  }
  function closeModal() { setModal(null); setSelected(null); setForm(EMPTY_FORM); }
  function handleSubmit() {
    if (!form.name?.trim()) return;
    const body = { ...form, value: Number(form.value), minOrderAmount: Number(form.minOrderAmount), targetItemIds: JSON.stringify(form.targetItemIds || []), endDate: form.endDate || null };
    if (modal === "create") createPromo.mutate(body);
    else if (modal === "edit" && selected) updatePromo.mutate({ id: selected.id, body });
  }

  function formatValue(p: any) {
    if (p.type === "percent") return `${p.value}% OFF`;
    if (p.type === "flat") return `Rs. ${p.value} OFF`;
    if (p.type === "bogo") return "Buy 1 Get 1";
    return `${p.value}`;
  }

  const filtered = items.filter((p: any) => p.name.toLowerCase().includes(search.toLowerCase()));
  const activeCount = items.filter(isActive).length;

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: BG }}>
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="h-14 flex items-center justify-between px-6 border-b shrink-0" style={{ background: SURF, borderColor: BORD }}>
          <div className="flex items-center gap-2">
            <Tag size={18} color={GOLD} />
            <span className="font-bold text-base" style={{ color: TEXT }}>Promotions</span>
            <span className="text-xs px-2 py-0.5 rounded-full ml-1" style={{ background: "rgba(245,166,35,0.15)", color: GOLD }}>{items.length}</span>
          </div>
          <button onClick={openCreate} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold" style={{ background: GOLD, color: "var(--color-surface)" }}>
            <Plus size={15} /> Add Promotion
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            {[
              { label: "Total Promotions", value: items.length, color: GOLD },
              { label: "Currently Active", value: activeCount, color: "var(--color-success)" },
              { label: "Inactive / Expired", value: items.length - activeCount, color: MUTED },
            ].map(s => (
              <div key={s.label} className="rounded-xl p-4 border" style={{ background: SURF, borderColor: BORD }}>
                <div className="text-xs mb-1" style={{ color: MUTED }}>{s.label}</div>
                <div className="text-xl font-bold" style={{ color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Search */}
          <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg border" style={{ background: SURF, borderColor: BORD }}>
            <Search size={14} color={MUTED} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search promotions..." className="flex-1 bg-transparent text-sm outline-none" style={{ color: TEXT }} />
          </div>

          {/* Table */}
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: BORD }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: SURF }}>
                  {["Name", "Items", "Type", "Discount", "Min Order", "Valid From", "Valid Until", "Status", "Actions"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold" style={{ color: MUTED }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={9} className="text-center py-12 text-sm" style={{ color: MUTED }}>Loading...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-12 text-sm" style={{ color: MUTED }}>No promotions found. Create your first one.</td></tr>
                ) : filtered.map((p: any, idx: number) => {
                  const active = isActive(p);
                  const expired = p.endDate && p.endDate < today;
                  const scheduled = p.startDate && p.startDate > today;
                  let statusLabel = "Disabled";
                  let statusColor = "#F87171";
                  let statusBg = "rgba(239,68,68,0.15)";
                  if (active) { statusLabel = "Active"; statusColor = "#4ADE80"; statusBg = "rgba(34,197,94,0.15)"; }
                  else if (expired) { statusLabel = "Expired"; statusColor = MUTED; statusBg = `rgba(107,114,128,0.15)`; }
                  else if (scheduled) { statusLabel = "Scheduled"; statusColor = "#60A5FA"; statusBg = "rgba(96,165,250,0.15)"; }

                  return (
                    <tr key={p.id} style={{ background: idx % 2 === 0 ? BG : "rgba(26,10,46,0.4)", borderTop: `1px solid ${BORD}` }}>
                      <td className="px-4 py-3 font-medium" style={{ color: TEXT }}>{p.name}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: MUTED }}>{(() => { try { const ids = JSON.parse(p.targetItemIds || "[]"); return ids.length ? `${ids.length} item${ids.length === 1 ? "" : "s"}` : "All items"; } catch { return "All items"; } })()}</td>
                      <td className="px-4 py-3 text-xs capitalize" style={{ color: MUTED }}>{p.type}</td>
                      <td className="px-4 py-3 font-mono font-bold" style={{ color: GOLD }}>{formatValue(p)}</td>
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: MUTED }}>{p.minOrderAmount > 0 ? `Rs. ${p.minOrderAmount}` : "None"}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: MUTED }}>{p.startDate || "—"}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: expired ? "#F87171" : MUTED }}>{p.endDate || "No expiry"}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => toggleEnabled.mutate({ id: p.id, isActive: !p.isActive })}
                          className="text-xs px-2 py-0.5 rounded-full transition-all"
                          style={{ background: statusBg, color: statusColor }}>
                          {statusLabel}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button onClick={() => openEdit(p)} className="p-1 rounded" style={{ color: GOLD }}><Pencil size={14} /></button>
                          <button onClick={() => { if (confirm(`Delete "${p.name}"?`)) deletePromo.mutate(p.id); }} className="p-1 rounded" style={{ color: "var(--color-danger)" }}><Trash2 size={14} /></button>
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

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)" }}>
          <div className="w-full max-w-md rounded-2xl p-6 border" style={{ background: SURF, borderColor: BORD }}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-base" style={{ color: TEXT }}>{modal === "create" ? "Create Promotion" : "Edit Promotion"}</h3>
              <button onClick={closeModal} style={{ color: MUTED }}><X size={18} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs mb-1" style={{ color: MUTED }}>Promotion Name *</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Weekend Special" className="w-full px-3 py-2 rounded-lg border text-sm outline-none" style={{ background: BG, borderColor: BORD, color: TEXT }} />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: MUTED }}>Type</label>
                <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className="w-full px-3 py-2 rounded-lg border text-sm outline-none" style={{ background: BG, borderColor: BORD, color: TEXT }}>
                  {PROMO_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              {form.type !== "bogo" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs mb-1" style={{ color: MUTED }}>{form.type === "percent" ? "Discount %" : "Flat Amount (Rs.)"}</label>
                    <input type="number" min="0" step={form.type === "percent" ? "1" : "10"} max={form.type === "percent" ? "100" : undefined} value={form.value} onChange={e => setForm({ ...form, value: e.target.value })} className="w-full px-3 py-2 rounded-lg border text-sm outline-none" style={{ background: BG, borderColor: BORD, color: TEXT }} />
                  </div>
                  <div>
                    <label className="block text-xs mb-1" style={{ color: MUTED }}>Min Order (Rs.)</label>
                    <input type="number" min="0" step="50" value={form.minOrderAmount} onChange={e => setForm({ ...form, minOrderAmount: e.target.value })} className="w-full px-3 py-2 rounded-lg border text-sm outline-none" style={{ background: BG, borderColor: BORD, color: TEXT }} />
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs mb-1" style={{ color: MUTED }}>Apply to menu items</label>
                <p className="text-[10px] mb-2" style={{ color: MUTED }}>Leave all unchecked to apply this promotion to every item.</p>
                <div className="max-h-40 overflow-y-auto rounded-lg border p-2 space-y-1" style={{ background: BG, borderColor: BORD }}>
                  {menuItems.length === 0 ? <div className="text-xs p-2" style={{ color: MUTED }}>No menu items found.</div> : menuItems.map(item => {
                    const selectedItemIds: number[] = form.targetItemIds || [];
                    const checked = selectedItemIds.includes(Number(item.id));
                    return <label key={item.id} className="flex items-center gap-2 px-2 py-1 rounded cursor-pointer" style={{ color: TEXT }}>
                      <input type="checkbox" checked={checked} onChange={() => setForm((f: any) => ({ ...f, targetItemIds: checked ? selectedItemIds.filter(id => id !== Number(item.id)) : [...selectedItemIds, Number(item.id)] }))} />
                      <span className="text-xs">{item.name}</span>
                    </label>;
                  })}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs mb-1" style={{ color: MUTED }}>Start Date</label>
                  <div className="relative">
                    <input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} className="w-full px-3 py-2 rounded-lg border text-sm outline-none" style={{ background: BG, borderColor: BORD, color: TEXT }} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs mb-1" style={{ color: MUTED }}>End Date (optional)</label>
                  <input type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} className="w-full px-3 py-2 rounded-lg border text-sm outline-none" style={{ background: BG, borderColor: BORD, color: TEXT }} />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={closeModal} className="flex-1 py-2 rounded-lg text-sm border" style={{ borderColor: BORD, color: MUTED }}>Cancel</button>
              <button onClick={handleSubmit} disabled={createPromo.isPending || updatePromo.isPending} className="flex-1 py-2 rounded-lg text-sm font-semibold" style={{ background: GOLD, color: "var(--color-surface)" }}>
                {createPromo.isPending || updatePromo.isPending ? "Saving..." : modal === "create" ? "Create" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
