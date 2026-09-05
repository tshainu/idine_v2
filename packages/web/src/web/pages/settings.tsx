import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { getBranchId } from "../lib/store";
import { Sidebar } from "../components/layout/sidebar";
import { Save, CheckCircle, HelpCircle, ChevronRight, ImageIcon, Upload, X } from "lucide-react";
import { useLocation } from "wouter";

const GOLD = "var(--color-gold)";
const BG = "var(--color-bg)";
const SURF = "var(--color-surface)";
const BORD = "var(--color-border)";
const MUTED = "var(--color-text-muted)";
const DIM = "var(--color-text-dim)";
const TEXT = "var(--color-text)";
const PURPLE = "var(--color-purple)";

function Label({ children, required, help }: { children: React.ReactNode; required?: boolean; help?: string }) {
  return (
    <div className="flex items-center gap-1 mb-1.5">
      <span className="text-xs font-medium" style={{ color: MUTED }}>{children}</span>
      {required && <span className="text-red-400 text-xs">*</span>}
      {help && <HelpCircle size={11} style={{ color: DIM }} title={help} />}
    </div>
  );
}

const inputCls = "w-full px-3 py-2 text-sm rounded-lg border outline-none transition-colors";
const inputStyle = { background: BG, borderColor: BORD, color: TEXT } as React.CSSProperties;

function Input({ ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={inputCls} style={inputStyle} {...props} />;
}

function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={inputCls} style={{ ...inputStyle, cursor: "pointer" }} {...props}>
      {children}
    </select>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-4 gap-4 mb-5">{children}</div>;
}

function Field({ label, required, help, children }: { label: string; required?: boolean; help?: string; children: React.ReactNode }) {
  return (
    <div>
      <Label required={required} help={help}>{label}</Label>
      {children}
    </div>
  );
}

