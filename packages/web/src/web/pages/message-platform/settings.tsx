import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { getBranchId } from "../../lib/store";
import { Sidebar } from "../../components/layout/sidebar";
import {
  Settings as SettingsIcon, Clock, FileText, Plus, Pencil, Trash2, Save,
  BellRing, BellOff, Type, ArrowLeft, Cake, Gift, Baby,
} from "lucide-react";
import { Link } from "wouter";

const GOLD = "var(--color-gold)";
const BG = "var(--color-bg)";
const SURF = "var(--color-surface)";
const BORD = "var(--color-border)";
const MUTED = "var(--color-text-muted)";
const DIM = "var(--color-text-dim)";
const TEXT = "var(--color-text)";
const OK = "var(--color-success)";
const BAD = "var(--color-danger)";

const inp: React.CSSProperties = {
  width: "100%", padding: "8px 10px", borderRadius: 8,
  border: `1px solid ${BORD}`, background: BG, color: TEXT,
  fontSize: 12, outline: "none", boxSizing: "border-box",
};

const KINDS = [
  { value: "birthday", label: "Birthday wish", icon: Cake },
  { value: "anniversary", label: "Wedding anniversary", icon: Gift },
  { value: "child_birthday", label: "Child's birthday", icon: Baby },
  { value: "festival", label: "Festival wishes", icon: FileText },
  { value: "event", label: "Event", icon: FileText },
  { value: "promo", label: "Promotional", icon: FileText },
  { value: "custom", label: "Custom", icon: FileText },
];

const TOKENS = ["{name}", "{first_name}", "{points}", "{child}", "{date}"];

export default function MessageSettings() {
  const branchId = getBranchId();
  const qc = useQueryClient();

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: BG }}>
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="h-14 flex items-center justify-between px-6 border-b shrink-0" style={{ background: SURF, borderColor: BORD }}>
          <div className="flex items-center gap-2">
            <SettingsIcon size={17} style={{ color: GOLD }} />
            <span className="font-bold text-base" style={{ color: TEXT }}>Message Settings</span>
          </div>
          <Link href="/message-platform">
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={{ background: BG, border: `1px solid ${BORD}`, color: MUTED }}>
              <ArrowLeft size={13} /> Back to Message Platform
            </button>
          </Link>
        </div>

        <div className="flex-1 overflow-auto p-6 space-y-5">
          <Automation branchId={branchId} qc={qc} />
          <Templates branchId={branchId} qc={qc} />
          <AutomatedCustomers branchId={branchId} qc={qc} />
        </div>
      </div>
    </div>
  );
}

// ── Automation + branding ───────────────────────────────────────────────────

