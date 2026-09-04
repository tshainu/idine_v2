import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { getBranchId } from "../lib/store";
import { Sidebar } from "../components/layout/sidebar";
import {
  MessageSquare, Send, Users, Cake, Gift, Megaphone, Wallet, Settings,
  CheckCircle2, XCircle, MinusCircle, Clock, Trash2, AlertTriangle, Sparkles,
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

type Channel = "sms" | "whatsapp";
type Tab = "compose" | "campaigns" | "occasions" | "history";

const SEG = 160;
const money = (n: number) => `LKR ${Number(n || 0).toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const TOKENS = [
  { token: "{name}", desc: "Full name" },
  { token: "{first_name}", desc: "First name" },
  { token: "{points}", desc: "Loyalty points" },
  { token: "{child}", desc: "Child's name" },
  { token: "{date}", desc: "Today's date" },
];

export default function MessagePlatform() {
  const branchId = getBranchId();
  const qc = useQueryClient();

  // The channel toggle sits at the top of the page and defaults to SMS.
  const [channel, setChannel] = useState<Channel>("sms");
  const [tab, setTab] = useState<Tab>("compose");

  const { data: balanceData } = useQuery({
    queryKey: ["msg-balance", branchId],
    queryFn: async () => (await api.messaging.balance.$get({ query: { branchId: String(branchId) } })).json(),
    refetchInterval: 15000,
  });
  const { data: statsData } = useQuery({
    queryKey: ["msg-stats", branchId],
    queryFn: async () => (await api.messaging.stats.$get({ query: { branchId: String(branchId) } })).json(),
    refetchInterval: 30000,
  });

  const bal: any = (balanceData as any) || {};
  const stats: any = (statsData as any) || {};
  const credits = Number(bal.credits ?? 0);
  const rate = Number(bal.rate ?? 1);
  const ready = channel === "sms" ? bal.smsReady : bal.whatsappReady;

  const TABS: { id: Tab; label: string; icon: any }[] = [
    { id: "compose", label: "Compose & Send", icon: Send },
    { id: "campaigns", label: "Campaigns", icon: Megaphone },
    { id: "occasions", label: "Occasions", icon: Cake },
    { id: "history", label: "History", icon: Clock },
  ];

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: BG }}>
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="h-14 flex items-center justify-between px-6 border-b shrink-0" style={{ background: SURF, borderColor: BORD }}>
          <div className="flex items-center gap-2">
            <MessageSquare size={17} style={{ color: GOLD }} />
            <span className="font-bold text-base" style={{ color: TEXT }}>Message Platform</span>
          </div>
          <div className="flex items-center gap-3">
            {/* Credit balance */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: BG, border: `1px solid ${BORD}` }}>
              <Wallet size={13} style={{ color: credits > 0 ? GOLD : BAD }} />
              <span className="text-xs font-semibold" style={{ color: credits > 0 ? TEXT : BAD }}>{money(credits)}</span>
              <span className="text-[10px]" style={{ color: DIM }}>· {money(rate)}/SMS</span>
            </div>
            <Link href="/message-platform/settings">
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                style={{ background: BG, border: `1px solid ${BORD}`, color: MUTED }}>
                <Settings size={13} /> Settings
              </button>
            </Link>
          </div>
        </div>

        {/* Channel toggle + stat strip */}
        <div className="px-6 pt-4 pb-3 border-b shrink-0" style={{ borderColor: BORD }}>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex p-1 rounded-xl" style={{ background: SURF, border: `1px solid ${BORD}` }}>
              {(["sms", "whatsapp"] as Channel[]).map(ch => (
                <button key={ch} onClick={() => setChannel(ch)}
                  className="px-4 py-1.5 rounded-lg text-xs font-bold transition-colors"
                  style={{
                    background: channel === ch ? GOLD : "transparent",
                    color: channel === ch ? SURF : MUTED,
                  }}>
                  {ch === "sms" ? "SMS" : "WhatsApp"}
                </button>
              ))}
            </div>

            <Stat label="Sent today" value={stats.sentToday ?? 0} />
            <Stat label="This month" value={stats.sentThisMonth ?? 0} />
            <Stat label="Spent this month" value={money(stats.spentThisMonth ?? 0)} />
            <Stat label="Failed" value={stats.totalFailed ?? 0} bad={Number(stats.totalFailed ?? 0) > 0} />

            {!ready && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] ml-auto"
                style={{ background: `${BAD}18`, border: `1px solid ${BAD}55`, color: BAD }}>
                <AlertTriangle size={13} />
                {channel === "sms"
                  ? "SMS not configured — the software owner must set a Sender ID in the iDSA panel."
                  : "WhatsApp not configured — the software owner must add Cloud API credentials in the iDSA panel."}
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-3 shrink-0">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-t-lg text-xs font-semibold"
              style={{
                background: tab === t.id ? SURF : "transparent",
                color: tab === t.id ? GOLD : MUTED,
                borderBottom: tab === t.id ? `2px solid ${GOLD}` : `2px solid transparent`,
              }}>
              <t.icon size={13} /> {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-auto p-6 pt-4">
          {tab === "compose" && <Compose branchId={branchId} channel={channel} bal={bal} qc={qc} />}
          {tab === "campaigns" && <Campaigns branchId={branchId} channel={channel} qc={qc} />}
          {tab === "occasions" && <Occasions branchId={branchId} />}
          {tab === "history" && <History branchId={branchId} />}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, bad }: { label: string; value: any; bad?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide" style={{ color: DIM }}>{label}</div>
      <div className="text-sm font-bold" style={{ color: bad ? BAD : TEXT }}>{value}</div>
    </div>
  );
}

// ── Compose: single, group or bulk send ─────────────────────────────────────

function Compose({ branchId, channel, bal, qc }: any) {
  const [audience, setAudience] = useState<"all" | "tag" | "selection">("all");
  const [tag, setTag] = useState("");
  const [selection, setSelection] = useState<number[]>([]);
  const [body, setBody] = useState("");
  const [senderId, setSenderId] = useState<string>("");
  const [name, setName] = useState("");
  const [kind, setKind] = useState("promo");
  const [scheduledAt, setScheduledAt] = useState("");
  const [result, setResult] = useState<string>("");

  const { data: tagsData } = useQuery({
    queryKey: ["msg-tags", branchId],
    queryFn: async () => (await api.messaging.tags.$get({ query: { branchId: String(branchId) } })).json(),
  });
  const { data: customersData } = useQuery({
    queryKey: ["customers", branchId],
    queryFn: async () => (await api.customers.$get({ query: { branchId: String(branchId) } })).json(),
  });
  const { data: templatesData } = useQuery({
    queryKey: ["msg-templates", branchId],
    queryFn: async () => (await api.messaging.templates.$get({ query: { branchId: String(branchId) } })).json(),
  });

  const audienceValue = audience === "tag" ? tag : audience === "selection" ? JSON.stringify(selection) : "";

  const { data: audienceData } = useQuery({
    queryKey: ["msg-audience", branchId, audience, audienceValue, body, channel],
    queryFn: async () => (await api.messaging.audience.$get({
      query: { branchId: String(branchId), audience, value: audienceValue, body, channel },
    })).json(),
  });

  const tags: any[] = (tagsData as any)?.tags || [];
  const customers: any[] = (customersData as any)?.customers || [];
  const templates: any[] = (templatesData as any)?.templates || [];
  const aud: any = (audienceData as any) || {};
  const senderIds: string[] = bal.senderIds || [];

  const segments = Math.max(1, Math.ceil(body.length / SEG));

  const createCampaign = useMutation({
    mutationFn: async (sendNow: boolean) => {
      const created: any = await (await api.messaging.campaigns.$post({
        json: {
          branchId, name: name.trim() || `${kind} ${new Date().toLocaleDateString("en-GB")}`,
          channel, kind, body, senderId: senderId || null,
          audience, audienceValue,
          scheduledAt: sendNow ? null : (scheduledAt ? new Date(scheduledAt).toISOString() : null),
        },
      })).json();
      if (!sendNow) return { scheduled: true, campaign: created.campaign };
      const sent: any = await (await api.messaging.campaigns[":id"].send.$post({
        param: { id: String(created.campaign.id) },
      })).json();
      return { scheduled: false, ...sent };
    },
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["msg-balance"] });
      qc.invalidateQueries({ queryKey: ["msg-stats"] });
      qc.invalidateQueries({ queryKey: ["msg-campaigns"] });
      qc.invalidateQueries({ queryKey: ["msg-log"] });
      if (res.scheduled) setResult(`Scheduled — it will go out automatically at the chosen time.`);
      else setResult(res.stoppedReason
        ? `Stopped: ${res.stoppedReason} (sent ${res.sent}, failed ${res.failed})`
        : `Done — sent ${res.sent}, failed ${res.failed}.`);
    },
    onError: (e: any) => setResult(`Failed: ${e.message}`),
  });

  const canSend = body.trim().length > 0 && (aud.count ?? 0) > 0 && !createCampaign.isPending;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-5">
      {/* Composer */}
      <div className="rounded-xl p-5" style={{ background: SURF, border: `1px solid ${BORD}` }}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Campaign name">
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Avurudu promotion" style={inp} />
          </Field>
          <Field label="Type">
            <select value={kind} onChange={e => setKind(e.target.value)} style={inp}>
              <option value="promo">Promotional</option>
              <option value="festival">Festival wishes</option>
              <option value="event">Event</option>
              <option value="custom">Custom</option>
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-3">
          <Field label="Audience">
            <select value={audience} onChange={e => { setAudience(e.target.value as any); setSelection([]); }} style={inp}>
              <option value="all">All customers</option>
              <option value="tag">A customer group</option>
              <option value="selection">Pick customers</option>
            </select>
          </Field>
          {audience === "tag" && (
            <Field label="Group">
              <select value={tag} onChange={e => setTag(e.target.value)} style={inp}>
                <option value="">Select a group…</option>
                {tags.map(t => <option key={t.tag} value={t.tag}>{t.tag} ({t.count})</option>)}
              </select>
            </Field>
          )}
          {channel === "sms" && (
            <Field label="Sender ID">
              <select value={senderId} onChange={e => setSenderId(e.target.value)} style={inp}>
                <option value="">{bal.defaultSenderId ? `Default (${bal.defaultSenderId})` : "None configured"}</option>
                {senderIds.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          )}
        </div>

        {audience === "selection" && (
          <div className="mt-3 rounded-lg p-2 max-h-40 overflow-auto" style={{ background: BG, border: `1px solid ${BORD}` }}>
            {customers.length === 0 && <div className="text-xs p-2" style={{ color: DIM }}>No customers yet.</div>}
            {customers.map(c => (
              <label key={c.id} className="flex items-center gap-2 px-2 py-1 text-xs cursor-pointer" style={{ color: TEXT }}>
                <input type="checkbox" checked={selection.includes(c.id)}
                  onChange={e => setSelection(prev => e.target.checked ? [...prev, c.id] : prev.filter(i => i !== c.id))} />
                {c.name} <span style={{ color: DIM }}>{c.phone || "no phone"}</span>
                {c.smsOptOut && <span style={{ color: BAD }}>· opted out</span>}
              </label>
            ))}
          </div>
        )}

        {templates.length > 0 && (
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase" style={{ color: DIM }}>Templates:</span>
            {templates.filter(t => t.isActive).map(t => (
              <button key={t.id} onClick={() => setBody(t.body)}
                className="px-2 py-1 rounded text-[11px]"
                style={{ background: BG, border: `1px solid ${BORD}`, color: MUTED }}>
                {t.name}
              </button>
            ))}
          </div>
        )}

        <Field label="Message" className="mt-3">
          <textarea value={body} onChange={e => setBody(e.target.value)} rows={6}
            placeholder={`Hi {first_name}, ...`}
            style={{ ...inp, resize: "vertical", fontFamily: "inherit" }} />
        </Field>

        <div className="flex items-center gap-3 mt-2 text-[11px]" style={{ color: DIM }}>
          <span>{body.length} chars</span>
          <span>· {segments} SMS {segments === 1 ? "segment" : "segments"}</span>
          <span className="flex items-center gap-1 flex-wrap">
            {TOKENS.map(t => (
              <button key={t.token} onClick={() => setBody(b => b + t.token)} title={t.desc}
                className="px-1.5 py-0.5 rounded" style={{ background: BG, border: `1px solid ${BORD}`, color: MUTED }}>
                {t.token}
              </button>
            ))}
          </span>
        </div>

        <div className="flex items-end gap-3 mt-4 pt-4 border-t" style={{ borderColor: BORD }}>
          <Field label="Schedule for later (optional)">
            <input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} style={inp} />
          </Field>
          <button disabled={!canSend} onClick={() => createCampaign.mutate(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold shrink-0"
            style={{ background: canSend ? GOLD : BORD, color: canSend ? SURF : DIM, cursor: canSend ? "pointer" : "not-allowed" }}>
            <Send size={13} /> {createCampaign.isPending ? "Sending…" : `Send now to ${aud.count ?? 0}`}
          </button>
          {scheduledAt && (
            <button disabled={!body.trim() || createCampaign.isPending} onClick={() => createCampaign.mutate(false)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold shrink-0"
              style={{ background: BG, border: `1px solid ${BORD}`, color: MUTED }}>
              <Clock size={13} /> Schedule
            </button>
          )}
        </div>

        {result && (
          <div className="mt-3 text-xs px-3 py-2 rounded-lg"
            style={{ background: BG, border: `1px solid ${BORD}`, color: result.startsWith("Failed") || result.startsWith("Stopped") ? BAD : OK }}>
            {result}
          </div>
        )}
      </div>

      {/* Live preview + cost */}
      <div className="rounded-xl p-5 h-fit" style={{ background: SURF, border: `1px solid ${BORD}` }}>
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={14} style={{ color: GOLD }} />
          <span className="text-xs font-bold" style={{ color: TEXT }}>Preview & cost</span>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <Stat label="Recipients" value={aud.count ?? 0} />
          <Stat label="Estimated cost" value={money(aud.estimatedCost ?? 0)} />
        </div>

        <div className="text-[10px] uppercase mb-1.5" style={{ color: DIM }}>
          How it will read for the first few
        </div>
        <div className="space-y-2 max-h-64 overflow-auto">
          {(aud.preview || []).length === 0 && (
            <div className="text-xs" style={{ color: DIM }}>
              No recipients yet — customers need a phone number and must not be opted out.
            </div>
          )}
          {(aud.preview || []).slice(0, 6).map((p: any) => (
            <div key={p.id} className="rounded-lg p-2.5" style={{ background: BG, border: `1px solid ${BORD}` }}>
              <div className="text-[10px] mb-1" style={{ color: GOLD }}>{p.name} · {p.phone}</div>
              <div className="text-[11px] whitespace-pre-wrap" style={{ color: TEXT }}>{p.rendered || "—"}</div>
            </div>
          ))}
        </div>

        <div className="mt-4 pt-3 border-t text-[11px] leading-relaxed" style={{ borderColor: BORD, color: DIM }}>
          Opted-out customers and anyone without a valid phone number are automatically excluded.
          Credits are only charged for messages the gateway accepts.
        </div>
      </div>
    </div>
  );
}

// ── Campaigns list ──────────────────────────────────────────────────────────

function Campaigns({ branchId, qc }: any) {
  const { data } = useQuery({
    queryKey: ["msg-campaigns", branchId],
    queryFn: async () => (await api.messaging.campaigns.$get({ query: { branchId: String(branchId) } })).json(),
    refetchInterval: 20000,
  });

  const send = useMutation({
    mutationFn: async (id: number) => (await api.messaging.campaigns[":id"].send.$post({ param: { id: String(id) } })).json(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["msg-campaigns"] });
      qc.invalidateQueries({ queryKey: ["msg-balance"] });
      qc.invalidateQueries({ queryKey: ["msg-log"] });
    },
  });
  const remove = useMutation({
    mutationFn: async (id: number) => (await api.messaging.campaigns[":id"].$delete({ param: { id: String(id) } })).json(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["msg-campaigns"] }),
  });

  const campaigns: any[] = (data as any)?.campaigns || [];
  if (campaigns.length === 0) return <Empty icon={Megaphone} text="No campaigns yet. Compose one and it shows up here." />;

  const badge = (s: string) => ({
    sent: OK, sending: GOLD, scheduled: GOLD, failed: BAD, draft: MUTED,
  }[s] || MUTED);

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: SURF, border: `1px solid ${BORD}` }}>
      <table className="w-full text-xs">
        <thead>
          <tr style={{ background: BG, color: DIM }}>
            {["Campaign", "Channel", "Audience", "Status", "Sent / Total", "When", ""].map(h => (
              <th key={h} className="text-left px-4 py-2.5 font-semibold uppercase text-[10px]">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {campaigns.map(c => (
            <tr key={c.id} className="border-t" style={{ borderColor: BORD }}>
              <td className="px-4 py-3">
                <div className="font-semibold" style={{ color: TEXT }}>{c.name}</div>
                <div className="text-[10px] mt-0.5 line-clamp-1" style={{ color: DIM }}>{c.body}</div>
              </td>
              <td className="px-4 py-3" style={{ color: MUTED }}>{c.channel === "sms" ? "SMS" : "WhatsApp"}</td>
              <td className="px-4 py-3" style={{ color: MUTED }}>
                {c.audience === "all" ? "All customers" : c.audience === "tag" ? `Group: ${c.audienceValue}` : "Selected"}
              </td>
              <td className="px-4 py-3">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold"
                  style={{ background: `${badge(c.status)}22`, color: badge(c.status) }}>
                  {c.status.toUpperCase()}
                </span>
              </td>
              <td className="px-4 py-3" style={{ color: MUTED }}>
                {c.sentCount}/{c.totalCount}{c.failedCount > 0 && <span style={{ color: BAD }}> · {c.failedCount} failed</span>}
              </td>
              <td className="px-4 py-3 text-[11px]" style={{ color: DIM }}>
                {c.completedAt ? new Date(c.completedAt).toLocaleString("en-GB")
                  : c.scheduledAt ? `Scheduled ${new Date(c.scheduledAt).toLocaleString("en-GB")}`
                  : new Date(c.createdAt).toLocaleDateString("en-GB")}
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-1.5 justify-end">
                  {["draft", "scheduled", "failed"].includes(c.status) && (
                    <button onClick={() => send.mutate(c.id)} disabled={send.isPending}
                      className="px-2 py-1 rounded text-[10px] font-bold" style={{ background: GOLD, color: SURF }}>
                      {send.isPending ? "…" : "Send now"}
                    </button>
                  )}
                  <button onClick={() => confirm(`Delete campaign "${c.name}"?`) && remove.mutate(c.id)}
                    className="p-1 rounded" style={{ color: BAD }}><Trash2 size={12} /></button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Upcoming occasions ──────────────────────────────────────────────────────

function Occasions({ branchId }: any) {
  const [days, setDays] = useState(30);
  const { data } = useQuery({
    queryKey: ["msg-occasions", branchId, days],
    queryFn: async () => (await api.messaging.occasions.$get({
      query: { branchId: String(branchId), days: String(days) },
    })).json(),
  });

  const occasions: any[] = (data as any)?.occasions || [];

  const icon = (kind: string) => kind === "anniversary" ? Gift : Cake;

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <span className="text-xs" style={{ color: MUTED }}>Looking ahead</span>
        <select value={days} onChange={e => setDays(parseInt(e.target.value))} style={{ ...inp, width: 130 }}>
          <option value={7}>Next 7 days</option>
          <option value={30}>Next 30 days</option>
          <option value={90}>Next 90 days</option>
        </select>
        <span className="text-[11px]" style={{ color: DIM }}>
          Wishes go out automatically when automation is on — configure it in Message Settings.
        </span>
      </div>

      {occasions.length === 0 ? (
        <Empty icon={Cake} text="No birthdays or anniversaries in this window. Add dates on the Customers page." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {occasions.map((o, i) => {
            const Icon = icon(o.kind);
            const blocked = o.optedOut || !o.autoWishes;
            return (
              <div key={i} className="rounded-xl p-4 flex items-start gap-3" style={{ background: SURF, border: `1px solid ${BORD}` }}>
                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${GOLD}1c` }}>
                  <Icon size={16} style={{ color: GOLD }} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm truncate" style={{ color: TEXT }}>{o.name}</div>
                  <div className="text-[11px]" style={{ color: MUTED }}>{o.label}</div>
                  <div className="text-[11px] mt-1" style={{ color: GOLD }}>
                    {o.inDays === 0 ? "Today" : o.inDays === 1 ? "Tomorrow" : `In ${o.inDays} days`}
                    <span style={{ color: DIM }}> · {o.phone || "no phone"}</span>
                  </div>
                  {blocked && (
                    <div className="text-[10px] mt-1" style={{ color: BAD }}>
                      {o.optedOut ? "Opted out — will not be messaged" : "Automated wishes stopped for this customer"}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Delivery history ────────────────────────────────────────────────────────

function History({ branchId }: any) {
  const { data } = useQuery({
    queryKey: ["msg-log", branchId],
    queryFn: async () => (await api.messaging.log.$get({ query: { branchId: String(branchId), limit: "200" } })).json(),
    refetchInterval: 20000,
  });

  const log: any[] = (data as any)?.log || [];
  if (log.length === 0) return <Empty icon={Clock} text="Nothing sent yet. Messages and their delivery status land here." />;

  const statusIcon = (s: string) =>
    s === "sent" ? <CheckCircle2 size={13} style={{ color: OK }} />
    : s === "failed" ? <XCircle size={13} style={{ color: BAD }} />
    : <MinusCircle size={13} style={{ color: MUTED }} />;

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: SURF, border: `1px solid ${BORD}` }}>
      <table className="w-full text-xs">
        <thead>
          <tr style={{ background: BG, color: DIM }}>
            {["", "To", "Type", "Message", "Cost", "When", "Detail"].map(h => (
              <th key={h} className="text-left px-4 py-2.5 font-semibold uppercase text-[10px]">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {log.map(m => (
            <tr key={m.id} className="border-t" style={{ borderColor: BORD }}>
              <td className="px-4 py-2.5">{statusIcon(m.status)}</td>
              <td className="px-4 py-2.5" style={{ color: TEXT }}>{m.phone}</td>
              <td className="px-4 py-2.5" style={{ color: MUTED }}>
                {m.channel === "sms" ? "SMS" : "WA"} · {m.kind.replace("_", " ")}
              </td>
              <td className="px-4 py-2.5 max-w-xs truncate" style={{ color: MUTED }}>{m.body}</td>
              <td className="px-4 py-2.5" style={{ color: MUTED }}>{m.cost > 0 ? money(m.cost) : "—"}</td>
              <td className="px-4 py-2.5 text-[11px]" style={{ color: DIM }}>
                {new Date(m.sentAt ?? m.createdAt).toLocaleString("en-GB")}
              </td>
              <td className="px-4 py-2.5 text-[11px] max-w-[220px] truncate" style={{ color: m.status === "sent" ? DIM : BAD }}>
                {m.error || m.gatewayResponse || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Small shared bits ───────────────────────────────────────────────────────

const inp: React.CSSProperties = {
  width: "100%", padding: "8px 10px", borderRadius: 8,
  border: `1px solid ${BORD}`, background: BG, color: TEXT,
  fontSize: 12, outline: "none", boxSizing: "border-box",
};

function Field({ label, children, className = "" }: any) {
  return (
    <div className={className}>
      <label className="block text-[10px] uppercase tracking-wide mb-1" style={{ color: DIM }}>{label}</label>
      {children}
    </div>
  );
}

function Empty({ icon: Icon, text }: any) {
  return (
    <div className="rounded-xl py-16 text-center" style={{ background: SURF, border: `1px solid ${BORD}` }}>
      <Icon size={28} style={{ color: DIM, margin: "0 auto 10px" }} />
      <div className="text-xs" style={{ color: MUTED }}>{text}</div>
    </div>
  );
}