// Sub-page: Outlet Setting
function OutletSetting({ onBack }: { onBack: () => void }) {
  const branchId = getBranchId();
  const qc = useQueryClient();
  const [saved, setSaved] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [headerPreview, setHeaderPreview] = useState<string | null>(null);
  const [headerUploading, setHeaderUploading] = useState(false);
  const headerInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    outletName: "",
    phone: "",
    email: "",
    address: "",
    cashier: "",
  });

  // Load branch data
  const { data: branchData } = useQuery({
    queryKey: ["branches", branchId],
    queryFn: async () => (await api.branches[":id"].$get({ param: { id: String(branchId) } })).json(),
  });
  useEffect(() => {
    const b = (branchData as any)?.branch;
    if (b) setForm(f => ({ ...f, outletName: b.name || "", address: b.address || "" }));
  }, [branchData]);

  // Load settings (for logo + phone/email)
  const { data: settingsData } = useQuery({
    queryKey: ["settings", branchId],
    queryFn: async () => (await api.settings.$get({ query: { branchId: String(branchId) } })).json(),
  });
  useEffect(() => {
    const s = (settingsData as any)?.settings as Record<string, string> | undefined;
    if (!s) return;
    if (s.outletPhone) setForm(f => ({ ...f, phone: s.outletPhone }));
    if (s.outletEmail) setForm(f => ({ ...f, email: s.outletEmail }));
    if (s.outletCashier) setForm(f => ({ ...f, cashier: s.outletCashier }));
    if (s.outletLogo) setLogoPreview(s.outletLogo);
    if (s.invoiceLogo) setLogoPreview(s.invoiceLogo);
    if (s.invoiceHeader) setHeaderPreview(s.invoiceHeader);
  }, [settingsData]);

  const { data: usersData } = useQuery({
    queryKey: ["users", branchId],
    queryFn: async () => (await api.users.$get({ query: { branchId: String(branchId) } })).json(),
  });
  const users: any[] = (usersData as any)?.users || [];

  const updateBranch = useMutation({
    mutationFn: async (data: any) => (await api.branches[":id"].$patch({ param: { id: String(branchId) }, json: data })).json(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["branches"] }); },
  });

  const saveSettings = useMutation({
    mutationFn: async (kv: Record<string, string>) =>
      (await api.settings.$post({ json: { branchId, settings: kv } })).json(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings", branchId] });
      setSaved(true);
      setTimeout(() => { setSaved(false); onBack(); }, 1200);
    },
  });

  function set(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value }));
  }

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setLogoUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const json = await res.json() as any;
      if (json.url) setLogoPreview(json.url);
    } finally {
      setLogoUploading(false);
    }
  }

  async function handleHeaderChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setHeaderUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const json = await res.json() as any;
      if (json.url) setHeaderPreview(json.url);
    } finally {
      setHeaderUploading(false);
    }
  }

  async function handleSubmit() {
    updateBranch.mutate({ name: form.outletName, address: form.address });
    const kv: Record<string, string> = {
      outletPhone: form.phone,
      outletEmail: form.email,
      outletCashier: form.cashier,
      outletAddress: form.address,
    };
    if (logoPreview) { kv.outletLogo = logoPreview; kv.invoiceLogo = logoPreview; }
    if (headerPreview) kv.invoiceHeader = headerPreview;
    else kv.invoiceHeader = "";
    saveSettings.mutate(kv);
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="rounded-2xl border overflow-hidden" style={{ background: SURF, borderColor: BORD }}>
        <div className="px-6 py-5 border-b" style={{ borderColor: BORD }}>
          <h2 className="text-xl font-bold" style={{ color: TEXT }}>Outlet Setting</h2>
        </div>
        <div className="p-6 space-y-5">
          {/* Logo upload */}
          <Field label="Outlet Logo">
            <div className="flex items-center gap-4">
              {logoPreview ? (
                <div className="relative w-16 h-16 rounded-xl overflow-hidden border shrink-0" style={{ borderColor: BORD, background: BG }}>
                  <img src={logoPreview} alt="Logo" className="w-full h-full object-contain" />
                  <button onClick={() => setLogoPreview(null)}
                    className="absolute top-0.5 right-0.5 bg-black/70 rounded p-0.5" style={{ color: "#fff" }}>
                    <X size={10} />
                  </button>
                </div>
              ) : (
                <div className="w-16 h-16 rounded-xl flex items-center justify-center border shrink-0" style={{ borderColor: BORD, background: BG }}>
                  <ImageIcon size={20} style={{ color: DIM }} />
                </div>
              )}
              <input ref={logoInputRef} type="file" className="hidden" accept="image/*" onChange={handleLogoChange} />
              <button type="button" disabled={logoUploading} onClick={() => logoInputRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2 text-xs rounded-lg border font-medium"
                style={{ borderColor: BORD, color: logoUploading ? DIM : MUTED, background: BG }}>
                <Upload size={12} />
                {logoUploading ? "Uploading…" : "Upload Logo"}
              </button>
              {logoPreview && (
                <span className="text-xs" style={{ color: "var(--color-success)" }}>✓ Uploaded</span>
              )}
            </div>
          </Field>

          {/* Invoice Header upload */}
          <Field label="Invoice Header Image" help="Wide banner image shown at the top of printed invoices & bills. If not set, restaurant info will appear as text instead.">
            <div className="flex items-center gap-4">
              {headerPreview ? (
                <div className="relative rounded-xl overflow-hidden border shrink-0" style={{ borderColor: BORD, background: BG, width: 180, height: 52 }}>
                  <img src={headerPreview} alt="Invoice Header" className="w-full h-full object-contain" />
                  <button onClick={() => setHeaderPreview(null)}
                    className="absolute top-0.5 right-0.5 bg-black/70 rounded p-0.5" style={{ color: "#fff" }}>
                    <X size={10} />
                  </button>
                </div>
              ) : (
                <div className="rounded-xl flex items-center justify-center border shrink-0" style={{ borderColor: BORD, background: BG, width: 180, height: 52 }}>
                  <span className="text-xs" style={{ color: DIM }}>No header image</span>
                </div>
              )}
              <input ref={headerInputRef} type="file" className="hidden" accept="image/*" onChange={handleHeaderChange} />
              <div className="flex flex-col gap-1.5">
                <button type="button" disabled={headerUploading} onClick={() => headerInputRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2 text-xs rounded-lg border font-medium"
                  style={{ borderColor: BORD, color: headerUploading ? DIM : MUTED, background: BG }}>
                  <Upload size={12} />
                  {headerUploading ? "Uploading…" : headerPreview ? "Change Header" : "Upload Header"}
                </button>
                <span className="text-[11px]" style={{ color: DIM }}>Recommended: 576×120px, PNG/JPG</span>
              </div>
              {headerPreview && (
                <span className="text-xs" style={{ color: "var(--color-success)" }}>✓ Uploaded</span>
              )}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Outlet Name" required>
              <Input value={form.outletName} onChange={set("outletName")} />
            </Field>
            <Field label="Phone" required>
              <Input value={form.phone} onChange={set("phone")} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Email">
              <Input type="email" value={form.email} onChange={set("email")} />
            </Field>
            <Field label="Address" required>
              <Input value={form.address} onChange={set("address")} />
            </Field>
          </div>
          <Field label="Online/Self Order Receiving Cashier">
            <Select value={form.cashier} onChange={set("cashier")}>
              <option value="">Select</option>
              {users.map((u: any) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </Select>
          </Field>
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleSubmit}
              disabled={updateBranch.isPending || saveSettings.isPending}
              className="px-6 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50"
              style={{ background: saved ? "var(--color-success)" : PURPLE, color: "#fff" }}
            >
              {saved ? "Saved!" : (updateBranch.isPending || saveSettings.isPending) ? "Saving…" : "Submit"}
            </button>
            <button
              onClick={onBack}
              className="px-6 py-2.5 rounded-lg text-sm font-semibold"
              style={{ background: PURPLE + "99", color: "#fff" }}
            >
              Back
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Sub-page: Payment Methods
function PaymentMethods({ onBack }: { onBack: () => void }) {
  const branchId = getBranchId();
  const qc = useQueryClient();
  const DEFAULT = ["Cash", "Card", "Online Transfer", "Bank Transfer"];
  const [methods, setMethods] = useState<{ name: string; active: boolean }[]>(
    DEFAULT.map(n => ({ name: n, active: n === "Cash" || n === "Card" }))
  );
  const [newName, setNewName] = useState("");
  const [saved, setSaved] = useState(false);

  const { data: settingsData } = useQuery({
    queryKey: ["settings", branchId],
    queryFn: async () => (await api.settings.$get({ query: { branchId: String(branchId) } })).json(),
  });
  useEffect(() => {
    const r = (settingsData as any)?.settings as Record<string, string> | undefined;
    if (r?.paymentMethods) { try { const v = JSON.parse(r.paymentMethods); if (Array.isArray(v) && v.length) setMethods(v); } catch {} }
  }, [settingsData]);

  const save = useMutation({
    mutationFn: async () => (await api.settings.$post({ json: { branchId, settings: { paymentMethods: JSON.stringify(methods) } } })).json(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["settings", branchId] }); setSaved(true); setTimeout(() => { setSaved(false); onBack(); }, 1200); },
  });

  function toggle(idx: number) {
    setMethods(prev => prev.map((m, i) => i === idx ? { ...m, active: !m.active } : m));
  }
  function addMethod() {
    const name = newName.trim();
    if (!name || methods.find(m => m.name.toLowerCase() === name.toLowerCase())) return;
    setMethods(prev => [...prev, { name, active: true }]);
    setNewName("");
  }
  function removeMethod(idx: number) {
    setMethods(prev => prev.filter((_, i) => i !== idx));
  }
  function handleSave() { save.mutate(); }

  return (
    <div className="max-w-xl mx-auto">
      <div className="rounded-2xl border overflow-hidden" style={{ background: SURF, borderColor: BORD }}>
        <div className="px-6 py-5 border-b" style={{ borderColor: BORD }}>
          <h2 className="text-xl font-bold" style={{ color: TEXT }}>Payment Methods</h2>
          <p className="text-xs mt-1" style={{ color: MUTED }}>Enable or disable payment methods shown at checkout.</p>
        </div>
        <div className="p-6 space-y-3">
          {methods.map((m, idx) => (
            <div key={m.name} className="flex items-center justify-between px-4 py-3 rounded-xl border" style={{ borderColor: BORD, background: BG }}>
              <span className="text-sm font-medium" style={{ color: TEXT }}>{m.name}</span>
              <div className="flex items-center gap-3">
                <button onClick={() => toggle(idx)}
                  className="text-xs px-2.5 py-1 rounded-full font-medium transition-all"
                  style={{ background: m.active ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)", color: m.active ? "#4ADE80" : "#F87171" }}>
                  {m.active ? "Active" : "Disabled"}
                </button>
                <button onClick={() => removeMethod(idx)} className="text-xs" style={{ color: "var(--color-danger)" }}>✕</button>
              </div>
            </div>
          ))}
          {/* Add new */}
          <div className="flex gap-2 mt-4">
            <input
              value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addMethod()}
              placeholder="Add payment method..."
              className="flex-1 px-3 py-2 rounded-lg border text-sm outline-none"
              style={{ background: BG, borderColor: BORD, color: TEXT }}
            />
            <button onClick={addMethod} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: GOLD, color: "var(--color-surface)" }}>Add</button>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={handleSave} className="px-6 py-2.5 rounded-lg text-sm font-semibold" style={{ background: PURPLE, color: "#fff" }}>{saved ? "Saved!" : "Save"}</button>
            <button onClick={onBack} className="px-6 py-2.5 rounded-lg text-sm font-semibold" style={{ background: PURPLE + "99", color: "#fff" }}>Back</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// A printer is "network" when the server prints to it directly over TCP.
// Legacy rows were saved as "lan"/"usb" before the Windows-vs-Network choice existed.
function isNet(connection?: string | null): boolean {
  return connection === "network" || connection === "lan";
}

// Sub-page: Printer Setup
function PrinterSetup({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<"invoice" | "bill" | "kot" | "kot2" | "kot3" | "kot4" | "manage">("invoice");
  const branchId = getBranchId();
  const qc = useQueryClient();
  const [saved, setSaved] = useState(false);
  const [cfg, setCfg] = useState<Record<string, { printerId: string; paper: string }>>({
    invoice: { printerId: "", paper: "80mm" },
    bill:    { printerId: "", paper: "80mm" },
    kot:     { printerId: "", paper: "80mm" }, // KOT 1 (legacy key — kept so old saved setups still load)
    kot2:    { printerId: "", paper: "80mm" },
    kot3:    { printerId: "", paper: "80mm" },
    kot4:    { printerId: "", paper: "80mm" },
  });
  // printerCategories: { [printerId: string]: number[] }
  const [printerCategories, setPrinterCategories] = useState<Record<string, number[]>>({});

  // Manage Printers state
  const emptyPrinter = { name: "", type: "kot", connection: "network", ipAddress: "", port: 9100 };
  const [showAdd, setShowAdd] = useState(false);
  const [newPrinter, setNewPrinter] = useState<typeof emptyPrinter>({ ...emptyPrinter });
  const [newPrinterCats, setNewPrinterCats] = useState<number[]>([]);
  const [editId, setEditId] = useState<number | null>(null);
  const [editData, setEditData] = useState<typeof emptyPrinter>({ ...emptyPrinter });
  const [editCats, setEditCats] = useState<number[]>([]);

  const { data: printersData } = useQuery({
    queryKey: ["printers", branchId],
    queryFn: async () => (await api.printers.$get({ query: { branchId: String(branchId) } })).json(),
  });
  const { data: categoriesData } = useQuery({
    queryKey: ["categories", branchId],
    queryFn: async () => (await api.categories.$get({ query: { branchId: String(branchId) } })).json(),
  });
  const { data: settingsData } = useQuery({
    queryKey: ["settings", branchId],
    queryFn: async () => (await api.settings.$get({ query: { branchId: String(branchId) } })).json(),
  });
  useEffect(() => {
    const r = (settingsData as any)?.settings as Record<string, string> | undefined;
    if (r?.printerSetup) {
      try {
        const parsed = JSON.parse(r.printerSetup);
        setCfg(c => ({ ...c, ...parsed }));
        if (parsed.printerCategories) setPrinterCategories(parsed.printerCategories);
      } catch {}
    }
  }, [settingsData]);
  const save = useMutation({
    mutationFn: async () => (await api.settings.$post({ json: { branchId, settings: { printerSetup: JSON.stringify({ ...cfg, printerCategories }) } } })).json(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["settings", branchId] }); setSaved(true); setTimeout(() => { setSaved(false); onBack(); }, 1200); },
  });

  const addPrinter = useMutation({
    mutationFn: async ({ data, cats }: { data: typeof emptyPrinter; cats: number[] }) =>
      (await api.printers.$post({ json: { ...data, branchId, port: Number(data.port), isActive: true } })).json(),
    onSuccess: (res: any, vars) => {
      const newId = String(res?.printer?.id);
      if (newId) setPrinterCategories(pc => ({ ...pc, [newId]: vars.cats }));
      qc.invalidateQueries({ queryKey: ["printers", branchId] });
      setShowAdd(false);
      setNewPrinter({ ...emptyPrinter });
      setNewPrinterCats([]);
    },
  });
  const updatePrinter = useMutation({
    mutationFn: async ({ id, data, cats }: { id: number; data: typeof emptyPrinter; cats: number[] }) =>
      (await (api.printers as any)[":id"].$patch({ param: { id: String(id) }, json: { ...data, port: Number(data.port) } })).json(),
    onSuccess: (_res: any, vars) => {
      setPrinterCategories(pc => ({ ...pc, [String(vars.id)]: vars.cats }));
      qc.invalidateQueries({ queryKey: ["printers", branchId] });
      setEditId(null);
    },
  });
  const deletePrinter = useMutation({
    mutationFn: async (id: number) =>
      (await (api.printers as any)[":id"].$delete({ param: { id: String(id) } })).json(),
    onSuccess: (_res: any, id: number) => {
      setPrinterCategories(pc => { const n = { ...pc }; delete n[String(id)]; return n; });
      qc.invalidateQueries({ queryKey: ["printers", branchId] });
    },
  });

  function toggleCat(cats: number[], id: number): number[] {
    return cats.includes(id) ? cats.filter(c => c !== id) : [...cats, id];
  }

  // Returns set of category IDs already claimed by other printers (excludes `excludePrinterId`)
  function takenBy(excludePrinterId: string | null): Set<number> {
    const taken = new Set<number>();
    Object.entries(printerCategories).forEach(([pid, cats]) => {
      if (pid !== excludePrinterId) cats.forEach(id => taken.add(id));
    });
    return taken;
  }

  const allCategories: any[] = (categoriesData as any)?.categories?.filter((c: any) => c.isActive) || [];

  function setField(key: "printerId" | "paper", value: string) {
    setCfg(c => ({ ...c, [tab]: { ...c[tab], [key]: value } }));
  }
  const printers: any[] = (printersData as any)?.printers || [];
  const tabs = [
    { id: "invoice" as const, label: "Invoice Printer" },
    { id: "bill" as const, label: "Bill Printer" },
    { id: "kot" as const, label: "KOT Printer 1" },
    { id: "kot2" as const, label: "KOT Printer 2" },
    { id: "kot3" as const, label: "KOT Printer 3" },
    { id: "kot4" as const, label: "KOT Printer 4" },
    { id: "manage" as const, label: "Manage Printers" },
  ];

  const inputCls = "w-full px-3 py-2 rounded-lg text-sm border outline-none";
  const inputStyle = { background: BG, borderColor: BORD, color: TEXT };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="rounded-2xl border overflow-hidden" style={{ background: SURF, borderColor: BORD }}>
        <div className="px-6 py-5 border-b" style={{ borderColor: BORD }}>
          <h2 className="text-xl font-bold" style={{ color: TEXT }}>Printer Setup</h2>
        </div>
        <div className="flex border-b overflow-x-auto" style={{ borderColor: BORD }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="px-5 py-3 text-xs font-semibold transition-all whitespace-nowrap"
              style={{ color: tab === t.id ? GOLD : DIM, borderBottom: tab === t.id ? `2px solid ${GOLD}` : "2px solid transparent" }}>
              {t.label}
            </button>
          ))}
        </div>

        {tab !== "manage" ? (
          <div className="p-6 space-y-4">
            <Field label="Select Printer">
              <Select value={cfg[tab]?.printerId ?? ""} onChange={e => setField("printerId", e.target.value)}>
                <option value="">— None —</option>
                {printers.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.type})</option>
                ))}
              </Select>
            </Field>
            <Field label="Paper Size">
              <Select value={cfg[tab]?.paper ?? "80mm"} onChange={e => setField("paper", e.target.value)}>
                <option value="80mm">80mm</option>
                <option value="58mm">58mm</option>
              </Select>
            </Field>
            <div className="flex gap-3 pt-2">
              <button onClick={() => save.mutate()} disabled={save.isPending} className="px-6 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50" style={{ background: saved ? "var(--color-success)" : PURPLE, color: "#fff" }}>{saved ? "Saved!" : save.isPending ? "Saving…" : "Save"}</button>
              <button onClick={onBack} className="px-6 py-2.5 rounded-lg text-sm font-semibold" style={{ background: PURPLE + "99", color: "#fff" }}>Back</button>
            </div>
          </div>
        ) : (
          <div className="p-6 space-y-4">
            {/* Printer list */}
            {printers.length === 0 && !showAdd && (
              <div className="text-sm py-4 text-center" style={{ color: DIM }}>No printers configured yet.</div>
            )}
            {printers.map((p: any) => (
              <div key={p.id} className="rounded-xl border p-4" style={{ borderColor: BORD, background: BG }}>
                {editId === p.id ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="text-xs mb-1" style={{ color: DIM }}>Name</div>
                        <input className={inputCls} style={inputStyle} value={editData.name} onChange={e => setEditData(d => ({ ...d, name: e.target.value }))} />
                      </div>
                      <div>
                        <div className="text-xs mb-1" style={{ color: DIM }}>Type</div>
                        <select className={inputCls} style={inputStyle} value={editData.type} onChange={e => setEditData(d => ({ ...d, type: e.target.value }))}>
                          <option value="kot">KOT</option>
                          <option value="bill">Bill</option>
                          <option value="invoice">Invoice</option>
                        </select>
                      </div>
                      <div>
                        <div className="text-xs mb-1" style={{ color: DIM }}>Connection</div>
                        <select className={inputCls} style={inputStyle} value={editData.connection} onChange={e => setEditData(d => ({ ...d, connection: e.target.value }))}>
                          <option value="network">Network print (direct, no dialog)</option>
                          <option value="windows">Windows print (via browser)</option>
                        </select>
                      </div>
                      {isNet(editData.connection) && (
                        <>
                          <div>
                            <div className="text-xs mb-1" style={{ color: DIM }}>IP Address</div>
                            <input className={inputCls} style={inputStyle} value={editData.ipAddress} placeholder="192.168.1.100" onChange={e => setEditData(d => ({ ...d, ipAddress: e.target.value }))} />
                          </div>
                          <div>
                            <div className="text-xs mb-1" style={{ color: DIM }}>Port</div>
                            <input className={inputCls} style={inputStyle} type="number" value={editData.port} onChange={e => setEditData(d => ({ ...d, port: Number(e.target.value) }))} />
                          </div>
                        </>
                      )}
                    </div>
                    {allCategories.length > 0 && (
                      <>
                        <div className="border-t pt-3" style={{ borderColor: BORD }}>
                          <div className="text-xs font-semibold mb-2" style={{ color: DIM }}>Print Categories</div>
                          <div className="flex flex-wrap gap-2">
                            {allCategories.map((cat: any) => {
                              const sel = editCats.includes(cat.id);
                              const taken = !sel && takenBy(String(p.id)).has(cat.id);
                              return (
                                <button key={cat.id} type="button"
                                  disabled={taken}
                                  onClick={() => !taken && setEditCats(c => toggleCat(c, cat.id))}
                                  className="px-3 py-1 rounded-full text-xs font-medium transition-all"
                                  style={{
                                    background: sel ? PURPLE : "transparent",
                                    color: sel ? "#fff" : taken ? BORD : DIM,
                                    border: `1.5px solid ${sel ? PURPLE : taken ? BORD : BORD}`,
                                    opacity: taken ? 0.4 : 1,
                                    cursor: taken ? "not-allowed" : "pointer",
                                    textDecoration: taken ? "line-through" : "none",
                                  }}>
                                  {cat.name}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </>
                    )}
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => updatePrinter.mutate({ id: p.id, data: editData, cats: editCats })} disabled={updatePrinter.isPending} className="px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-50" style={{ background: PURPLE, color: "#fff" }}>
                        {updatePrinter.isPending ? "Saving…" : "Save"}
                      </button>
                      <button onClick={() => setEditId(null)} className="px-4 py-2 rounded-lg text-xs font-semibold" style={{ background: BORD, color: TEXT }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-semibold" style={{ color: TEXT }}>{p.name}</div>
                        <div className="text-xs mt-0.5" style={{ color: DIM }}>
                          {p.type?.toUpperCase()} · {isNet(p.connection) ? `Network ${p.ipAddress}:${p.port}` : "Windows printer"}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => { setEditId(p.id); setEditData({ name: p.name, type: p.type, connection: isNet(p.connection) ? "network" : "windows", ipAddress: p.ipAddress || "", port: p.port || 9100 }); setEditCats(printerCategories[String(p.id)] || []); }}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: PURPLE + "33", color: PURPLE }}>Edit</button>
                        <button onClick={() => { if (confirm(`Delete printer "${p.name}"?`)) deletePrinter.mutate(p.id); }}
                          disabled={deletePrinter.isPending}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50" style={{ background: "var(--color-danger)22", color: "var(--color-danger)" }}>Delete</button>
                      </div>
                    </div>
                    {(() => {
                      const cats = (printerCategories[String(p.id)] || [])
                        .map((cid: number) => allCategories.find((c: any) => c.id === cid)?.name)
                        .filter(Boolean);
                      return cats.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t" style={{ borderColor: BORD }}>
                          {cats.map((name: string) => (
                            <span key={name} className="px-2.5 py-0.5 rounded-full text-xs font-medium"
                              style={{ background: PURPLE + "22", color: PURPLE, border: `1px solid ${PURPLE}44` }}>
                              {name}
                            </span>
                          ))}
                        </div>
                      ) : null;
                    })()}
                  </div>
                )}
              </div>
            ))}

            {/* Add new printer form */}
            {showAdd ? (
              <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: GOLD + "66", background: BG }}>
                <div className="text-sm font-semibold" style={{ color: GOLD }}>New Printer</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs mb-1" style={{ color: DIM }}>Name</div>
                    <input className={inputCls} style={inputStyle} value={newPrinter.name} placeholder="e.g. Kitchen Printer" onChange={e => setNewPrinter(d => ({ ...d, name: e.target.value }))} />
                  </div>
                  <div>
                    <div className="text-xs mb-1" style={{ color: DIM }}>Type</div>
                    <select className={inputCls} style={inputStyle} value={newPrinter.type} onChange={e => setNewPrinter(d => ({ ...d, type: e.target.value }))}>
                      <option value="kot">KOT</option>
                      <option value="bill">Bill</option>
                      <option value="invoice">Invoice</option>
                    </select>
                  </div>
                  <div>
                    <div className="text-xs mb-1" style={{ color: DIM }}>Connection</div>
                    <select className={inputCls} style={inputStyle} value={newPrinter.connection} onChange={e => setNewPrinter(d => ({ ...d, connection: e.target.value }))}>
                      <option value="network">Network print (direct, no dialog)</option>
                      <option value="windows">Windows print (via browser)</option>
                    </select>
                  </div>
                  {isNet(newPrinter.connection) && (
                    <>
                      <div>
                        <div className="text-xs mb-1" style={{ color: DIM }}>IP Address</div>
                        <input className={inputCls} style={inputStyle} value={newPrinter.ipAddress} placeholder="192.168.1.100" onChange={e => setNewPrinter(d => ({ ...d, ipAddress: e.target.value }))} />
                      </div>
                      <div>
                        <div className="text-xs mb-1" style={{ color: DIM }}>Port</div>
                        <input className={inputCls} style={inputStyle} type="number" value={newPrinter.port} onChange={e => setNewPrinter(d => ({ ...d, port: Number(e.target.value) }))} />
                      </div>
                    </>
                  )}
                </div>
                {allCategories.length > 0 && (
                  <div className="border-t pt-3" style={{ borderColor: BORD }}>
                    <div className="text-xs font-semibold mb-2" style={{ color: DIM }}>Print Categories</div>
                    <div className="flex flex-wrap gap-2">
                      {allCategories.map((cat: any) => {
                        const sel = newPrinterCats.includes(cat.id);
                        const taken = !sel && takenBy(null).has(cat.id);
                        return (
                          <button key={cat.id} type="button"
                            disabled={taken}
                            onClick={() => !taken && setNewPrinterCats(c => toggleCat(c, cat.id))}
                            className="px-3 py-1 rounded-full text-xs font-medium transition-all"
                            style={{
                              background: sel ? PURPLE : "transparent",
                              color: sel ? "#fff" : taken ? BORD : DIM,
                              border: `1.5px solid ${sel ? PURPLE : BORD}`,
                              opacity: taken ? 0.4 : 1,
                              cursor: taken ? "not-allowed" : "pointer",
                              textDecoration: taken ? "line-through" : "none",
                            }}>
                            {cat.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="flex gap-2 pt-1">
                  <button onClick={() => addPrinter.mutate({ data: newPrinter, cats: newPrinterCats })} disabled={addPrinter.isPending || !newPrinter.name.trim()}
                    className="px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-50" style={{ background: PURPLE, color: "#fff" }}>
                    {addPrinter.isPending ? "Adding…" : "Add Printer"}
                  </button>
                  <button onClick={() => { setShowAdd(false); setNewPrinter({ ...emptyPrinter }); setNewPrinterCats([]); }}
                    className="px-4 py-2 rounded-lg text-xs font-semibold" style={{ background: BORD, color: TEXT }}>Cancel</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowAdd(true)}
                className="w-full py-2.5 rounded-xl text-sm font-semibold border-dashed border-2 transition-all"
                style={{ borderColor: PURPLE + "66", color: PURPLE, background: "transparent" }}>
                + Add Printer
              </button>
            )}

            <div className="flex gap-3 pt-2 border-t" style={{ borderColor: BORD }}>
              <button onClick={() => save.mutate()} disabled={save.isPending}
                className="px-6 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50"
                style={{ background: saved ? "var(--color-success)" : PURPLE, color: "#fff" }}>
                {saved ? "Saved!" : save.isPending ? "Saving…" : "Save Categories"}
              </button>
              <button onClick={onBack} className="px-6 py-2.5 rounded-lg text-sm font-semibold" style={{ background: PURPLE + "99", color: "#fff" }}>Back</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Sub-page: Delivery Partners
function DeliveryPartners({ onBack }: { onBack: () => void }) {
  const branchId = getBranchId();
  const qc = useQueryClient();
  const [partners, setPartners] = useState([
    { name: "PickMe Food", apiKey: "", active: false },
    { name: "Uber Eats", apiKey: "", active: false },
    { name: "Swiggy", apiKey: "", active: false },
  ]);
  const [newPartner, setNewPartner] = useState({ name: "", apiKey: "" });
  const [saved, setSaved] = useState(false);

  const { data: settingsData } = useQuery({
    queryKey: ["settings", branchId],
    queryFn: async () => (await api.settings.$get({ query: { branchId: String(branchId) } })).json(),
  });
  useEffect(() => {
    const r = (settingsData as any)?.settings as Record<string, string> | undefined;
    if (r?.deliveryPartners) { try { const v = JSON.parse(r.deliveryPartners); if (Array.isArray(v)) setPartners(v); } catch {} }
  }, [settingsData]);
  const save = useMutation({
    mutationFn: async () => (await api.settings.$post({ json: { branchId, settings: { deliveryPartners: JSON.stringify(partners) } } })).json(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["settings", branchId] }); setSaved(true); setTimeout(() => { setSaved(false); onBack(); }, 1200); },
  });

  function toggle(idx: number) {
    setPartners(prev => prev.map((p, i) => i === idx ? { ...p, active: !p.active } : p));
  }
  function setField(idx: number, key: "name" | "apiKey", value: string) {
    setPartners(prev => prev.map((p, i) => i === idx ? { ...p, [key]: value } : p));
  }
  function addPartner() {
    if (!newPartner.name.trim()) return;
    setPartners(prev => [...prev, { ...newPartner, active: true }]);
    setNewPartner({ name: "", apiKey: "" });
  }
  function remove(idx: number) {
    setPartners(prev => prev.filter((_, i) => i !== idx));
  }

  return (
    <div className="max-w-xl mx-auto">
      <div className="rounded-2xl border overflow-hidden" style={{ background: SURF, borderColor: BORD }}>
        <div className="px-6 py-5 border-b" style={{ borderColor: BORD }}>
          <h2 className="text-xl font-bold" style={{ color: TEXT }}>Delivery Partners</h2>
          <p className="text-xs mt-1" style={{ color: MUTED }}>Configure third-party delivery platform integrations.</p>
        </div>
        <div className="p-6 space-y-3">
          {partners.map((p, idx) => (
            <div key={idx} className="rounded-xl border p-4 space-y-3" style={{ borderColor: BORD, background: BG }}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold" style={{ color: TEXT }}>{p.name}</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => toggle(idx)}
                    className="text-xs px-2.5 py-1 rounded-full font-medium"
                    style={{ background: p.active ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)", color: p.active ? "#4ADE80" : "#F87171" }}>
                    {p.active ? "Active" : "Disabled"}
                  </button>
                  <button onClick={() => remove(idx)} className="text-xs" style={{ color: "var(--color-danger)" }}>✕</button>
                </div>
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: MUTED }}>API Key / Token</label>
                <input value={p.apiKey} onChange={e => setField(idx, "apiKey", e.target.value)}
                  placeholder="Enter API key..."
                  className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                  style={{ background: SURF, borderColor: BORD, color: TEXT }} />
              </div>
            </div>
          ))}
          {/* Add new partner */}
          <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: BORD, background: BG }}>
            <div className="text-xs font-semibold" style={{ color: MUTED }}>Add New Partner</div>
            <div className="grid grid-cols-2 gap-2">
              <input value={newPartner.name} onChange={e => setNewPartner(p => ({ ...p, name: e.target.value }))}
                placeholder="Partner name" className="px-3 py-2 rounded-lg border text-sm outline-none"
                style={{ background: SURF, borderColor: BORD, color: TEXT }} />
              <input value={newPartner.apiKey} onChange={e => setNewPartner(p => ({ ...p, apiKey: e.target.value }))}
                placeholder="API key (optional)" className="px-3 py-2 rounded-lg border text-sm outline-none"
                style={{ background: SURF, borderColor: BORD, color: TEXT }} />
            </div>
            <button onClick={addPartner} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: GOLD, color: "var(--color-surface)" }}>Add Partner</button>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => save.mutate()} disabled={save.isPending} className="px-6 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50" style={{ background: saved ? "var(--color-success)" : PURPLE, color: "#fff" }}>{saved ? "Saved!" : save.isPending ? "Saving…" : "Save"}</button>
            <button onClick={onBack} className="px-6 py-2.5 rounded-lg text-sm font-semibold" style={{ background: PURPLE + "99", color: "#fff" }}>Back</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Sub-page: Loyalty & Wallet
