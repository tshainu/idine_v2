import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, PackagePlus, Plus, Save, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { getBranchId, getUser } from "../lib/store";
import { Sidebar } from "../components/layout/sidebar";

const BG = "var(--color-bg)";
const SURF = "var(--color-surface)";
const BORD = "var(--color-border)";
const TEXT = "var(--color-text)";
const MUTED = "var(--color-text-muted)";
const DIM = "var(--color-text-dim)";
const GOLD = "var(--color-gold)";

export default function SalesStockPage() {
  const branchId = getBranchId();
  const user = getUser();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<any | null>(null);
  const [form, setForm] = useState({ name: "", quantityOnHand: "", addQuantity: "", lowStockLevel: "10", allowOverselling: false, dailyOpening: false });
  const [menuId, setMenuId] = useState("");
  const [deductionQty, setDeductionQty] = useState("1");
  const [error, setError] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["sales-stock", branchId],
    queryFn: async () => (await (api as any).stock.$get({ query: { branchId: String(branchId) } })).json(),
  });
  const { data: menuData } = useQuery({
    queryKey: ["stock-menu-items", branchId],
    queryFn: async () => (await api["menu-items"].$get({ query: { branchId: String(branchId) } })).json(),
  });
  const stockItems: any[] = data?.stockItems || [];
  const menuItems: any[] = (menuData as any)?.menuItems || [];
  const availableMenuItems = useMemo(() => menuItems.filter(item => !item.stockTracked || item.stockItemId === selected?.id), [menuItems, selected]);

  const save = useMutation({
    mutationFn: async (payload: any) => selected
      ? (await (api as any).stock[":id"].$patch({ param: { id: String(selected.id) }, json: payload })).json()
      : (await (api as any).stock.$post({ json: payload })).json(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sales-stock", branchId] }); qc.invalidateQueries({ queryKey: ["stock-menu-items", branchId] }); qc.invalidateQueries({ queryKey: ["dish-stock-report", branchId] }); setSelected(null); setForm({ name: "", quantityOnHand: "", addQuantity: "", lowStockLevel: "10", allowOverselling: false, dailyOpening: false }); setError(""); },
    onError: (e: any) => setError(e?.message || "Unable to save stock"),
  });
  const link = useMutation({
    mutationFn: async () => (await (api as any).stock[":id"].link.$post({ param: { id: String(selected.id) }, json: { menuItemId: Number(menuId), deductionQty: Number(deductionQty), userId: user?.id } })).json(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sales-stock", branchId] }); qc.invalidateQueries({ queryKey: ["stock-menu-items", branchId] }); setMenuId(""); },
    onError: (e: any) => setError(e?.message || "Unable to link menu item"),
  });
  const unlink = useMutation({
    mutationFn: async ({ stockId, menuItemId }: any) => (await (api as any).stock[":id"].link[":menuItemId"].$delete({ param: { id: String(stockId), menuItemId: String(menuItemId) }, json: { userId: user?.id } })).json(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sales-stock", branchId] }); qc.invalidateQueries({ queryKey: ["stock-menu-items", branchId] }); },
  });

  const emptyForm = () => ({ name: "", quantityOnHand: "", addQuantity: "", lowStockLevel: "10", allowOverselling: false, dailyOpening: false });
  const openNew = () => { setSelected(null); setForm(emptyForm()); setError(""); };
  const openEdit = (item: any) => { setSelected(item); setForm({ name: item.name, quantityOnHand: String(item.quantityOnHand ?? ""), addQuantity: "", lowStockLevel: String(item.lowStockLevel ?? 10), allowOverselling: Boolean(item.allowOverselling), dailyOpening: false }); setError(""); };
    const submit = (e: React.FormEvent) => { e.preventDefault(); if (selected && form.dailyOpening && Number(form.addQuantity || 0) < 0) { setError("Today's opening quantity cannot be negative."); return; } if (selected && form.dailyOpening && !window.confirm("Replace the current balance with today's opening stock? The previous balance will remain in the report.")) return; save.mutate({ ...form, branchId, userId: user?.id, ...(selected ? { addQuantity: Number(form.addQuantity || 0), quantityOnHand: Number(form.quantityOnHand || 0) } : { quantityOnHand: Number(form.quantityOnHand || 0) }), lowStockLevel: Number(form.lowStockLevel || 10), allowOverselling: form.allowOverselling }); };

  return <div className="flex h-screen overflow-hidden" style={{ background: BG }}><Sidebar /><main className="flex-1 overflow-y-auto p-6 space-y-5"><div className="flex items-center justify-between gap-3"><div><Link href="/products" className="inline-flex items-center gap-1 text-xs mb-2" style={{ color: MUTED }}><ArrowLeft size={13} /> Back to Menu Items</Link><h1 className="text-xl font-bold" style={{ color: TEXT }}>Add Sales Stock</h1><p className="text-xs mt-1" style={{ color: DIM }}>Create shared stock groups for dishes sold separately at the POS.</p></div><button onClick={openNew} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold" style={{ background: GOLD, color: BG }}><Plus size={14} /> New Stock Group</button></div>
    {error && <div className="rounded-lg border px-4 py-3 text-xs" style={{ borderColor: "#dc2626", color: "#f87171" }}>{error}</div>}
    <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-5"><form onSubmit={submit} className="rounded-2xl border p-5 space-y-4 h-fit" style={{ background: SURF, borderColor: BORD }}><div className="font-semibold text-sm" style={{ color: TEXT }}>{selected ? "Edit Stock Group" : "Opening Stock Details"}</div><label className="block text-xs" style={{ color: MUTED }}>Stock group name<input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Parotta" className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none" style={{ background: BG, borderColor: BORD, color: TEXT }} /></label>{selected ? <><label className="block text-xs" style={{ color: MUTED }}>Current balance<input readOnly value={form.quantityOnHand} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none opacity-70" style={{ background: BG, borderColor: BORD, color: TEXT }} /></label><label className="block text-xs" style={{ color: MUTED }}>{form.dailyOpening ? "Today's opening quantity" : "Add new stock"}<input type="number" min="0" step="0.01" value={form.addQuantity} onChange={e => setForm({ ...form, addQuantity: e.target.value })} placeholder={form.dailyOpening ? "Enter today's opening quantity" : "Quantity to add"} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none" style={{ background: BG, borderColor: BORD, color: TEXT }} /><span className="block mt-1" style={{ color: DIM }}>{form.dailyOpening ? "Replaces the current balance with this entered quantity and records today's opening stock." : "Added to the existing balance and recorded as a new restock line."}</span>{<label className="flex items-start gap-2 mt-3" style={{ color: MUTED }}><input type="checkbox" checked={form.dailyOpening} onChange={e => setForm({ ...form, dailyOpening: e.target.checked })} className="mt-0.5" /><span><strong style={{ color: TEXT }}>Use as today's opening stock</strong><br />If no update is made on a day, the previous balance continues automatically.</span></label>}</label></> : <label className="block text-xs" style={{ color: MUTED }}>Opening quantity<input required type="number" min="0" step="0.01" value={form.quantityOnHand} onChange={e => setForm({ ...form, quantityOnHand: e.target.value })} placeholder="How many are available?" className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none" style={{ background: BG, borderColor: BORD, color: TEXT }} /></label>}<label className="block text-xs" style={{ color: MUTED }}>Low-stock alert at<input type="number" min="0" step="0.01" value={form.lowStockLevel} onChange={e => setForm({ ...form, lowStockLevel: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none" style={{ background: BG, borderColor: BORD, color: TEXT }} /></label><label className="flex items-start gap-2 text-xs" style={{ color: MUTED }}><input type="checkbox" checked={form.allowOverselling} onChange={e => setForm({ ...form, allowOverselling: e.target.checked })} className="mt-0.5" /><span><strong style={{ color: TEXT }}>Allow over selling</strong><br />Allow the POS to continue selling after this stock reaches zero.</span></label><button disabled={save.isPending} className="w-full inline-flex justify-center items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold" style={{ background: GOLD, color: BG }}><Save size={14} /> {save.isPending ? "Saving…" : "Save Stock Details"}</button></form>
      <section className="space-y-3">{isLoading ? <div className="rounded-2xl border p-8 text-center text-xs" style={{ background: SURF, borderColor: BORD, color: DIM }}>Loading stock…</div> : stockItems.length === 0 ? <div className="rounded-2xl border p-10 text-center" style={{ background: SURF, borderColor: BORD }}><PackagePlus size={28} className="mx-auto mb-2" style={{ color: DIM }} /><div className="text-sm" style={{ color: TEXT }}>No sales stock added yet.</div><div className="text-xs mt-1" style={{ color: DIM }}>Create one group for each shared kitchen stock.</div></div> : stockItems.map(item => { const available = Number(item.availableQty ?? item.quantityOnHand ?? 0); const low = available <= Number(item.lowStockLevel || 0); return <div key={item.id} className="rounded-2xl border p-4" style={{ background: SURF, borderColor: low ? "#dc2626" : BORD }}><div className="flex items-start justify-between gap-3"><div><div className="font-semibold text-sm" style={{ color: TEXT }}>{item.name}</div><div className="text-xs mt-1" style={{ color: low ? "#f87171" : MUTED }}>{available} left · Alert at {item.lowStockLevel} · {item.allowOverselling ? "Over selling allowed" : "Stops at zero"}</div></div><button onClick={() => openEdit(item)} className="text-xs font-semibold" style={{ color: GOLD }}>Edit</button></div><div className="mt-3 text-xs" style={{ color: MUTED }}><span className="font-semibold" style={{ color: TEXT }}>POS items using this stock:</span>{item.menuItems?.length ? <div className="flex flex-wrap gap-2 mt-2">{item.menuItems.map((link: any) => <span key={link.menuItemId} className="inline-flex items-center gap-1 rounded-full px-2 py-1" style={{ background: BG, color: TEXT }}>{link.menuItem?.name || `Item #${link.menuItemId}`} × {link.deductionQty}<button type="button" onClick={() => unlink.mutate({ stockId: item.id, menuItemId: link.menuItemId })} style={{ color: "#f87171" }}><Trash2 size={11} /></button></span>)}</div> : <div className="mt-2" style={{ color: DIM }}>No menu items linked.</div>}</div>{selected?.id === item.id && <div className="mt-4 pt-4 border-t flex flex-wrap items-end gap-2" style={{ borderColor: BORD }}><label className="text-xs flex-1 min-w-[180px]" style={{ color: MUTED }}>Add menu item<select value={menuId} onChange={e => setMenuId(e.target.value)} className="mt-1 w-full rounded-lg border px-2 py-2 text-xs" style={{ background: BG, borderColor: BORD, color: TEXT }}><option value="">Select menu item</option>{availableMenuItems.map(menu => <option key={menu.id} value={menu.id}>{menu.name}</option>)}</select></label><label className="text-xs w-28" style={{ color: MUTED }}>Deduct qty<input type="number" min="0.001" step="0.001" value={deductionQty} onChange={e => setDeductionQty(e.target.value)} className="mt-1 w-full rounded-lg border px-2 py-2 text-xs" style={{ background: BG, borderColor: BORD, color: TEXT }} /></label><button type="button" disabled={!menuId || link.isPending} onClick={() => link.mutate()} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold" style={{ background: GOLD, color: BG }}><Plus size={13} /> Link Item</button></div>}</div>; })}</section></div></main></div>;
}
