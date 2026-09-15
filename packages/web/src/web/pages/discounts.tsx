import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Pencil, Percent, BadgePercent } from "lucide-react";
import { getBranchId } from "../lib/store";
import { Sidebar } from "../components/layout/sidebar";

const GOLD = "var(--color-gold)";
const BG = "var(--color-bg)";
const SURF = "var(--color-surface)";
const BORD = "var(--color-border)";
const TEXT = "var(--color-text)";
const MUTED = "var(--color-text-muted)";
const DIM = "var(--color-text-dim)";

type DiscountForm = { name: string; type: "percent" | "amount"; value: string };
const EMPTY: DiscountForm = { name: "", type: "percent", value: "" };

export default function DiscountsPage() {
  const branchId = getBranchId();
  const qc = useQueryClient();
  const [form, setForm] = useState<DiscountForm>(EMPTY);
  const [editingId, setEditingId] = useState<number | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["discounts", branchId],
    queryFn: async () => (await fetch(`/api/discounts?branchId=${branchId}`)).json(),
  });
  const discounts: any[] = (data as any)?.discounts || [];
  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch(editingId ? `/api/discounts/${editingId}` : "/api/discounts", {
        method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branchId, name: form.name, type: form.type, value: Number(form.value) }),
      });
      const body = await res.json(); if (!res.ok) throw new Error(body.error || "Could not save discount"); return body;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["discounts", branchId] }); setForm(EMPTY); setEditingId(null); },
  });
  const remove = useMutation({
    mutationFn: async (id: number) => fetch(`/api/discounts/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["discounts", branchId] }),
  });
  const startEdit = (d: any) => { setEditingId(d.id); setForm({ name: d.name, type: d.type, value: String(d.value) }); };
  return <div className="flex h-screen overflow-hidden" style={{ background: BG }}>
    <Sidebar />
    <main className="flex-1 overflow-y-auto p-6" style={{ color: TEXT }}>
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-6"><BadgePercent size={24} style={{ color: GOLD }} /><div><h1 className="text-xl font-bold">Discounts</h1><p className="text-xs" style={{ color: MUTED }}>Create discounts for selection in Order Details.</p></div></div>
        <div className="rounded-2xl border p-5 mb-5" style={{ background: SURF, borderColor: BORD }}>
          <div className="font-semibold text-sm mb-4" style={{ color: TEXT }}>{editingId ? "Edit Discount" : "Add Discount"}</div>
          <div className="grid grid-cols-3 gap-3">
            <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Discount name" className="rounded-lg border px-3 py-2 text-sm outline-none" style={{ background: BG, borderColor: BORD, color: TEXT }} />
            <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value as DiscountForm["type"] }))} className="rounded-lg border px-3 py-2 text-sm outline-none" style={{ background: BG, borderColor: BORD, color: TEXT }}><option value="percent">Percentage (%)</option><option value="amount">Fixed amount (LKR)</option></select>
            <input type="number" min="0" max={form.type === "percent" ? 100 : undefined} value={form.value} onChange={e => setForm(p => ({ ...p, value: e.target.value }))} placeholder={form.type === "percent" ? "e.g. 10" : "e.g. 500"} className="rounded-lg border px-3 py-2 text-sm outline-none" style={{ background: BG, borderColor: BORD, color: TEXT }} />
          </div>
          {save.error && <div className="text-xs mt-2" style={{ color: "var(--color-danger)" }}>{(save.error as Error).message}</div>}
          <div className="flex justify-end gap-2 mt-4"><button onClick={() => { setForm(EMPTY); setEditingId(null); }} className="px-4 py-2 rounded-lg text-xs" style={{ color: MUTED, border: `1px solid ${BORD}` }}>{editingId ? "Cancel" : "Clear"}</button><button disabled={save.isPending || !form.name.trim() || !form.value} onClick={() => save.mutate()} className="px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-50" style={{ background: GOLD, color: "#111" }}><Plus size={13} className="inline mr-1" />{editingId ? "Save Changes" : "Add Discount"}</button></div>
        </div>
        <div className="rounded-2xl border overflow-hidden" style={{ background: SURF, borderColor: BORD }}>
          <div className="px-5 py-4 border-b font-semibold text-sm" style={{ borderColor: BORD }}>Available Discounts</div>
          {isLoading ? <div className="p-8 text-center text-xs" style={{ color: DIM }}>Loading…</div> : discounts.length === 0 ? <div className="p-8 text-center text-xs" style={{ color: DIM }}>No discounts created</div> : discounts.map(d => <div key={d.id} className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: BORD }}><div className="flex items-center gap-3"><div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${GOLD}22`, color: GOLD }}>{d.type === "percent" ? <Percent size={14} /> : <span className="text-xs font-bold">Rs</span>}</div><div><div className="text-sm font-medium">{d.name}</div><div className="text-xs" style={{ color: MUTED }}>{d.type === "percent" ? `${d.value}%` : `LKR ${Number(d.value).toFixed(2)}`}</div></div></div><div className="flex gap-2"><button onClick={() => startEdit(d)} className="p-2 rounded" style={{ color: GOLD }}><Pencil size={14} /></button><button onClick={() => { if (confirm(`Delete ${d.name}?`)) remove.mutate(d.id); }} className="p-2 rounded" style={{ color: "var(--color-danger)" }}><Trash2 size={14} /></button></div></div>)}
        </div>
      </div>
    </main>
  </div>;
}
