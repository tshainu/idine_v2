import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { getBranchId } from "../lib/store";
import { Sidebar } from "../components/layout/sidebar";
import { Link } from "wouter";
import { Plus, Pencil, Trash2, Search, ToggleLeft, ToggleRight, Leaf, Coffee, X, Upload, ImageIcon, ArrowUp, ArrowDown, ArrowUpDown, TrendingUp, Download, PackagePlus } from "lucide-react";
import { exportToCSV } from "../lib/csv";

function MarginBadge({ salePrice, costPrice }: { salePrice: number; costPrice: number }) {
  if (!costPrice || costPrice <= 0) return <span style={{ color: "var(--color-text-dim)", fontSize: 11 }}>—</span>;
  const margin = ((salePrice - costPrice) / salePrice) * 100;
  const color = margin >= 60 ? "var(--color-success)" : margin >= 40 ? "var(--color-gold)" : margin >= 20 ? "#F97316" : "var(--color-danger)";
  return (
    <span className="text-xs font-bold px-1.5 py-0.5 rounded-full"
      style={{ background: `${color}22`, color, border: `1px solid ${color}44` }}>
      {margin.toFixed(1)}%
    </span>
  );
}

function MarginWidget({ salePrice, marginPct }: { salePrice: number; marginPct: number }) {
  if (!salePrice) return null;
  const sale = Number(salePrice) || 0;
  const margin = Math.min(Math.max(Number(marginPct) || 0, 0), 100);
  const profit = sale * (margin / 100);
  const cost = sale - profit;
  const color = margin >= 60 ? "var(--color-success)" : margin >= 40 ? "var(--color-gold)" : margin >= 20 ? "#F97316" : "var(--color-danger)";
  const barW = margin;
  return (
    <div className="rounded-xl border p-3 space-y-2" style={{ background: "var(--color-surface-2)", borderColor: "var(--color-border)" }}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold flex items-center gap-1" style={{ color: "var(--color-text-muted)" }}>
          <TrendingUp size={12} /> Profit Margin
        </span>
        <span className="text-sm font-bold" style={{ color }}>{margin > 0 ? `${margin.toFixed(1)}%` : "Enter margin %"}</span>
      </div>
      {margin > 0 && (
        <>
          <div className="w-full rounded-full h-1.5" style={{ background: "var(--color-border)" }}>
            <div className="h-1.5 rounded-full transition-all" style={{ width: `${barW}%`, background: color }} />
          </div>
          <div className="flex justify-between text-xs" style={{ color: "var(--color-text-dim)" }}>
            <span>Cost: <span style={{ color: "var(--color-danger)", fontWeight: 600 }}>LKR {cost.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span></span>
            <span>Profit: <span style={{ color, fontWeight: 600 }}>LKR {profit.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span></span>
          </div>
        </>
      )}
    </div>
  );
}

const GOLD = "var(--color-gold)";
const BG = "var(--color-bg)";
const SURF = "var(--color-surface)";
const BORD = "var(--color-border)";
const MUTED = "var(--color-text-muted)";
const DIM = "var(--color-text-dim)";
const TEXT = "var(--color-text)";
const PURPLE = "var(--color-purple)";

const inputCls = "w-full px-3 py-2 text-sm rounded-lg border outline-none";
const inputStyle = (extra?: React.CSSProperties) =>
  ({ background: BG, borderColor: BORD, color: TEXT, ...extra } as React.CSSProperties);

function FLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="text-xs mb-1 block font-medium" style={{ color: MUTED }}>
      {children}{required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
  );
}

// ─── Variation Modal ────────────────────────────────────────────────────────
function VariationModal({
  menuItemId,
  nextCode,
  onClose,
  onSaved,
}: {
  menuItemId: number | null;
  nextCode: string;
  onClose: () => void;
  onSaved: (v: any) => void;
}) {
  const [vform, setVform] = useState<Record<string, any>>({
    name: "",
    code: nextCode,
    priceDineIn: "",
    priceTakeaway: "",
    priceDelivery: "",
    loyaltyPoint: "",
  });

  function vset(key: string) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setVform(f => {
        if (key === "priceDineIn") {
          return { ...f, priceDineIn: val, priceTakeaway: val, priceDelivery: val };
        }
        return { ...f, [key]: val };
      });
    };
  }

  const qc = useQueryClient();
  const branchId = getBranchId();

  const saveVariation = useMutation({
    mutationFn: async (data: any) =>
      (await api.variations.$post({ json: data })).json(),
    onSuccess: (res: any) => {
      if (menuItemId) qc.invalidateQueries({ queryKey: ["variations", menuItemId] });
      onSaved(res.variation);
      onClose();
    },
  });

  function handleSubmit() {
    if (!vform.name.trim()) return;
    const payload: any = {
      menuItemId,
      name: vform.name,
      code: vform.code || null,
      priceDineIn: Number(vform.priceDineIn) || 0,
      priceTakeaway: Number(vform.priceTakeaway) || 0,
      priceDelivery: Number(vform.priceDelivery) || 0,
      loyaltyPoint: Number(vform.loyaltyPoint) || 0,
    };
    if (menuItemId) {
      saveVariation.mutate(payload);
    } else {
      // editing new unsaved item — just pass back locally
      onSaved({ ...payload, id: Date.now(), _local: true });
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.75)" }}>
      <div className="w-[520px] rounded-2xl border max-h-[90vh] overflow-y-auto" style={{ background: SURF, borderColor: BORD }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: BORD }}>
          <span className="font-bold text-sm" style={{ color: TEXT }}>Add Variation</span>
          <button onClick={onClose} style={{ color: DIM }}><X size={16} /></button>
        </div>
        <div className="p-6 space-y-4">
          {/* Name + Code */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FLabel required>Variation Name</FLabel>
              <input value={vform.name} onChange={vset("name")} placeholder="e.g. Small"
                className={inputCls} style={inputStyle()} />
            </div>
            <div>
              <FLabel required>Code</FLabel>
              <input value={vform.code} onChange={vset("code")}
                className={inputCls} style={inputStyle()} />
            </div>
          </div>
          {/* Prices */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FLabel required>Sale Price (Dine In) *</FLabel>
              <input type="number" value={vform.priceDineIn} onChange={vset("priceDineIn")} placeholder="0.00"
                className={inputCls} style={inputStyle()} />
            </div>
            <div>
              <FLabel required>Sale Price (Take Away)</FLabel>
              <input type="number" value={vform.priceTakeaway} onChange={vset("priceTakeaway")} placeholder="0.00"
                className={inputCls} style={inputStyle()} />
            </div>
          </div>
          <div>
            <FLabel required>Sale Price (Delivery)</FLabel>
            <input type="number" value={vform.priceDelivery} onChange={vset("priceDelivery")} placeholder="0.00"
              className={inputCls} style={inputStyle()} />
          </div>
          {/* Loyalty */}
          <div>
            <FLabel>Loyalty Point</FLabel>
            <input type="number" value={vform.loyaltyPoint} onChange={vset("loyaltyPoint")} placeholder="0"
              className={inputCls} style={inputStyle()} />
          </div>
          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={saveVariation.isPending}
            className="w-full py-2.5 rounded-lg text-sm font-semibold"
            style={{ background: PURPLE, color: "#fff" }}
          >
            {saveVariation.isPending ? "Saving..." : "Submit"}
          </button>
        </div>
      </div>
    </div>
  );
}