function Automation({ branchId, qc }: any) {
  const [form, setForm] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  const { data } = useQuery({
    queryKey: ["msg-automation", branchId],
    queryFn: async () => (await api.messaging.automation.$get({ query: { branchId: String(branchId) } })).json(),
  });
  const { data: balanceData } = useQuery({
    queryKey: ["msg-balance", branchId],
    queryFn: async () => (await api.messaging.balance.$get({ query: { branchId: String(branchId) } })).json(),
  });

  const automation: Record<string, string> = (data as any)?.automation || {};
  const senderIds: string[] = (balanceData as any)?.senderIds || [];

  useEffect(() => {
    if (Object.keys(automation).length) setForm(automation);
  }, [data]);

  const save = useMutation({
    mutationFn: async () => (await api.messaging.automation.$post({ json: { branchId, automation: form } })).json(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["msg-automation"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  const set = (k: string, v: string) => setForm(prev => ({ ...prev, [k]: v }));
  const on = form.msgAutoEnabled === "1";

  return (
    <div className="rounded-xl p-5" style={{ background: SURF, border: `1px solid ${BORD}` }}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {on ? <BellRing size={15} style={{ color: OK }} /> : <BellOff size={15} style={{ color: DIM }} />}
          <div>
            <div className="text-sm font-bold" style={{ color: TEXT }}>Automated wishes</div>
            <div className="text-[11px]" style={{ color: DIM }}>
              A daily job checks every customer's dates and sends the matching wish. Nothing is sent while this is off.
            </div>
          </div>
        </div>
        <button onClick={() => set("msgAutoEnabled", on ? "0" : "1")}
          className="px-3.5 py-1.5 rounded-lg text-xs font-bold"
          style={{ background: on ? OK : BORD, color: on ? "#0b2b16" : MUTED }}>
          {on ? "ON" : "OFF"}
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className="block text-[10px] uppercase mb-1" style={{ color: DIM }}>Send time (daily)</label>
          <div className="flex items-center gap-2">
            <Clock size={13} style={{ color: DIM }} />
            <input type="time" value={form.msgAutoSendTime ?? "09:00"}
              onChange={e => set("msgAutoSendTime", e.target.value)} style={inp} />
          </div>
        </div>
        <div>
          <label className="block text-[10px] uppercase mb-1" style={{ color: DIM }}>Channel</label>
          <select value={form.msgAutoChannel ?? "sms"} onChange={e => set("msgAutoChannel", e.target.value)} style={inp}>
            <option value="sms">SMS</option>
            <option value="whatsapp">WhatsApp</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] uppercase mb-1" style={{ color: DIM }}>Sender ID</label>
          <select value={form.msgAutoSenderId ?? ""} onChange={e => set("msgAutoSenderId", e.target.value)} style={inp}>
            <option value="">Business default</option>
            {senderIds.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] uppercase mb-1" style={{ color: DIM }}>
            <Type size={10} className="inline mr-1" />SMS branding
          </label>
          <input value={form.msgSignature ?? ""} onChange={e => set("msgSignature", e.target.value)}
            placeholder="e.g. - Chava Kitchen" style={inp} />
        </div>
      </div>

      <div className="mt-4 pt-4 border-t" style={{ borderColor: BORD }}>
        <div className="text-[10px] uppercase mb-2" style={{ color: DIM }}>Which occasions to send automatically</div>
        <div className="flex flex-wrap gap-2">
          {[
            { key: "msgAutoBirthday", label: "Customer birthdays", icon: Cake },
            { key: "msgAutoAnniversary", label: "Wedding anniversaries", icon: Gift },
            { key: "msgAutoChildBirthday", label: "Children's birthdays", icon: Baby },
          ].map(o => {
            const active = (form[o.key] ?? "1") === "1";
            return (
              <button key={o.key} onClick={() => set(o.key, active ? "0" : "1")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold"
                style={{
                  background: active ? `${GOLD}1c` : BG,
                  border: `1px solid ${active ? GOLD : BORD}`,
                  color: active ? GOLD : MUTED,
                }}>
                <o.icon size={12} /> {o.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-3 mt-4">
        <button onClick={() => save.mutate()} disabled={save.isPending}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold"
          style={{ background: GOLD, color: SURF }}>
          <Save size={13} /> {save.isPending ? "Saving…" : "Save settings"}
        </button>
        {saved && <span className="text-xs" style={{ color: OK }}>Saved.</span>}
      </div>
    </div>
  );
}

// ── Template manager ────────────────────────────────────────────────────────

function Templates({ branchId, qc }: any) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({ name: "", channel: "sms", kind: "custom", body: "" });

  const { data } = useQuery({
    queryKey: ["msg-templates", branchId],
    queryFn: async () => (await api.messaging.templates.$get({ query: { branchId: String(branchId) } })).json(),
  });
  const templates: any[] = (data as any)?.templates || [];

  const invalidate = () => qc.invalidateQueries({ queryKey: ["msg-templates"] });

  const create = useMutation({
    mutationFn: async () => (await api.messaging.templates.$post({ json: { ...form, branchId } })).json(),
    onSuccess: () => { invalidate(); reset(); },
  });
  const update = useMutation({
    mutationFn: async () => (await api.messaging.templates[":id"].$patch({
      param: { id: String(editing.id) },
      json: { name: form.name, channel: form.channel, kind: form.kind, body: form.body },
    })).json(),
    onSuccess: () => { invalidate(); reset(); },
  });
  const toggle = useMutation({
    mutationFn: async (t: any) => (await api.messaging.templates[":id"].$patch({
      param: { id: String(t.id) }, json: { isActive: !t.isActive },
    })).json(),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: async (id: number) => (await api.messaging.templates[":id"].$delete({ param: { id: String(id) } })).json(),
    onSuccess: invalidate,
  });

  function reset() {
    setShowForm(false); setEditing(null);
    setForm({ name: "", channel: "sms", kind: "custom", body: "" });
  }
  function openEdit(t: any) {
    setEditing(t);
    setForm({ name: t.name, channel: t.channel, kind: t.kind, body: t.body });
    setShowForm(true);
  }

  return (
    <div className="rounded-xl p-5" style={{ background: SURF, border: `1px solid ${BORD}` }}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-sm font-bold" style={{ color: TEXT }}>SMS & WhatsApp templates</div>
          <div className="text-[11px]" style={{ color: DIM }}>
            The active template for each occasion is what the daily job sends. Built-in wording is used if none exists.
          </div>
        </div>
        <button onClick={() => { reset(); setShowForm(true); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold"
          style={{ background: GOLD, color: SURF }}>
          <Plus size={13} /> New template
        </button>
      </div>

      {showForm && (
        <div className="rounded-lg p-4 mb-4" style={{ background: BG, border: `1px solid ${BORD}` }}>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[10px] uppercase mb-1" style={{ color: DIM }}>Name</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Birthday — 10% off" style={inp} />
            </div>
            <div>
              <label className="block text-[10px] uppercase mb-1" style={{ color: DIM }}>Occasion</label>
              <select value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })} style={inp}>
                {KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] uppercase mb-1" style={{ color: DIM }}>Channel</label>
              <select value={form.channel} onChange={e => setForm({ ...form, channel: e.target.value })} style={inp}>
                <option value="sms">SMS</option>
                <option value="whatsapp">WhatsApp</option>
              </select>
            </div>
          </div>
          <div className="mt-3">
            <label className="block text-[10px] uppercase mb-1" style={{ color: DIM }}>Message</label>
            <textarea value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} rows={3}
              placeholder="Happy Birthday {first_name}! ..." style={{ ...inp, resize: "vertical", fontFamily: "inherit" }} />
            <div className="flex items-center gap-1.5 mt-2">
              <span className="text-[10px]" style={{ color: DIM }}>{form.body.length} chars ·</span>
              {TOKENS.map(t => (
                <button key={t} onClick={() => setForm({ ...form, body: form.body + t })}
                  className="px-1.5 py-0.5 rounded text-[10px]"
                  style={{ background: SURF, border: `1px solid ${BORD}`, color: MUTED }}>{t}</button>
              ))}
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={() => (editing ? update.mutate() : create.mutate())}
              disabled={!form.name.trim() || !form.body.trim()}
              className="px-4 py-1.5 rounded-lg text-xs font-bold" style={{ background: GOLD, color: SURF }}>
              {editing ? "Save changes" : "Create template"}
            </button>
            <button onClick={reset} className="px-4 py-1.5 rounded-lg text-xs"
              style={{ background: "transparent", border: `1px solid ${BORD}`, color: MUTED }}>Cancel</button>
          </div>
        </div>
      )}

      {templates.length === 0 ? (
        <div className="text-xs py-8 text-center" style={{ color: DIM }}>
          No templates yet. The built-in birthday and anniversary wording will be used until you add your own.
        </div>
      ) : (
        <div className="space-y-2">
          {templates.map(t => {
            const kind = KINDS.find(k => k.value === t.kind);
            const Icon = kind?.icon ?? FileText;
            return (
              <div key={t.id} className="flex items-start gap-3 rounded-lg p-3" style={{ background: BG, border: `1px solid ${BORD}` }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${GOLD}1c` }}>
                  <Icon size={14} style={{ color: GOLD }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold" style={{ color: TEXT }}>{t.name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: SURF, color: MUTED }}>
                      {kind?.label ?? t.kind}
                    </span>
                    <span className="text-[10px]" style={{ color: DIM }}>{t.channel === "sms" ? "SMS" : "WhatsApp"}</span>
                    {!t.isActive && <span className="text-[10px]" style={{ color: BAD }}>inactive</span>}
                  </div>
                  <div className="text-[11px] mt-1 whitespace-pre-wrap" style={{ color: MUTED }}>{t.body}</div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => toggle.mutate(t)} className="px-2 py-1 rounded text-[10px] font-bold"
                    style={{ background: t.isActive ? `${OK}22` : SURF, color: t.isActive ? OK : MUTED, border: `1px solid ${BORD}` }}>
                    {t.isActive ? "Active" : "Enable"}
                  </button>
                  <button onClick={() => openEdit(t)} className="p-1.5 rounded" style={{ color: MUTED }}><Pencil size={12} /></button>
                  <button onClick={() => confirm(`Delete template "${t.name}"?`) && remove.mutate(t.id)}
                    className="p-1.5 rounded" style={{ color: BAD }}><Trash2 size={12} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Who is on the automated list, with a per-customer stop switch ───────────

function AutomatedCustomers({ branchId, qc }: any) {
  const [search, setSearch] = useState("");

  const { data } = useQuery({
    queryKey: ["customers", branchId],
    queryFn: async () => (await api.customers.$get({ query: { branchId: String(branchId) } })).json(),
  });

  const patch = useMutation({
    mutationFn: async ({ id, data }: any) =>
      (await api.customers[":id"].$patch({ param: { id: String(id) }, json: data })).json(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customers"] }),
  });

  const customers: any[] = (data as any)?.customers || [];

  // Only customers who actually have a date on file can receive automated wishes.
  const withDates = customers.filter(c =>
    c.dob || c.weddingAnniversary || c.child1Dob || c.child2Dob || c.child3Dob
  );
  const filtered = withDates.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || (c.phone || "").includes(search)
  );

  return (
    <div className="rounded-xl p-5" style={{ background: SURF, border: `1px solid ${BORD}` }}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-sm font-bold" style={{ color: TEXT }}>Automated list</div>
          <div className="text-[11px]" style={{ color: DIM }}>
            Everyone with a date on file. Turn a customer off to stop automated wishes just for them.
          </div>
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
          style={{ ...inp, width: 200 }} />
      </div>

      {filtered.length === 0 ? (
        <div className="text-xs py-8 text-center" style={{ color: DIM }}>
          No customers with birthdays or anniversaries on file yet. Add dates on the Customers page.
        </div>
      ) : (
        <div className="overflow-auto max-h-96">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: BG, color: DIM }}>
                {["Customer", "Birthday", "Anniversary", "Children", "Automated wishes", "Opted out"].map(h => (
                  <th key={h} className="text-left px-3 py-2 font-semibold uppercase text-[10px] sticky top-0" style={{ background: BG }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => {
                const children = [
                  c.child1Name && c.child1Dob ? `${c.child1Name} (${c.child1Dob})` : null,
                  c.child2Name && c.child2Dob ? `${c.child2Name} (${c.child2Dob})` : null,
                  c.child3Name && c.child3Dob ? `${c.child3Name} (${c.child3Dob})` : null,
                ].filter(Boolean);
                return (
                  <tr key={c.id} className="border-t" style={{ borderColor: BORD }}>
                    <td className="px-3 py-2.5">
                      <div className="font-semibold" style={{ color: TEXT }}>{c.name}</div>
                      <div className="text-[10px]" style={{ color: DIM }}>{c.phone || "no phone"}</div>
                    </td>
                    <td className="px-3 py-2.5" style={{ color: MUTED }}>{c.dob || "—"}</td>
                    <td className="px-3 py-2.5" style={{ color: MUTED }}>{c.weddingAnniversary || "—"}</td>
                    <td className="px-3 py-2.5 text-[11px]" style={{ color: MUTED }}>
                      {children.length ? children.join(", ") : "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <button onClick={() => patch.mutate({ id: c.id, data: { autoWishes: !c.autoWishes } })}
                        className="px-2.5 py-1 rounded text-[10px] font-bold"
                        style={{
                          background: c.autoWishes ? `${OK}22` : BG,
                          color: c.autoWishes ? OK : MUTED,
                          border: `1px solid ${c.autoWishes ? OK : BORD}`,
                        }}>
                        {c.autoWishes ? "ON" : "STOPPED"}
                      </button>
                    </td>
                    <td className="px-3 py-2.5">
                      <button onClick={() => patch.mutate({ id: c.id, data: { smsOptOut: !c.smsOptOut } })}
                        className="px-2.5 py-1 rounded text-[10px] font-bold"
                        style={{
                          background: c.smsOptOut ? `${BAD}22` : BG,
                          color: c.smsOptOut ? BAD : MUTED,
                          border: `1px solid ${c.smsOptOut ? BAD : BORD}`,
                        }}>
                        {c.smsOptOut ? "OPTED OUT" : "No"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