function LoyaltyWallet({ onBack }: { onBack: () => void }) {
  const branchId = getBranchId();
  const qc = useQueryClient();
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({ enabled: "Enable", minPoints: "40", pointRate: "0.5" });

  const { data: settingsData } = useQuery({
    queryKey: ["settings", branchId],
    queryFn: async () => (await api.settings.$get({ query: { branchId: String(branchId) } })).json(),
  });
  useEffect(() => {
    const r = (settingsData as any)?.settings as Record<string, string> | undefined;
    if (r?.loyalty) { try { setForm(f => ({ ...f, ...JSON.parse(r.loyalty) })); } catch {} }
  }, [settingsData]);
  const save = useMutation({
    mutationFn: async () => (await api.settings.$post({ json: { branchId, settings: { loyalty: JSON.stringify(form) } } })).json(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["settings", branchId] }); setSaved(true); setTimeout(() => { setSaved(false); onBack(); }, 1200); },
  });

  function set(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value }));
  }
  return (
    <div className="max-w-xl mx-auto">
      <div className="rounded-2xl border overflow-hidden" style={{ background: SURF, borderColor: BORD }}>
        <div className="px-6 py-5 border-b" style={{ borderColor: BORD }}>
          <h2 className="text-xl font-bold" style={{ color: TEXT }}>Loyalty &amp; Wallet</h2>
        </div>
        <div className="p-6 space-y-4">
          <Field label="Loyalty Point" help="Enable or disable loyalty points program">
            <Select value={form.enabled} onChange={set("enabled")}>
              <option>Enable</option>
              <option>Disable</option>
            </Select>
          </Field>
          <Field label="Minimum Loyalty Point to Redeem" required>
            <Input type="number" value={form.minPoints} onChange={set("minPoints")} />
          </Field>
          <Field label="Loyalty Point Rate" required help="Points earned per currency unit">
            <Input type="number" step="0.1" value={form.pointRate} onChange={set("pointRate")} />
          </Field>
          <div className="flex gap-3 pt-2">
            <button onClick={() => save.mutate()} disabled={save.isPending} className="px-6 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50" style={{ background: saved ? "var(--color-success)" : PURPLE, color: "#fff" }}>{saved ? "Saved!" : save.isPending ? "Saving…" : "Save"}</button>
            <button onClick={onBack} className="px-6 py-2.5 rounded-lg text-sm font-semibold" style={{ background: PURPLE + "99", color: "#fff" }}>Back</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Integrations({ onBack }: { onBack: () => void }) {
  const branchId = getBranchId();
  const qc = useQueryClient();
  const [saved, setSaved] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);

  const { data: settingsData } = useQuery({
    queryKey: ["settings", branchId],
    queryFn: async () => (await api.settings.$get({ query: { branchId: String(branchId) } })).json(),
  });
  useEffect(() => {
    const r = (settingsData as any)?.settings as Record<string, string> | undefined;
    if (r?.openaiApiKey) setApiKey(r.openaiApiKey);
  }, [settingsData]);

  const save = useMutation({
    mutationFn: async () => (await api.settings.$post({ json: { branchId, settings: { openaiApiKey: apiKey.trim() } } })).json(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["settings", branchId] }); setSaved(true); setTimeout(() => { setSaved(false); onBack(); }, 1200); },
  });

  return (
    <div className="max-w-xl mx-auto">
      <div className="rounded-2xl border overflow-hidden" style={{ background: SURF, borderColor: BORD }}>
        <div className="px-6 py-5 border-b" style={{ borderColor: BORD }}>
          <h2 className="text-xl font-bold" style={{ color: TEXT }}>Integrations</h2>
        </div>
        <div className="p-6 space-y-4">
          <Field label="OpenAI API Key" help="Used to extract menu items & prices from an uploaded menu card photo (Products -> Upload Item -> Menu Card Image).">
            <div className="flex gap-2">
              <Input type={showKey ? "text" : "password"} value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="sk-..." />
              <button type="button" onClick={() => setShowKey(v => !v)}
                className="px-3 py-2 rounded-lg text-xs shrink-0" style={{ background: BORD, color: MUTED }}>
                {showKey ? "Hide" : "Show"}
              </button>
            </div>
          </Field>
          <div className="flex gap-3 pt-2">
            <button onClick={() => save.mutate()} disabled={save.isPending} className="px-6 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50" style={{ background: saved ? "var(--color-success)" : PURPLE, color: "#fff" }}>{saved ? "Saved!" : save.isPending ? "Saving..." : "Save"}</button>
            <button onClick={onBack} className="px-6 py-2.5 rounded-lg text-sm font-semibold" style={{ background: PURPLE + "99", color: "#fff" }}>Back</button>
          </div>
        </div>
      </div>
    </div>
  );
}