type ProdSortKey = "name" | "code" | "category" | "priceDineIn" | "priceTakeaway" | "priceDelivery";
type SortDir = "asc" | "desc";

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function ProductsPage() {
  const branchId = getBranchId();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [sortKey, setSortKey] = useState<ProdSortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function handleSort(key: ProdSortKey) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [localVariations, setLocalVariations] = useState<any[]>([]); // for new unsaved items
  const [showVarModal, setShowVarModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [imgUploading, setImgUploading] = useState(false);
  const imgInputRef = useRef<HTMLInputElement>(null);

  async function handleImageUpload(file: File) {
    setImgUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const json = await res.json() as any;
      if (json.url) setForm(p => ({ ...p, imageUrl: json.url }));
    } finally {
      setImgUploading(false);
    }
  }

  const { data: menuData, isLoading } = useQuery({
    queryKey: ["products-menu", branchId],
    queryFn: async () => (await api["menu-items"].$get({ query: { branchId: String(branchId) } })).json(),
  });
  const { data: catData } = useQuery({
    queryKey: ["categories", branchId],
    queryFn: async () => (await api.categories.$get({ query: { branchId: String(branchId) } })).json(),
  });
  // printers query kept for potential future use but not shown in form
  const { data: _printersData } = useQuery({
    queryKey: ["printers", branchId],
    queryFn: async () => (await api.printers.$get({ query: { branchId: String(branchId) } })).json(),
    enabled: false,
  });

  // Variations for currently editing item
  const { data: varData } = useQuery({
    queryKey: ["variations", editItem?.id],
    queryFn: async () => (await api.variations.$get({ query: { menuItemId: String(editItem.id) } })).json(),
    enabled: !!editItem?.id,
  });
  const savedVariations: any[] = (varData as any)?.variations || [];
  const variations = editItem?.id ? savedVariations : localVariations;

  const items: any[] = (menuData as any)?.menuItems || [];
  const categories: any[] = (catData as any)?.categories || [];

  const filtered = items.filter(m => {
    const matchSearch = !search || m.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCat === "all" || String(m.categoryId) === filterCat;
    return matchSearch && matchCat;
  });

  const sortedItems = [...filtered].sort((a, b) => {
    let av: any, bv: any;
    if (sortKey === "priceDineIn") { av = Number(a.priceDineIn || a.price || 0); bv = Number(b.priceDineIn || b.price || 0); }
    else if (sortKey === "priceTakeaway") { av = Number(a.priceTakeaway || 0); bv = Number(b.priceTakeaway || 0); }
    else if (sortKey === "priceDelivery") { av = Number(a.priceDelivery || 0); bv = Number(b.priceDelivery || 0); }
    else if (sortKey === "category") { av = catName(a.categoryId); bv = catName(b.categoryId); }
    else { av = String(a[sortKey] || ""); bv = String(b[sortKey] || ""); }
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  // Mutations
  const createItem = useMutation({
    mutationFn: async (data: any) => (await api["menu-items"].$post({ json: { ...data, branchId } })).json(),
    onSuccess: async (res: any) => {
      // save any local variations attached
      if (localVariations.length > 0 && res.menuItem?.id) {
        for (const v of localVariations) {
          await api.variations.$post({ json: { ...v, menuItemId: res.menuItem.id } });
        }
      }
      qc.invalidateQueries({ queryKey: ["products-menu", branchId] });
      resetForm();
    },
  });
  const updateItem = useMutation({
    mutationFn: async ({ id, data }: any) => (await api["menu-items"][":id"].$patch({ param: { id: String(id) }, json: data })).json(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["products-menu", branchId] }); resetForm(); },
  });
  const deleteItem = useMutation({
    mutationFn: async (id: number) => (await api["menu-items"][":id"].$delete({ param: { id: String(id) } })).json(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["products-menu", branchId] }),
  });
  const toggleActive = useMutation({
    mutationFn: async ({ id, isActive }: any) => (await api["menu-items"][":id"].$patch({ param: { id: String(id) }, json: { isActive } })).json(),
    onMutate: async ({ id, isActive }) => {
      await qc.cancelQueries({ queryKey: ["products-menu", branchId] });
      const prev = qc.getQueryData(["products-menu", branchId]);
      qc.setQueryData(["products-menu", branchId], (old: any) => {
        if (!old?.menuItems) return old;
        return { ...old, menuItems: old.menuItems.map((m: any) => m.id === id ? { ...m, isActive } : m) };
      });
      return { prev };
    },
    onError: (_err, _vars, ctx: any) => {
      if (ctx?.prev) qc.setQueryData(["products-menu", branchId], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["products-menu", branchId] }),
  });
  const deleteVariation = useMutation({
    mutationFn: async (id: number) => (await api.variations[":id"].$delete({ param: { id: String(id) } })).json(),
    onSuccess: () => { if (editItem?.id) qc.invalidateQueries({ queryKey: ["variations", editItem.id] }); },
  });

  function resetForm() {
    setShowForm(false);
    setEditItem(null);
    setForm({});
    setLocalVariations([]);
  }

  function openEdit(item: any) {
    setEditItem(item);
    setForm({
      name: item.name,
      code: item.code || "",
      priceDineIn: item.priceDineIn ?? item.price ?? "",
      priceTakeaway: item.priceTakeaway ?? item.price ?? "",
      priceDelivery: item.priceDelivery ?? item.price ?? "",
      marginPercent: (() => {
        const sale = Number(item.priceDineIn ?? item.price ?? 0);
        const cost = Number(item.costPrice ?? 0);
        if (!sale || !cost) return "";
        return ((sale - cost) / sale * 100).toFixed(1);
      })(),
      description: item.description || "",
      imageUrl: item.imageUrl ?? "",
      loyaltyPoint: item.loyaltyPoint ?? 0,
      categoryId: item.categoryId,
      isVeg: item.isVeg || false,
      isBeverage: item.isBeverage || false,
      isPromo: item.isPromo || false,
      sortOrder: item.sortOrder || 0,
    });
    setShowForm(true);
  }

  function handleSubmit() {
    const pDineIn = Number(form.priceDineIn) || 0;
    const data = {
      ...form,
      price: pDineIn, // keep legacy compat
      priceDineIn: pDineIn,
      priceTakeaway: Number(form.priceTakeaway) || 0,
      priceDelivery: Number(form.priceDelivery) || 0,
      costPrice: (() => {
        const sale = Number(form.priceDineIn) || 0;
        const pct = Math.min(Math.max(Number(form.marginPercent) || 0, 0), 100);
        return sale > 0 && pct > 0 ? sale * (1 - pct / 100) : 0;
      })(),
      loyaltyPoint: Number(form.loyaltyPoint) || 0,
      categoryId: Number(form.categoryId) || null,
      sortOrder: Number(form.sortOrder) || 0,
      isVeg: !!form.isVeg,
      isBeverage: !!form.isBeverage,
      isPromo: !!form.isPromo,
    };
    if (editItem) updateItem.mutate({ id: editItem.id, data });
    else createItem.mutate(data);
  }

  // Next variation code helper
  function nextVarCode() {
    const base = form.code ? String(form.code) : (editItem?.code || "100");
    return `${base}-${(variations.length + 1).toString().padStart(2, "0")}`;
  }

  function catName(id: number) { return categories.find(c => c.id === id)?.name || "—"; }
  const isPending = createItem.isPending || updateItem.isPending;

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: BG }}>
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="h-14 flex items-center justify-between px-6 border-b shrink-0" style={{ background: SURF, borderColor: BORD }}>
          <div className="font-bold text-base" style={{ color: TEXT }}>Menu Items</div>
          <div className="flex items-center gap-2">
            <Link href="/stock" className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border" style={{ background: "transparent", borderColor: BORD, color: TEXT }}><PackagePlus size={13} />Add Sales Stock</Link>
            <button onClick={() => exportToCSV("menu-items", sortedItems.map(m => ({
                Name: m.name, Code: m.code || "", Category: catName(m.categoryId),
                "Price (Dine In)": m.priceDineIn || m.price || 0,
                "Price (Takeaway)": m.priceTakeaway || 0,
                "Price (Delivery)": m.priceDelivery || 0,
                "Cost Price": m.costPrice || 0,
                Veg: m.isVeg ? "Yes" : "No", Beverage: m.isBeverage ? "Yes" : "No",
                Active: m.isActive ? "Yes" : "No",
              })))}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border"
              style={{ background: "transparent", borderColor: BORD, color: TEXT }}>
              <Download size={13} />Export
            </button>
            <button onClick={() => setShowUploadModal(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border"
              style={{ background: "transparent", borderColor: BORD, color: TEXT }}>
              <Upload size={13} />Upload Item
            </button>
            <button onClick={() => { resetForm(); setShowForm(true); }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={{ background: GOLD, color: "var(--color-surface)" }}>
              <Plus size={13} />Add Item
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Filters */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: DIM }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search items..."
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border outline-none"
                style={{ background: SURF, borderColor: BORD, color: TEXT }} />
            </div>
            <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
              className="px-3 py-2 text-sm rounded-lg border outline-none"
              style={{ background: SURF, borderColor: BORD, color: MUTED }}>
              <option value="all">All Categories</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* Stats */}
          <div className="flex gap-3 flex-wrap">
            {[
              { label: "Total Items", value: items.length, color: GOLD },
              { label: "Active", value: items.filter(m => m.isActive).length, color: "var(--color-success)" },
              { label: "Inactive", value: items.filter(m => !m.isActive).length, color: "var(--color-danger)" },
              { label: "Veg", value: items.filter(m => m.isVeg).length, color: "#4ADE80" },
              { label: "Beverage", value: items.filter(m => m.isBeverage).length, color: "var(--color-info)" },
              { label: "Promo", value: items.filter(m => m.isPromo).length, color: "var(--color-purple-light)" },
            ].map(s => (
              <div key={s.label} className="px-4 py-2.5 rounded-xl border" style={{ background: SURF, borderColor: BORD }}>
                <span className="text-base font-bold" style={{ color: s.color }}>{s.value}</span>
                <span className="text-xs ml-2" style={{ color: MUTED }}>{s.label}</span>
              </div>
            ))}
          </div>

          {/* Table */}
          <div className="rounded-2xl border overflow-hidden" style={{ background: SURF, borderColor: BORD }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: `1px solid ${BORD}` }}>
                  {([
                    { label: "Name", key: "name" },
                    { label: "Code", key: "code" },
                    { label: "Category", key: "category" },
                    { label: "Dine In", key: "priceDineIn" },
                    { label: "Takeaway", key: "priceTakeaway" },
                    { label: "Delivery", key: "priceDelivery" },
                    { label: "Margin", key: null },
                    { label: "Tags", key: null },
                    { label: "Active", key: null },
                    { label: "Actions", key: null },
                  ] as { label: string; key: ProdSortKey | null }[]).map(h => (
                    <th key={h.label}
                      className={`px-4 py-3 text-left text-xs font-semibold ${h.key ? "cursor-pointer select-none" : ""}`}
                      style={{ color: h.key && sortKey === h.key ? GOLD : DIM }}
                      onClick={() => h.key && handleSort(h.key)}
                    >
                      <span className="inline-flex items-center gap-1">
                        {h.label}
                        {h.key && (sortKey === h.key
                          ? (sortDir === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />)
                          : <ArrowUpDown size={11} style={{ opacity: 0.35 }} />)}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={10} className="text-center py-10 text-xs" style={{ color: DIM }}>Loading...</td></tr>
                ) : sortedItems.length === 0 ? (
                  <tr><td colSpan={10} className="text-center py-10 text-xs" style={{ color: DIM }}>No items found</td></tr>
                ) : sortedItems.map((m: any) => (
                  <tr key={m.id} className="border-t" style={{ borderColor: BORD }}>
                    <td className="px-4 py-3 text-xs font-medium" style={{ color: TEXT }}>{m.name}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: MUTED }}>{m.code || "—"}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: MUTED }}>{catName(m.categoryId)}</td>
                    <td className="px-4 py-3 text-xs font-semibold" style={{ color: GOLD }}>{Number(m.priceDineIn || m.price).toLocaleString()}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: MUTED }}>{Number(m.priceTakeaway || 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: MUTED }}>{Number(m.priceDelivery || 0).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <MarginBadge salePrice={Number(m.priceDineIn || m.price || 0)} costPrice={Number(m.costPrice || 0)} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {m.isVeg && <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: "rgba(74,222,128,0.15)", color: "#4ADE80" }}>Veg</span>}
                        {m.isBeverage && <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: "rgba(56,189,248,0.15)", color: "var(--color-info)" }}>Bev</span>}
                        {m.isPromo && <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: "rgba(167,139,250,0.15)", color: "var(--color-purple-light)" }}>Promo</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => toggleActive.mutate({ id: m.id, isActive: !m.isActive })}>
                        {m.isActive ? <ToggleRight size={20} color="var(--color-success)" /> : <ToggleLeft size={20} color={DIM} />}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => openEdit(m)} className="p-1 rounded" style={{ color: GOLD }}><Pencil size={13} /></button>
                        <button onClick={() => { if (confirm("Delete?")) deleteItem.mutate(m.id); }} className="p-1 rounded" style={{ color: "var(--color-danger)" }}><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Add/Edit Item Modal ─────────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.75)" }}>
          <div className="w-[680px] rounded-2xl border max-h-[92vh] overflow-y-auto" style={{ background: SURF, borderColor: BORD }}>
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: BORD }}>
              <span className="font-bold text-sm" style={{ color: TEXT }}>{editItem ? "Edit Food Menu" : "Add Food Menu"}</span>
              <button onClick={resetForm} style={{ color: DIM }}><X size={16} /></button>
            </div>

            <div className="p-6 space-y-4">
              {/* Row 1: Name + Code + Category */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <FLabel required>Name</FLabel>
                  <input value={form.name ?? ""} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                    placeholder="Name" className={inputCls} style={inputStyle()} />
                </div>
                <div>
                  <FLabel>Code</FLabel>
                  <input value={form.code ?? ""} onChange={e => setForm(p => ({ ...p, code: e.target.value }))}
                    placeholder="e.g. 142" className={inputCls} style={inputStyle()} />
                </div>
                <div>
                  <FLabel required>Category</FLabel>
                  <select value={form.categoryId || ""} onChange={e => setForm(p => ({ ...p, categoryId: e.target.value }))}
                    className={inputCls} style={inputStyle({ cursor: "pointer" })}>
                    <option value="">Select</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Row 2: Prices */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <FLabel required>Sale Price (Dine In) *</FLabel>
                  <input type="number" value={form.priceDineIn ?? ""}
                    onChange={e => { const v = e.target.value; setForm(p => ({ ...p, priceDineIn: v, priceTakeaway: v, priceDelivery: v })); }}
                    placeholder="0.00" className={inputCls} style={inputStyle()} />
                </div>
                <div>
                  <FLabel>Sale Price (Take Away)</FLabel>
                  <input type="number" value={form.priceTakeaway ?? ""}
                    onChange={e => setForm(p => ({ ...p, priceTakeaway: e.target.value }))}
                    placeholder="0.00" className={inputCls} style={inputStyle()} />
                </div>
                <div>
                  <FLabel>Sale Price (Delivery)</FLabel>
                  <input type="number" value={form.priceDelivery ?? ""}
                    onChange={e => setForm(p => ({ ...p, priceDelivery: e.target.value }))}
                    placeholder="0.00" className={inputCls} style={inputStyle()} />
                </div>
              </div>

              {/* Row 2b: Margin % + Margin Widget */}
              <div className="grid grid-cols-3 gap-3 items-start">
                <div>
                  <FLabel>Profit Margin (%)</FLabel>
                  <input type="number" min="0" max="100" value={form.marginPercent ?? ""}
                    onChange={e => setForm(p => ({ ...p, marginPercent: e.target.value }))}
                    placeholder="e.g. 65" className={inputCls} style={inputStyle()} />
                </div>
                <div className="col-span-2">
                  <div className="mt-5">
                    <MarginWidget salePrice={Number(form.priceDineIn) || 0} marginPct={Number(form.marginPercent) || 0} />
                  </div>
                </div>
              </div>

              {/* Row 3: Description + Image */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FLabel>Description</FLabel>
                  <input value={form.description ?? ""} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                    placeholder="Description" className={inputCls} style={inputStyle()} />
                </div>
                <div>
                  <FLabel>Item Image</FLabel>
                  <input ref={imgInputRef} type="file" accept="image/*" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); e.target.value = ""; }} />
                  <div className="flex items-center gap-2">
                    {form.imageUrl ? (
                      <div className="relative w-12 h-12 rounded-lg overflow-hidden border shrink-0" style={{ borderColor: BORD }}>
                        <img src={form.imageUrl} alt="" className="w-full h-full object-cover" />
                        <button onClick={() => setForm(p => ({ ...p, imageUrl: "" }))}
                          className="absolute top-0 right-0 bg-black/60 rounded-bl p-0.5" style={{ color: "#fff" }}>
                          <X size={10} />
                        </button>
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-lg border flex items-center justify-center shrink-0" style={{ borderColor: BORD, background: BG }}>
                        <ImageIcon size={18} style={{ color: DIM }} />
                      </div>
                    )}
                    <button type="button" disabled={imgUploading} onClick={() => imgInputRef.current?.click()}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border text-xs font-medium"
                      style={{ borderColor: BORD, color: imgUploading ? DIM : TEXT, background: BG }}>
                      <Upload size={12} />{imgUploading ? "Uploading..." : "Upload Image"}
                    </button>
                  </div>
                </div>
              </div>

              {/* Row 4: Tags + Loyalty + Sort */}
              <div className="grid grid-cols-4 gap-3 items-end">
                <div>
                  <FLabel>Veg Item</FLabel>
                  <button type="button" onClick={() => setForm(p => ({ ...p, isVeg: !p.isVeg }))}
                    className="w-full px-3 py-2 rounded-lg text-sm border font-medium"
                    style={{ borderColor: form.isVeg ? "#4ADE80" : BORD, color: form.isVeg ? "#4ADE80" : DIM, background: form.isVeg ? "rgba(74,222,128,0.1)" : BG }}>
                    <Leaf size={12} className="inline mr-1" />{form.isVeg ? "Yes" : "No"}
                  </button>
                </div>
                <div>
                  <FLabel>Beverage</FLabel>
                  <button type="button" onClick={() => setForm(p => ({ ...p, isBeverage: !p.isBeverage }))}
                    className="w-full px-3 py-2 rounded-lg text-sm border font-medium"
                    style={{ borderColor: form.isBeverage ? "var(--color-info)" : BORD, color: form.isBeverage ? "var(--color-info)" : DIM, background: form.isBeverage ? "rgba(56,189,248,0.1)" : BG }}>
                    <Coffee size={12} className="inline mr-1" />{form.isBeverage ? "Yes" : "No"}
                  </button>
                </div>
                <div>
                  <FLabel>Loyalty Point</FLabel>
                  <input type="number" value={form.loyaltyPoint ?? ""} onChange={e => setForm(p => ({ ...p, loyaltyPoint: e.target.value }))}
                    placeholder="0" className={inputCls} style={inputStyle()} />
                </div>
                <div>
                  <FLabel>Sort Order</FLabel>
                  <input type="number" value={form.sortOrder ?? ""} onChange={e => setForm(p => ({ ...p, sortOrder: e.target.value }))}
                    placeholder="0" className={inputCls} style={inputStyle()} />
                </div>
              </div>

              {/* ── Variations Section ──────────────────────────────────────── */}
              <div className="pt-2">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-bold" style={{ color: TEXT }}>Variation</span>
                  <button onClick={() => setShowVarModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                    style={{ background: PURPLE, color: "#fff" }}>
                    <Plus size={12} />Add Variation
                  </button>
                </div>

                {variations.length === 0 ? (
                  <div className="text-xs py-3 text-center rounded-lg border" style={{ color: DIM, borderColor: BORD }}>
                    No variations added
                  </div>
                ) : (
                  <div className="rounded-xl border overflow-hidden" style={{ borderColor: BORD }}>
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ borderBottom: `1px solid ${BORD}`, background: BG }}>
                          {["SN", "Variation Name", "Code", "Dine In", "Take Away", "Delivery", "Loyalty", ""].map(h => (
                            <th key={h} className="px-3 py-2 text-left font-semibold" style={{ color: DIM }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {variations.map((v: any, idx: number) => (
                          <tr key={v.id} className="border-t" style={{ borderColor: BORD }}>
                            <td className="px-3 py-2" style={{ color: MUTED }}>{idx + 1}</td>
                            <td className="px-3 py-2 font-medium" style={{ color: TEXT }}>{v.name}</td>
                            <td className="px-3 py-2" style={{ color: MUTED }}>{v.code || "—"}</td>
                            <td className="px-3 py-2" style={{ color: GOLD }}>{Number(v.priceDineIn).toLocaleString()}</td>
                            <td className="px-3 py-2" style={{ color: MUTED }}>{Number(v.priceTakeaway).toLocaleString()}</td>
                            <td className="px-3 py-2" style={{ color: MUTED }}>{Number(v.priceDelivery).toLocaleString()}</td>
                            <td className="px-3 py-2" style={{ color: MUTED }}>{v.loyaltyPoint || 0}</td>
                            <td className="px-3 py-2">
                              <button
                                onClick={() => {
                                  if (v._local) {
                                    setLocalVariations(lv => lv.filter((_, i) => i !== idx));
                                  } else {
                                    if (confirm("Delete variation?")) deleteVariation.mutate(v.id);
                                  }
                                }}
                                style={{ color: "var(--color-danger)" }}
                              >
                                <X size={12} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Footer buttons */}
              <div className="flex gap-3 pt-2">
                <button onClick={handleSubmit} disabled={isPending}
                  className="px-6 py-2.5 rounded-lg text-sm font-semibold"
                  style={{ background: PURPLE, color: "#fff" }}>
                  {isPending ? "Saving..." : "Submit"}
                </button>
                <button onClick={resetForm}
                  className="px-6 py-2.5 rounded-lg text-sm font-semibold"
                  style={{ background: BORD, color: MUTED }}>
                  Back
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Variation Modal ─────────────────────────────────────────────────── */}
      {showVarModal && (
        <VariationModal
          menuItemId={editItem?.id ?? null}
          nextCode={nextVarCode()}
          onClose={() => setShowVarModal(false)}
          onSaved={(v) => {
            if (!editItem?.id) setLocalVariations(lv => [...lv, v]);
            // for saved items it refetches via invalidation
          }}
        />
      )}

      {/* ── Upload Item Modal ───────────────────────────────────────────────── */}
      {showUploadModal && (
        <UploadItemModal
          branchId={branchId}
          categories={categories}
          onClose={() => setShowUploadModal(false)}
          onImported={() => { qc.invalidateQueries({ queryKey: ["products-menu", branchId] }); setShowUploadModal(false); }}
        />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  UPLOAD ITEM MODAL — Excel template/import + menu card image extraction
// ════════════════════════════════════════════════════════════════════════════
const DEFAULT_MARGIN_PCT = 30;

function UploadItemModal({ branchId, categories, onClose, onImported }: {
  branchId: number; categories: any[]; onClose: () => void; onImported: () => void;
}) {
  const [tab, setTab] = useState<"excel" | "image">("excel");
  type ParsedVariation = { name: string; price: number };
  type ParsedItem = { name: string; price: number; costPrice: number; categoryId?: number; categoryName?: string; variations?: ParsedVariation[] };
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const excelInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  async function downloadTemplate() {
    const XLSX = await import("xlsx");
    const rows = [
      { name: "Chicken Curry", category: categories[0]?.name || "Main Course", priceDineIn: 950, priceTakeaway: 900, priceDelivery: 1000, costPrice: 665 },
      { name: "Fried Rice", category: categories[0]?.name || "Rice & Noodles", priceDineIn: 650, priceTakeaway: 600, priceDelivery: 700, costPrice: 455 },
    ];
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Items");
    XLSX.writeFile(wb, "idine-item-upload-template.xlsx");
  }

  async function handleExcelFile(file: File) {
    setBusy(true); setError("");
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(ws);
      const items: ParsedItem[] = rows.map(r => {
        const price = Number(r.priceDineIn ?? r.price ?? 0);
        const cost = r.costPrice != null && r.costPrice !== "" ? Number(r.costPrice) : price * (1 - DEFAULT_MARGIN_PCT / 100);
        const cat = categories.find((c: any) => c.name?.toLowerCase() === String(r.category || "").toLowerCase());
        return { name: String(r.name || "").trim(), price, costPrice: cost, categoryId: cat?.id, categoryName: r.category ? String(r.category).trim() : undefined };
      }).filter(r => r.name && r.price > 0);
      if (items.length === 0) setError("No valid rows found. Make sure the file matches the template columns.");
      setParsedItems(items);
    } catch (e: any) {
      setError("Could not read this file. Please use the downloaded template.");
    } finally {
      setBusy(false);
    }
  }

  async function handleImageFile(file: File) {
    setBusy(true); setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/menu-extract?branchId=${branchId}`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { setError((data as any)?.error || "Extraction failed"); return; }
      const items: ParsedItem[] = ((data as any).items || []).map((i: any) => {
        const cat = categories.find((c: any) => c.name?.toLowerCase() === String(i.category || "").toLowerCase());
        if (Array.isArray(i.variations) && i.variations.length > 0) {
          const firstPrice = Number(i.variations[0]?.price || 0);
          return {
            name: i.name,
            price: firstPrice,
            costPrice: firstPrice * (1 - DEFAULT_MARGIN_PCT / 100),
            categoryId: cat?.id,
            categoryName: i.category,
            variations: i.variations.map((v: any) => ({ name: v.name, price: Number(v.price) })),
          };
        }
        return {
          name: i.name,
          price: Number(i.price),
          costPrice: Number(i.price) * (1 - DEFAULT_MARGIN_PCT / 100),
          categoryId: cat?.id,
          categoryName: i.category,
        };
      });
      if (items.length === 0) setError("No items detected in this image.");
      setParsedItems(items);
    } catch {
      setError("Extraction failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function updateParsed(idx: number, field: "price" | "costPrice", value: number) {
    setParsedItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  }

  async function resolveCategoryId(name: string | undefined, cache: Map<string, number>): Promise<number | undefined> {
    if (!name) return undefined;
    const key = name.toLowerCase();
    if (cache.has(key)) return cache.get(key);
    const existing = categories.find((c: any) => c.name?.toLowerCase() === key);
    if (existing) { cache.set(key, existing.id); return existing.id; }
    const res = await api.categories.$post({ json: { branchId, name, isActive: true } as any });
    const created = await res.json() as any;
    const id = created?.category?.id;
    if (id) cache.set(key, id);
    return id;
  }

  async function importAll() {
    setImporting(true);
    const catCache = new Map<string, number>();
    try {
      for (const item of parsedItems) {
        const categoryId = item.categoryId ?? await resolveCategoryId(item.categoryName, catCache);
        const created = await api["menu-items"].$post({
          json: {
            branchId,
            name: item.name,
            price: item.price,
            priceDineIn: item.price,
            priceTakeaway: item.price,
            priceDelivery: item.price,
            costPrice: item.costPrice,
            categoryId,
            isActive: true,
          } as any,
        });
        if (item.variations && item.variations.length > 0) {
          const createdItem = await created.json() as any;
          const menuItemId = createdItem?.menuItem?.id;
          if (menuItemId) {
            for (const v of item.variations) {
              await api.variations.$post({
                json: {
                  menuItemId,
                  name: v.name,
                  priceDineIn: v.price,
                  priceTakeaway: v.price,
                  priceDelivery: v.price,
                  isActive: true,
                } as any,
              });
            }
          }
        }
      }
      onImported();
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "#00000099" }}>
      <div className="rounded-2xl border shadow-2xl flex flex-col" style={{ background: SURF, borderColor: BORD, width: "min(760px, 94vw)", maxHeight: "90vh" }}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: BORD }}>
          <span className="font-bold text-sm" style={{ color: TEXT }}>Upload Item</span>
          <button onClick={onClose} style={{ color: MUTED }}><X size={16} /></button>
        </div>

        <div className="flex border-b" style={{ borderColor: BORD }}>
          {[{ id: "excel" as const, label: "Excel Upload" }, { id: "image" as const, label: "Menu Card Image" }].map(t => (
            <button key={t.id} onClick={() => { setTab(t.id); setParsedItems([]); setError(""); }}
              className="px-5 py-2.5 text-xs font-semibold"
              style={{ color: tab === t.id ? GOLD : DIM, borderBottom: tab === t.id ? `2px solid ${GOLD}` : "2px solid transparent" }}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {tab === "excel" ? (
            <>
              <div className="rounded-lg border p-4 flex items-center justify-between" style={{ borderColor: BORD, background: BG }}>
                <div>
                  <div className="text-sm font-semibold" style={{ color: TEXT }}>1. Download the template</div>
                  <div className="text-xs mt-0.5" style={{ color: DIM }}>Fill in name, category, prices and (optionally) cost — then upload it back below.</div>
                </div>
                <button onClick={downloadTemplate}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0"
                  style={{ background: BORD, color: TEXT }}>
                  Download .xlsx
                </button>
              </div>
              <div className="rounded-lg border p-4" style={{ borderColor: BORD, background: BG }}>
                <div className="text-sm font-semibold mb-2" style={{ color: TEXT }}>2. Upload the filled file</div>
                <input ref={excelInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                  onChange={e => e.target.files?.[0] && handleExcelFile(e.target.files[0])} />
                <button onClick={() => excelInputRef.current?.click()} disabled={busy}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                  style={{ background: GOLD, color: "var(--color-surface)" }}>
                  {busy ? "Reading…" : "Choose Excel File"}
                </button>
              </div>
            </>
          ) : (
            <div className="rounded-lg border p-4" style={{ borderColor: BORD, background: BG }}>
              <div className="text-sm font-semibold mb-1" style={{ color: TEXT }}>Upload a photo of your menu card</div>
              <div className="text-xs mb-3" style={{ color: DIM }}>
                We'll extract item names and prices automatically. Default profit margin is set to {DEFAULT_MARGIN_PCT}% — you can edit each item's cost below before importing.
              </div>
              <input ref={imageInputRef} type="file" accept="image/*" className="hidden"
                onChange={e => e.target.files?.[0] && handleImageFile(e.target.files[0])} />
              <button onClick={() => imageInputRef.current?.click()} disabled={busy}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                style={{ background: GOLD, color: "var(--color-surface)" }}>
                {busy ? "Analyzing…" : "Choose Menu Image"}
              </button>
            </div>
          )}

          {error && (
            <div className="text-xs px-3 py-2 rounded-lg" style={{ background: "var(--color-danger)22", color: "var(--color-danger)" }}>{error}</div>
          )}

          {parsedItems.length > 0 && (
            <div className="rounded-lg border overflow-hidden" style={{ borderColor: BORD }}>
              <div className="px-3 py-2 text-xs font-semibold border-b" style={{ borderColor: BORD, background: BG, color: TEXT }}>
                Preview — {parsedItems.length} item{parsedItems.length !== 1 ? "s" : ""} found
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: BG }}>
                    <th className="text-left px-3 py-2" style={{ color: DIM }}>Category</th>
                    <th className="text-left px-3 py-2" style={{ color: DIM }}>Name</th>
                    <th className="text-right px-3 py-2" style={{ color: DIM }}>Price / Variations</th>
                    <th className="text-right px-3 py-2" style={{ color: DIM }}>Cost (edit)</th>
                    <th className="text-right px-3 py-2" style={{ color: DIM }}>Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedItems.map((it, i) => (
                    <tr key={i} className="border-t" style={{ borderColor: BORD }}>
                      <td className="px-3 py-1.5" style={{ color: DIM }}>{it.categoryName || "—"}</td>
                      <td className="px-3 py-1.5" style={{ color: TEXT }}>{it.name}</td>
                      <td className="px-3 py-1.5 text-right">
                        {it.variations && it.variations.length > 0 ? (
                          <div className="flex flex-col items-end gap-0.5">
                            {it.variations.map((v, vi) => (
                              <span key={vi} style={{ color: TEXT }}>{v.name}: {v.price.toFixed(2)}</span>
                            ))}
                          </div>
                        ) : (
                          <input type="number" value={it.price} onChange={e => updateParsed(i, "price", Number(e.target.value))}
                            className="w-20 text-right rounded px-1.5 py-0.5 border outline-none" style={{ borderColor: BORD, background: BG, color: TEXT }} />
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <input type="number" value={it.costPrice.toFixed(2)} onChange={e => updateParsed(i, "costPrice", Number(e.target.value))}
                          className="w-20 text-right rounded px-1.5 py-0.5 border outline-none" style={{ borderColor: BORD, background: BG, color: TEXT }} />
                      </td>
                      <td className="px-3 py-1.5 text-right font-semibold" style={{ color: "var(--color-success)" }}>
                        {it.price > 0 ? `${(((it.price - it.costPrice) / it.price) * 100).toFixed(0)}%` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3.5 border-t" style={{ borderColor: BORD }}>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-xs" style={{ background: BORD, color: MUTED }}>Cancel</button>
          <button onClick={importAll} disabled={parsedItems.length === 0 || importing}
            className="px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-40"
            style={{ background: "var(--color-success)", color: "#fff" }}>
            {importing ? "Importing…" : `Import ${parsedItems.length || ""} Item${parsedItems.length !== 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
