import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { getBranchId } from "../lib/store";
import { Sidebar } from "../components/layout/sidebar";
import {
  Plus, Pencil, Trash2, ToggleLeft, ToggleRight, X, Upload,
  Package, Tag, Sparkles,
} from "lucide-react";

const GOLD = "var(--color-gold)";
const PINK = "var(--color-pink)";
const BG = "var(--color-bg)";
const SURF = "var(--color-surface)";
const SURF2 = "var(--color-surface-2)";
const BORD = "var(--color-border)";
const MUTED = "var(--color-text-muted)";
const DIM = "var(--color-text-dim)";
const TEXT = "var(--color-text)";

type Tab = "combo" | "promo";

export default function ComboPromoPage() {
  const branchId = getBranchId();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("combo");
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [comboSelection, setComboSelection] = useState<Record<number, number>>({}); // menuItemId -> qty
  const [promoSelection, setPromoSelection] = useState<Record<number, boolean>>({}); // menuItemId -> included
  const [imgUploading, setImgUploading] = useState(false);
  const imgInputRef = useRef<HTMLInputElement>(null);

  const { data: menuData, isLoading } = useQuery({
    queryKey: ["menu-items", branchId],
    queryFn: async () => (await api["menu-items"].$get({ query: { branchId: String(branchId) } })).json(),
  });
  const allItems: any[] = (menuData as any)?.menuItems || [];
  const combos = allItems.filter(i => i.isCombo);
  const promos = allItems.filter(i => i.isPromo && !i.isCombo);
  // Plain menu items only — the pool combos are built from
  const plainItems = allItems.filter(i => !i.isCombo && !i.isPromo);

  const { data: categoriesData } = useQuery({
    queryKey: ["categories", branchId],
    queryFn: async () => (await api.categories.$get({ query: { branchId: String(branchId) } })).json(),
  });
  const categories: any[] = (categoriesData as any)?.categories || [];

  const list = tab === "combo" ? combos : promos;

  async function handleImageUpload(file: File) {
    setImgUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const json = await res.json();
      if (json.url) setForm(p => ({ ...p, imageUrl: json.url }));
    } finally {
      setImgUploading(false);
    }
  }

  const saveCombo = useMutation({
    mutationFn: async () => {
      const payload: any = {
        name: form.name.trim(),
        description: form.description || "",
        price: parseFloat(form.price) || 0,
        priceDineIn: parseFloat(form.price) || 0,
        priceTakeaway: parseFloat(form.price) || 0,
        priceDelivery: parseFloat(form.price) || 0,
        imageUrl: form.imageUrl || null,
        isCombo: true,
        isPromo: false,
        isActive: form.isActive ?? true,
        branchId,
      };
      const items = Object.entries(comboSelection)
        .filter(([, qty]) => qty > 0)
        .map(([menuItemId, qty]) => {
          const src = plainItems.find(i => i.id === Number(menuItemId));
          return { menuItemId: Number(menuItemId), name: src?.name || "", qty };
        });
      let comboId: number;
      if (editItem) {
        const res = await (await api["menu-items"][":id"].$patch({ param: { id: String(editItem.id) }, json: payload })).json();
        comboId = (res as any).menuItem.id;
      } else {
        const res = await (await api["menu-items"].$post({ json: payload })).json();
        comboId = (res as any).menuItem.id;
      }
      await api["combo-items"].replace.$post({ json: { comboId, items } });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["menu-items"] }); resetForm(); },
  });

  const savePromo = useMutation({
    mutationFn: async () => {
      const payload: any = {
        name: form.name.trim(),
        description: form.description || "",
        originalPrice: parseFloat(form.originalPrice) || 0,
        price: parseFloat(form.price) || 0,
        priceDineIn: parseFloat(form.price) || 0,
        priceTakeaway: parseFloat(form.price) || 0,
        priceDelivery: parseFloat(form.price) || 0,
        imageUrl: form.imageUrl || null,
        categoryId: form.categoryId ? Number(form.categoryId) : null,
        isPromo: true,
        isCombo: false,
        isActive: form.isActive ?? true,
        branchId,
      };
      let promoId: number;
      if (editItem) {
        const res = await (await api["menu-items"][":id"].$patch({ param: { id: String(editItem.id) }, json: payload })).json();
        promoId = (res as any).menuItem.id;
      } else {
        const res = await (await api["menu-items"].$post({ json: payload })).json();
        promoId = (res as any).menuItem.id;
      }
      const items = Object.entries(promoSelection)
        .filter(([, included]) => included)
        .map(([menuItemId]) => {
          const src = plainItems.find(i => i.id === Number(menuItemId));
          return { menuItemId: Number(menuItemId), name: src?.name || "", qty: 1 };
        });
      await api["combo-items"].replace.$post({ json: { comboId: promoId, items } });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["menu-items"] }); resetForm(); },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, isActive }: any) => api["menu-items"][":id"].$patch({ param: { id: String(id) }, json: { isActive } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["menu-items"] }),
  });

  const deleteItem = useMutation({
    mutationFn: async (id: number) => api["menu-items"][":id"].$delete({ param: { id: String(id) } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["menu-items"] }),
  });

  function resetForm() {
    setShowForm(false); setEditItem(null); setForm({}); setComboSelection({}); setPromoSelection({});
  }

  function openAdd() {
    resetForm();
    setForm({ isActive: true });
    setShowForm(true);
  }

  async function openEdit(item: any) {
    setEditItem(item);
    setForm({
      name: item.name, description: item.description || "", price: item.priceDineIn || item.price || 0,
      originalPrice: item.originalPrice || 0, imageUrl: item.imageUrl || "", isActive: item.isActive,
      categoryId: item.categoryId || "",
    });
    if (tab === "combo") {
      const res = await (await api["combo-items"].$get({ query: { comboId: String(item.id) } })).json() as any;
      const sel: Record<number, number> = {};
      (res.comboItems || []).forEach((ci: any) => { if (ci.menuItemId) sel[ci.menuItemId] = ci.qty; });
      setComboSelection(sel);
    } else {
      const res = await (await api["combo-items"].$get({ query: { comboId: String(item.id) } })).json() as any;
      const sel: Record<number, boolean> = {};
      (res.comboItems || []).forEach((pi: any) => { if (pi.menuItemId) sel[pi.menuItemId] = true; });
      setPromoSelection(sel);
    }
    setShowForm(true);
  }

  function handleSubmit() {
    if (!form.name?.trim()) return;
    if (tab === "combo") saveCombo.mutate();
    else savePromo.mutate();
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: BG }}>
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="h-14 flex items-center justify-between px-6 border-b shrink-0" style={{ background: SURF, borderColor: BORD }}>
          <div className="font-bold text-base" style={{ color: TEXT }}>Combos &amp; Promos</div>
          <button onClick={openAdd}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold"
            style={{ background: tab === "combo" ? GOLD : PINK, color: "var(--color-surface)" }}>
            <Plus size={13} />
            {tab === "combo" ? "Add Combo" : "Add Promo"}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Tabs */}
          <div className="flex gap-2">
            <button onClick={() => setTab("combo")}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all"
              style={{ background: tab === "combo" ? GOLD : SURF, color: tab === "combo" ? "var(--color-surface)" : MUTED, border: `1px solid ${tab === "combo" ? GOLD : BORD}` }}>
              <Package size={13} /> Combos ({combos.length})
            </button>
            <button onClick={() => setTab("promo")}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all"
              style={{ background: tab === "promo" ? PINK : SURF, color: tab === "promo" ? "var(--color-surface)" : MUTED, border: `1px solid ${tab === "promo" ? PINK : BORD}` }}>
              <Sparkles size={13} /> Promos ({promos.length})
            </button>
          </div>

          {isLoading ? (
            <div className="text-center py-10 text-xs" style={{ color: DIM }}>Loading...</div>
          ) : list.length === 0 ? (
            <div className="text-center py-16" style={{ color: DIM }}>
              {tab === "combo" ? <Package size={40} className="mx-auto mb-3 opacity-30" /> : <Sparkles size={40} className="mx-auto mb-3 opacity-30" />}
              <p className="text-sm font-medium mb-1" style={{ color: MUTED }}>No {tab === "combo" ? "combos" : "promos"} yet</p>
              <p className="text-xs">These will also show up as a filter tab in the POS so staff can bill them directly</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {list.map((item: any) => (
                <div key={item.id} className="rounded-xl border overflow-hidden" style={{ background: SURF, borderColor: BORD, opacity: item.isActive ? 1 : 0.55 }}>
                  <div className="h-28 flex items-center justify-center" style={{ background: SURF2 }}>
                    {item.imageUrl
                      ? <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                      : (tab === "combo" ? <Package size={28} style={{ color: DIM }} /> : <Sparkles size={28} style={{ color: DIM }} />)}
                  </div>
                  <div className="p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold truncate" style={{ color: TEXT }}>{item.name}</span>
                      <button onClick={() => toggleActive.mutate({ id: item.id, isActive: !item.isActive })}>
                        {item.isActive ? <ToggleRight size={18} color="var(--color-success)" /> : <ToggleLeft size={18} color={DIM} />}
                      </button>
                    </div>
                    {item.description && <div className="text-xs mt-1 line-clamp-2" style={{ color: MUTED }}>{item.description}</div>}
                    <div className="flex items-center gap-2 mt-2">
                      {tab === "promo" && item.originalPrice > 0 && (
                        <span className="text-xs line-through" style={{ color: DIM }}>{item.originalPrice.toFixed(2)}</span>
                      )}
                      <span className="text-sm font-bold font-mono" style={{ color: tab === "combo" ? GOLD : PINK }}>
                        LKR {(item.priceDineIn || item.price || 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-3">
                      <button onClick={() => openEdit(item)}
                        className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded text-xs font-semibold"
                        style={{ background: SURF2, color: TEXT }}>
                        <Pencil size={11} /> Edit
                      </button>
                      <button onClick={() => { if (confirm(`Delete "${item.name}"?`)) deleteItem.mutate(item.id); }}
                        className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded text-xs font-semibold"
                        style={{ background: "rgba(220,38,38,0.12)", color: "var(--color-danger)" }}>
                        <Trash2 size={11} /> Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.75)" }}>
          <div className="w-[440px] max-h-[88vh] overflow-y-auto rounded-2xl border" style={{ background: SURF, borderColor: BORD }}>
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: BORD }}>
              <span className="font-bold text-sm" style={{ color: TEXT }}>
                {editItem ? "Edit" : "Add"} {tab === "combo" ? "Combo" : "Promo"}
              </span>
              <button onClick={resetForm} style={{ color: DIM }}><X size={16} /></button>
            </div>

            <div className="p-5 space-y-3">
              {/* Image */}
              <div>
                <label className="text-xs mb-1 block" style={{ color: MUTED }}>Image</label>
                <input ref={imgInputRef} type="file" accept="image/*" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); e.target.value = ""; }} />
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded-lg overflow-hidden flex items-center justify-center shrink-0" style={{ background: BG, border: `1px solid ${BORD}` }}>
                    {form.imageUrl ? <img src={form.imageUrl} alt="" className="w-full h-full object-cover" /> : <Upload size={16} style={{ color: DIM }} />}
                  </div>
                  <button type="button" disabled={imgUploading} onClick={() => imgInputRef.current?.click()}
                    className="px-3 py-2 rounded-lg text-xs border"
                    style={{ borderColor: BORD, color: imgUploading ? DIM : TEXT, background: BG }}>
                    <Upload size={12} className="inline mr-1" />{imgUploading ? "Uploading..." : "Upload Image"}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs mb-1 block" style={{ color: MUTED }}>Name *</label>
                <input value={form.name || ""} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full px-3 py-2 text-sm rounded-lg border bg-transparent outline-none"
                  style={{ background: BG, borderColor: BORD, color: TEXT }}
                  placeholder={tab === "combo" ? "e.g. Family Feast" : "e.g. Weekend Special"} />
              </div>

              <div>
                <label className="text-xs mb-1 block" style={{ color: MUTED }}>Description</label>
                <textarea value={form.description || ""} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={2}
                  className="w-full px-3 py-2 text-sm rounded-lg border bg-transparent outline-none resize-none"
                  style={{ background: BG, borderColor: BORD, color: TEXT }} />
              </div>

              {tab === "promo" && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs mb-1 block" style={{ color: MUTED }}>Original Price</label>
                    <input type="number" min="0" value={form.originalPrice ?? ""} onChange={e => setForm(p => ({ ...p, originalPrice: e.target.value }))}
                      className="w-full px-3 py-2 text-sm rounded-lg border bg-transparent outline-none"
                      style={{ background: BG, borderColor: BORD, color: TEXT }} />
                  </div>
                  <div>
                    <label className="text-xs mb-1 block" style={{ color: MUTED }}>Promo Price *</label>
                    <input type="number" min="0" value={form.price ?? ""} onChange={e => setForm(p => ({ ...p, price: e.target.value }))}
                      className="w-full px-3 py-2 text-sm rounded-lg border bg-transparent outline-none"
                      style={{ background: BG, borderColor: BORD, color: TEXT }} />
                  </div>
                </div>
              )}

              {tab === "combo" && (
                <div>
                  <label className="text-xs mb-1 block" style={{ color: MUTED }}>Combo Price *</label>
                  <input type="number" min="0" value={form.price ?? ""} onChange={e => setForm(p => ({ ...p, price: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border bg-transparent outline-none"
                    style={{ background: BG, borderColor: BORD, color: TEXT }} />
                </div>
              )}

              {tab === "promo" && (
                <div>
                  <label className="text-xs mb-1 block" style={{ color: MUTED }}>Category (optional — controls where it's shown in POS)</label>
                  <select value={form.categoryId || ""} onChange={e => setForm(p => ({ ...p, categoryId: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border bg-transparent outline-none"
                    style={{ background: BG, borderColor: BORD, color: TEXT }}>
                    <option value="">None</option>
                    {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}

              {tab === "promo" && (
                <div>
                  <label className="text-xs mb-1 block" style={{ color: MUTED }}>Menu Items (optional — choose the items included in this promo)</label>
                  <div className="rounded-lg border max-h-48 overflow-y-auto" style={{ borderColor: BORD }}>
                    {plainItems.length === 0 ? <div className="p-3 text-xs" style={{ color: DIM }}>No menu items available</div> : plainItems.map((mi: any) => (
                      <label key={mi.id} className="flex items-center gap-2 px-3 py-2 border-b last:border-b-0 text-xs cursor-pointer" style={{ borderColor: BORD, color: TEXT }}>
                        <input type="checkbox" checked={!!promoSelection[mi.id]} onChange={e => setPromoSelection(prev => ({ ...prev, [mi.id]: e.target.checked }))} />
                        <span>{mi.name}</span>
                        <span className="ml-auto text-[10px]" style={{ color: DIM }}>LKR {(mi.priceDineIn || mi.price || 0).toFixed(2)}</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-[10px] mt-1" style={{ color: DIM }}>Leave all unchecked if this promo should remain available for the whole category.</p>
                </div>
              )}

              {tab === "combo" && (
                <div>
                  <label className="text-xs mb-1 block" style={{ color: MUTED }}>Included Items</label>
                  <div className="rounded-lg border max-h-48 overflow-y-auto" style={{ borderColor: BORD }}>
                    {plainItems.length === 0 ? (
                      <div className="p-3 text-xs" style={{ color: DIM }}>No menu items available</div>
                    ) : plainItems.map((mi: any) => (
                      <div key={mi.id} className="flex items-center justify-between px-3 py-2 border-b last:border-b-0" style={{ borderColor: BORD }}>
                        <label className="flex items-center gap-2 text-xs flex-1 cursor-pointer" style={{ color: TEXT }}>
                          <input type="checkbox" checked={!!comboSelection[mi.id]}
                            onChange={e => setComboSelection(prev => {
                              const next = { ...prev };
                              if (e.target.checked) next[mi.id] = 1; else delete next[mi.id];
                              return next;
                            })} />
                          {mi.name}
                        </label>
                        {!!comboSelection[mi.id] && (
                          <div className="flex items-center gap-1">
                            <button onClick={() => setComboSelection(prev => ({ ...prev, [mi.id]: Math.max(1, prev[mi.id] - 1) }))}
                              className="w-5 h-5 rounded border text-xs" style={{ borderColor: BORD, color: TEXT }}>-</button>
                            <span className="w-5 text-center text-xs font-bold" style={{ color: TEXT }}>{comboSelection[mi.id]}</span>
                            <button onClick={() => setComboSelection(prev => ({ ...prev, [mi.id]: prev[mi.id] + 1 }))}
                              className="w-5 h-5 rounded border text-xs" style={{ borderColor: BORD, color: TEXT }}>+</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2">
                <button onClick={() => setForm(p => ({ ...p, isActive: !p.isActive }))} className="flex items-center gap-2 text-xs" style={{ color: TEXT }}>
                  {form.isActive ? <ToggleRight size={18} color="var(--color-success)" /> : <ToggleLeft size={18} color={DIM} />}
                  {form.isActive ? "Active" : "Suspended"}
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-2 px-5 py-4 border-t" style={{ borderColor: BORD }}>
              <button onClick={resetForm} className="px-4 py-2 rounded-lg text-xs" style={{ background: BORD, color: MUTED }}>Cancel</button>
              <button onClick={handleSubmit} disabled={!form.name?.trim() || saveCombo.isPending || savePromo.isPending}
                className="px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
                style={{ background: tab === "combo" ? GOLD : PINK, color: "var(--color-surface)" }}>
                {editItem ? "Update" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