const DEFAULTS = {
  restaurantName: "Delizz Restaurant",
  restaurantShortName: "DR",
  website: "www.delizz.com",
  dateFormat: "D/M/Y",
  timezone: "Asia/Colombo",
  currencySymbol: "LKR",
  currencyPosition: "Before Amount",
  precision: "2 Digit",
  decimalSeparator: "Dot(.)",
  thousandSeparator: "Comma(,)",
  posClickBehavior: "Show Options",
  defaultOrderType: "Dine In",
  defaultDeliveryPartner: "None",
  defaultWaiter: "",
  defaultCustomer: "Walk-in Customer",
  defaultPaymentMethod: "Cash",
  placeOrderTooltip: "Show",
  foodMenuTooltip: "Show",
  smsSendAuto: "Yes",
  prePostPayment: "Post Payment",
  serviceCharge: "10%",
  deliveryCharge: "15%",
  exportDailySales: "Enable",
  invoiceFooter: "Thank you for visiting us!\niDine POS || Powered By AxisXNOR",
};

// Main Settings page
export default function SettingsPage() {
  const branchId = getBranchId();
  const qc = useQueryClient();
  const [location] = useLocation();
  const [subPage, setSubPage] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const { data: usersData } = useQuery({
    queryKey: ["users", branchId],
    queryFn: async () => (await api.users.$get({ query: { branchId: String(branchId) } })).json(),
  });
  const users: any[] = (usersData as any)?.users || [];

  const { data: settingsData } = useQuery({
    queryKey: ["settings", branchId],
    queryFn: async () => (await api.settings.$get({ query: { branchId: String(branchId) } })).json(),
  });

  const [form, setForm] = useState({ ...DEFAULTS });
  const [invoiceLogo, setInvoiceLogo] = useState<string | null>(null);
  const [invoiceLogoUploading, setInvoiceLogoUploading] = useState(false);
  const invoiceLogoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const remote = (settingsData as any)?.settings as Record<string, string> | undefined;
    if (remote && Object.keys(remote).length > 0) {
      setForm(f => ({ ...f, ...remote }));
      if (remote.invoiceLogo) setInvoiceLogo(remote.invoiceLogo);
    }
  }, [settingsData]);

  async function handleInvoiceLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setInvoiceLogoUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const json = await res.json() as any;
      if (json.url) setInvoiceLogo(json.url);
    } finally {
      setInvoiceLogoUploading(false);
    }
  }

  const saveSettings = useMutation({
    mutationFn: async (data: Record<string, string>) =>
      (await api.settings.$post({ json: { branchId, settings: data } })).json(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings", branchId] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  function set(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value }));
  }

  function handleSave() {
    const data: Record<string, string> = { ...(form as unknown as Record<string, string>) };
    if (invoiceLogo) data.invoiceLogo = invoiceLogo;
    saveSettings.mutate(data);
  }

  if (subPage === "outlet") return (
    <div className="flex h-screen overflow-hidden" style={{ background: BG }}>
      <Sidebar />
      <div className="flex-1 overflow-y-auto p-6"><OutletSetting onBack={() => setSubPage(null)} /></div>
    </div>
  );
  if (subPage === "payment") return (
    <div className="flex h-screen overflow-hidden" style={{ background: BG }}>
      <Sidebar />
      <div className="flex-1 overflow-y-auto p-6"><PaymentMethods onBack={() => setSubPage(null)} /></div>
    </div>
  );
  if (subPage === "printers") return (
    <div className="flex h-screen overflow-hidden" style={{ background: BG }}>
      <Sidebar />
      <div className="flex-1 overflow-y-auto p-6"><PrinterSetup onBack={() => setSubPage(null)} /></div>
    </div>
  );
  if (subPage === "delivery") return (
    <div className="flex h-screen overflow-hidden" style={{ background: BG }}>
      <Sidebar />
      <div className="flex-1 overflow-y-auto p-6"><DeliveryPartners onBack={() => setSubPage(null)} /></div>
    </div>
  );
  if (subPage === "integrations") return (
    <div className="flex h-screen overflow-hidden" style={{ background: BG }}>
      <Sidebar />
      <div className="flex-1 overflow-y-auto p-6"><Integrations onBack={() => setSubPage(null)} /></div>
    </div>
  );
  if (subPage === "loyalty") return (
    <div className="flex h-screen overflow-hidden" style={{ background: BG }}>
      <Sidebar />
      <div className="flex-1 overflow-y-auto p-6"><LoyaltyWallet onBack={() => setSubPage(null)} /></div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: BG }}>
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="h-14 flex items-center justify-between px-6 border-b shrink-0" style={{ background: SURF, borderColor: BORD }}>
          <div className="font-bold text-base" style={{ color: TEXT }}>Settings</div>
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold"
            style={{ background: saved ? "var(--color-success)" : PURPLE, color: "#fff" }}
          >
            {saved ? <CheckCircle size={13} /> : <Save size={13} />}
            {saved ? "Saved!" : "Save Changes"}
          </button>
        </div>

        {/* Quick links row */}
        <div className="flex items-center gap-2 px-6 py-3 border-b shrink-0 overflow-x-auto" style={{ borderColor: BORD }}>
          {[
            { key: "outlet", label: "Outlet Setting" },
            { key: "payment", label: "Payment Methods" },
            { key: "printers", label: "Printer Setup" },
            { key: "delivery", label: "Delivery Partners" },
            { key: "loyalty", label: "Loyalty & Wallet" },
            { key: "integrations", label: "Integrations" },
          ].map(link => (
            <button
              key={link.key}
              onClick={() => setSubPage(link.key)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all"
              style={{ background: BORD, color: MUTED }}
            >
              {link.label}
              <ChevronRight size={11} />
            </button>
          ))}
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="rounded-2xl border p-6" style={{ background: SURF, borderColor: BORD }}>
            <h2 className="text-lg font-bold mb-6" style={{ color: TEXT }}>General Setting</h2>

            {/* Row 1 */}
            <Row>
              <Field label="Restaurant Name" required>
                <Input value={form.restaurantName} onChange={set("restaurantName")} />
              </Field>
              <Field label="Restaurant Short Name" required>
                <Input value={form.restaurantShortName} onChange={set("restaurantShortName")} />
              </Field>
              <Field label="Invoice Logo">
                <div className="flex gap-2 items-center flex-wrap">
                  {invoiceLogo ? (
                    <div className="relative w-10 h-10 rounded-lg overflow-hidden border shrink-0" style={{ borderColor: BORD, background: BG }}>
                      <img src={invoiceLogo} alt="Logo" className="w-full h-full object-contain" />
                      <button onClick={() => setInvoiceLogo(null)}
                        className="absolute top-0 right-0 bg-black/70 rounded p-0.5" style={{ color: "#fff" }}>
                        <X size={8} />
                      </button>
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded-lg border flex items-center justify-center shrink-0" style={{ borderColor: BORD, background: BG }}>
                      <ImageIcon size={14} style={{ color: DIM }} />
                    </div>
                  )}
                  <input ref={invoiceLogoRef} type="file" className="hidden" accept="image/*" onChange={handleInvoiceLogoUpload} />
                  <button type="button" disabled={invoiceLogoUploading} onClick={() => invoiceLogoRef.current?.click()}
                    className="flex items-center gap-1 px-3 py-2 text-xs rounded-lg border"
                    style={{ borderColor: BORD, color: invoiceLogoUploading ? DIM : MUTED, background: BG }}>
                    <Upload size={11} />
                    {invoiceLogoUploading ? "Uploading…" : invoiceLogo ? "Change" : "Upload"}
                  </button>
                </div>
              </Field>
              <Field label="Website">
                <Input value={form.website} onChange={set("website")} />
              </Field>
            </Row>

            {/* Row 2 */}
            <Row>
              <Field label="Date Format" required>
                <Select value={form.dateFormat} onChange={set("dateFormat")}>
                  <option>D/M/Y</option><option>M/D/Y</option><option>Y/M/D</option>
                </Select>
              </Field>
              <Field label="Time Zone" required>
                <Select value={form.timezone} onChange={set("timezone")}>
                  <option>Asia/Colombo</option><option>Asia/Kolkata</option><option>UTC</option>
                  <option>Asia/Dubai</option><option>Europe/London</option>
                </Select>
              </Field>
              <Field label="Currency Symbol" required>
                <Input value={form.currencySymbol} onChange={set("currencySymbol")} />
              </Field>
              <Field label="Currency Position" required>
                <Select value={form.currencyPosition} onChange={set("currencyPosition")}>
                  <option>Before Amount</option><option>After Amount</option>
                </Select>
              </Field>
            </Row>

            {/* Row 3 */}
            <Row>
              <Field label="Precision" required>
                <Select value={form.precision} onChange={set("precision")}>
                  <option>2 Digit</option><option>0 Digit</option><option>1 Digit</option>
                </Select>
              </Field>
              <Field label="Decimals Separator" required>
                <Select value={form.decimalSeparator} onChange={set("decimalSeparator")}>
                  <option>Dot(.)</option><option>Comma(,)</option>
                </Select>
              </Field>
              <Field label="Thousands Separator" required>
                <Select value={form.thousandSeparator} onChange={set("thousandSeparator")}>
                  <option>Comma(,)</option><option>Dot(.)</option><option>Space</option>
                </Select>
              </Field>
              <Field label="When clicking on item in POS" help="What happens when you tap a menu item in POS">
                <Select value={form.posClickBehavior} onChange={set("posClickBehavior")}>
                  <option>Show Options</option><option>Add Directly</option>
                </Select>
              </Field>
            </Row>

            {/* Row 4 */}
            <Row>
              <Field label="Default Order Type" help="Pre-selected order type when creating a new order">
                <Select value={form.defaultOrderType} onChange={set("defaultOrderType")}>
                  <option>Dine In</option><option>Takeaway</option><option>Delivery</option>
                </Select>
              </Field>
              <Field label="Default Delivery Partner">
                <Select value={form.defaultDeliveryPartner} onChange={set("defaultDeliveryPartner")}>
                  <option>None</option>
                </Select>
              </Field>
              <Field label="Default Waiter">
                <Select value={form.defaultWaiter} onChange={set("defaultWaiter")}>
                  <option value="">None</option>
                  {users.filter((u: any) => u.role === "waiter").map((u: any) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Default Customer" required>
                <Select value={form.defaultCustomer} onChange={set("defaultCustomer")}>
                  <option>Walk-in Customer</option>
                </Select>
              </Field>
            </Row>

            {/* Row 5 */}
            <Row>
              <Field label="Default Payment Method" required>
                <Select value={form.defaultPaymentMethod} onChange={set("defaultPaymentMethod")}>
                  <option>Cash</option><option>Card</option><option>Online Transfer</option>
                </Select>
              </Field>
              <Field label="Place Order Tooltip(in POS)" required>
                <Select value={form.placeOrderTooltip} onChange={set("placeOrderTooltip")}>
                  <option>Show</option><option>Hide</option>
                </Select>
              </Field>
              <Field label="Food Menu Tooltip(in POS)" required>
                <Select value={form.foodMenuTooltip} onChange={set("foodMenuTooltip")}>
                  <option>Show</option><option>Hide</option>
                </Select>
              </Field>
              <Field label="SMS Send Auto(in final invoice)">
                <Select value={form.smsSendAuto} onChange={set("smsSendAuto")}>
                  <option>Yes</option><option>No</option>
                </Select>
              </Field>
            </Row>

            {/* Row 6 */}
            <Row>
              <Field label="Pre or Post Payment" required>
                <Select value={form.prePostPayment} onChange={set("prePostPayment")}>
                  <option>Post Payment</option><option>Pre Payment</option>
                </Select>
              </Field>
              <Field label="Service Charge (eg:10% or 10)" help="Enter as percentage e.g. 10% or flat amount e.g. 10">
                <Input value={form.serviceCharge} onChange={set("serviceCharge")} placeholder="e.g. 10%" />
              </Field>
              <Field label="Delivery Charge (eg:10% or 10)" help="Enter as percentage e.g. 15% or flat amount e.g. 50">
                <Input value={form.deliveryCharge} onChange={set("deliveryCharge")} placeholder="e.g. 15%" />
              </Field>
              <div />
            </Row>

            {/* Row 7 — Export */}
            <Row>
              <Field label="Export Daily Sales & Reset All Sales" help="Automatically export and reset daily sales data">
                <Select value={form.exportDailySales} onChange={set("exportDailySales")}>
                  <option>Enable</option><option>Disable</option>
                </Select>
              </Field>
              <div /><div /><div />
            </Row>

            {/* Invoice Footer */}
            <div className="mb-6">
              <Label>Invoice Footer</Label>
              <textarea
                rows={3}
                value={form.invoiceFooter}
                onChange={set("invoiceFooter")}
                className="w-full px-3 py-2 text-sm rounded-lg border outline-none resize-none"
                style={{ background: BG, borderColor: BORD, color: TEXT }}
              />
            </div>

            {/* Submit */}
            <button
              onClick={handleSave}
              className="px-8 py-2.5 rounded-lg text-sm font-semibold"
              style={{ background: PURPLE, color: "#fff" }}
            >
              {saved ? "Saved!" : "Submit"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
