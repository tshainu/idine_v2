import { useEffect, useState, useCallback } from "react";

const TOKEN_KEY = "idsa_token";

function useIdsaToken() {
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) || "");
  const save = (t: string) => { sessionStorage.setItem(TOKEN_KEY, t); setToken(t); };
  const clear = () => { sessionStorage.removeItem(TOKEN_KEY); setToken(""); };
  return { token, save, clear };
}

async function idsaReq(token: string, path: string, method = "GET", body?: object) {
  const res = await fetch(`/api/idsa${path}`, {
    method,
    headers: { "Content-Type": "application/json", "X-Idsa-Token": token },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data as any)?.error || "Request failed");
  return data as any;
}

export default function Idsa() {
  const { token, save, clear } = useIdsaToken();
  if (!token) return <IdsaLogin onLogin={save} />;
  return <IdsaDashboard token={token} onLogout={clear} />;
}

function IdsaLogin({ onLogin }: { onLogin: (token: string) => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const res = await fetch("/api/idsa/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data as any)?.error || "Login failed");
      onLogin((data as any).token);
    } catch (e: any) {
      setError(e.message);
    } finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0A0612", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Poppins, sans-serif" }}>
      <form onSubmit={submit} style={{ width: 380, background: "#160B26", border: "1px solid #3D1F6E", borderRadius: 18, padding: "32px 28px", boxShadow: "0 24px 64px #0008" }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#F5A623" }}>iDSA</div>
          <div style={{ fontSize: 12, color: "#A898C8", marginTop: 4 }}>iDine Software Owner Panel</div>
        </div>
        <label style={{ display: "block", fontSize: 12, color: "#A898C8", marginBottom: 6, textTransform: "uppercase" }}>Owner Password</label>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)}
          placeholder="••••••••" autoFocus
          style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: "1px solid #3D1F6E", background: "#0A0612", color: "#F8F4FF", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
        {error && <div style={{ color: "#EF4444", fontSize: 13, marginTop: 10, textAlign: "center" }}>{error}</div>}
        <button type="submit" disabled={loading}
          style={{ width: "100%", marginTop: 18, padding: 12, borderRadius: 10, border: "none", background: "linear-gradient(135deg,#F5A623,#C47D0E)", color: "#1a1200", fontWeight: 700, cursor: "pointer" }}>
          {loading ? "Checking…" : "Access Panel"}
        </button>
      </form>
    </div>
  );
}

function IdsaDashboard({ token, onLogout }: { token: string; onLogout: () => void }) {
  const [businesses, setBusinesses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingPw, setEditingPw] = useState<any | null>(null);
  const [editingSms, setEditingSms] = useState<any | null>(null);
  const [recharging, setRecharging] = useState<any | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await idsaReq(token, "/businesses");
      setBusinesses(data.businesses || []);
    } catch (e: any) {
      if (e.message === "Unauthorized") onLogout();
      else setError(e.message);
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const suspend = async (id: number) => { await idsaReq(token, `/businesses/${id}/suspend`, "PATCH"); load(); };
  const activate = async (id: number) => { await idsaReq(token, `/businesses/${id}/activate`, "PATCH"); load(); };
  const remove = async (id: number) => {
    if (!confirm("Permanently delete this business?")) return;
    await idsaReq(token, `/businesses/${id}`, "DELETE"); load();
  };

  const C = { bg: "#0A0612", surf: "#160B26", surf2: "#1F0F35", bord: "#3D1F6E", text: "#F8F4FF", muted: "#A898C8", gold: "#F5A623", danger: "#EF4444", success: "#22C55E" };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "Poppins, sans-serif", color: C.text }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 28px", borderBottom: `1px solid ${C.bord}` }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.gold }}>iDSA — Business Manager</div>
          <div style={{ fontSize: 12, color: C.muted }}>iDine Software Owner Panel</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => setCreating(true)} style={{ background: C.gold, color: "#1a1200", border: "none", padding: "9px 16px", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontSize: 13 }}>+ Create New Business</button>
          <button onClick={onLogout} style={{ background: "transparent", color: C.muted, border: `1px solid ${C.bord}`, padding: "9px 16px", borderRadius: 8, cursor: "pointer", fontSize: 13 }}>Logout</button>
        </div>
      </div>

      <div style={{ padding: 28 }}>
        {error && <div style={{ color: C.danger, marginBottom: 16 }}>{error}</div>}
        {loading ? (
          <div style={{ color: C.muted }}>Loading businesses…</div>
        ) : businesses.length === 0 ? (
          <div style={{ color: C.muted, textAlign: "center", padding: 60 }}>No businesses yet. Create the first one.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
            {businesses.map(b => (
              <div key={b.id} style={{ background: C.surf, border: `1px solid ${C.bord}`, borderRadius: 14, padding: 18, position: "relative" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{b.businessName}</div>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6,
                    background: b.status === "active" ? `${C.success}22` : `${C.danger}22`,
                    color: b.status === "active" ? C.success : C.danger,
                  }}>{b.status.toUpperCase()}</span>
                </div>
                <div style={{ background: C.surf2, borderRadius: 8, padding: 10, fontSize: 12, lineHeight: 1.8, fontFamily: "monospace" }}>
                  <div>🪪 User ID: <strong style={{ color: C.gold }}>{b.userId}</strong></div>
                  <div>👤 Username: <strong>{b.username}</strong></div>
                  <div>🔑 Password: <strong>{b.passwordPlain}</strong></div>
                </div>
                {/* Messaging platform config + credit balance */}
                <div style={{ background: C.surf2, borderRadius: 8, padding: 10, fontSize: 12, lineHeight: 1.7, marginTop: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ color: C.muted }}>SMS Credits</span>
                    <strong style={{ color: Number(b.smsCredits ?? 0) > 0 ? C.success : C.danger }}>
                      LKR {Number(b.smsCredits ?? 0).toFixed(2)}
                    </strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: C.muted }}>Sender IDs</span>
                    <strong style={{ color: b.senderIds ? C.text : C.danger }}>{b.senderIds || "not set"}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: C.muted }}>SMS link</span>
                    <strong style={{ color: b.smsExecutionLink ? C.success : C.muted, fontSize: 11 }}>
                      {b.smsExecutionLink ? "custom" : "default"}
                    </strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: C.muted }}>WhatsApp</span>
                    <strong style={{ color: b.whatsappPhoneId && b.whatsappToken ? C.success : C.muted, fontSize: 11 }}>
                      {b.whatsappPhoneId && b.whatsappToken ? "configured" : "not set"}
                    </strong>
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                    <button onClick={() => setRecharging(b)}
                      style={{ flex: 1, background: C.gold, color: "#1a1200", border: "none", borderRadius: 6, padding: "6px 0", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                      Recharge Credits
                    </button>
                    <button onClick={() => setEditingSms(b)}
                      style={{ flex: 1, background: "transparent", color: C.muted, border: `1px solid ${C.bord}`, borderRadius: 6, padding: "6px 0", fontSize: 11, cursor: "pointer" }}>
                      SMS Settings
                    </button>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
                  {b.status === "active" ? (
                    <button onClick={() => suspend(b.id)} style={{ flex: 1, background: "transparent", color: C.danger, border: `1px solid ${C.danger}`, borderRadius: 6, padding: "6px 0", fontSize: 12, cursor: "pointer" }}>Suspend</button>
                  ) : (
                    <button onClick={() => activate(b.id)} style={{ flex: 1, background: "transparent", color: C.success, border: `1px solid ${C.success}`, borderRadius: 6, padding: "6px 0", fontSize: 12, cursor: "pointer" }}>Activate</button>
                  )}
                  <button onClick={() => setEditingPw(b)} style={{ flex: 1, background: "transparent", color: C.muted, border: `1px solid ${C.bord}`, borderRadius: 6, padding: "6px 0", fontSize: 12, cursor: "pointer" }}>Edit Password</button>
                  <button onClick={() => remove(b.id)} style={{ background: "transparent", color: C.danger, border: `1px solid ${C.bord}`, borderRadius: 6, padding: "6px 10px", fontSize: 12, cursor: "pointer" }}>✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {creating && <CreateBusinessModal token={token} C={C} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); load(); }} />}
      {editingPw && <EditPasswordModal token={token} C={C} business={editingPw} onClose={() => setEditingPw(null)} onSaved={() => { setEditingPw(null); load(); }} />}
      {editingSms && <SmsConfigModal token={token} C={C} business={editingSms} onClose={() => setEditingSms(null)} onSaved={() => { setEditingSms(null); load(); }} />}
      {recharging && <RechargeModal token={token} C={C} business={recharging} onClose={() => setRecharging(null)} onSaved={() => { setRecharging(null); load(); }} />}
    </div>
  );
}

function CreateBusinessModal({ token, C, onClose, onCreated }: any) {
  const [businessName, setBusinessName] = useState("");
  const [password, setPassword] = useState("");
  const [branchAddress, setBranchAddress] = useState("");
  const [branchPhone, setBranchPhone] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!businessName.trim() || !password.trim()) { setError("Business name and password are required"); return; }
    setLoading(true); setError("");
    try {
      await idsaReq(token, "/businesses", "POST", { businessName: businessName.trim(), password: password.trim(), branchAddress, branchPhone });
      onCreated();
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };

  const inp = { width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.bord}`, background: C.bg, color: C.text, fontSize: 13, outline: "none", boxSizing: "border-box" as const, marginTop: 6 };

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000000aa", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
      <div style={{ width: 420, background: C.surf, border: `1px solid ${C.bord}`, borderRadius: 16, padding: 24 }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>Create New Business</div>
        <label style={{ fontSize: 12, color: C.muted }}>Business Name</label>
        <input style={inp} value={businessName} onChange={e => setBusinessName(e.target.value)} placeholder="e.g. Sunset Cafe" />
        <label style={{ fontSize: 12, color: C.muted, display: "block", marginTop: 12 }}>Admin Password</label>
        <input style={inp} value={password} onChange={e => setPassword(e.target.value)} placeholder="Set a password for this business" />
        <label style={{ fontSize: 12, color: C.muted, display: "block", marginTop: 12 }}>Branch Address (optional)</label>
        <input style={inp} value={branchAddress} onChange={e => setBranchAddress(e.target.value)} placeholder="Street address" />
        <label style={{ fontSize: 12, color: C.muted, display: "block", marginTop: 12 }}>Branch Phone (optional)</label>
        <input style={inp} value={branchPhone} onChange={e => setBranchPhone(e.target.value)} placeholder="+94 ..." />
        {error && <div style={{ color: C.danger, fontSize: 13, marginTop: 10 }}>{error}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
          <button onClick={onClose} style={{ flex: 1, background: "transparent", border: `1px solid ${C.bord}`, color: C.muted, borderRadius: 8, padding: 10, cursor: "pointer" }}>Cancel</button>
          <button onClick={submit} disabled={loading} style={{ flex: 1, background: C.gold, border: "none", color: "#1a1200", borderRadius: 8, padding: 10, fontWeight: 700, cursor: "pointer" }}>
            {loading ? "Creating…" : "Create Business"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditPasswordModal({ token, C, business, onClose, onSaved }: any) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!password.trim()) { setError("Password required"); return; }
    setLoading(true); setError("");
    try {
      await idsaReq(token, `/businesses/${business.id}/password`, "PATCH", { password: password.trim() });
      onSaved();
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000000aa", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
      <div style={{ width: 360, background: C.surf, border: `1px solid ${C.bord}`, borderRadius: 16, padding: 24 }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Reset Password</div>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 14 }}>{business.businessName} — {business.userId}</div>
        <input style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.bord}`, background: C.bg, color: C.text, fontSize: 13, outline: "none", boxSizing: "border-box" }}
          value={password} onChange={e => setPassword(e.target.value)} placeholder="New password" />
        {error && <div style={{ color: C.danger, fontSize: 13, marginTop: 10 }}>{error}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
          <button onClick={onClose} style={{ flex: 1, background: "transparent", border: `1px solid ${C.bord}`, color: C.muted, borderRadius: 8, padding: 10, cursor: "pointer" }}>Cancel</button>
          <button onClick={submit} disabled={loading} style={{ flex: 1, background: C.gold, border: "none", color: "#1a1200", borderRadius: 8, padding: 10, fontWeight: 700, cursor: "pointer" }}>
            {loading ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SmsConfigModal({ token, C, business, onClose, onSaved }: any) {
  const [smsExecutionLink, setSmsExecutionLink] = useState(business.smsExecutionLink || "");
  const [senderIds, setSenderIds] = useState(business.senderIds || "");
  const [whatsappPhoneId, setWhatsappPhoneId] = useState(business.whatsappPhoneId || "");
  const [whatsappToken, setWhatsappToken] = useState(business.whatsappToken || "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true); setError("");
    try {
      await idsaReq(token, `/businesses/${business.id}/sms-config`, "PATCH", {
        smsExecutionLink, senderIds, whatsappPhoneId, whatsappToken,
      });
      onSaved();
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };

  const inp = { width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.bord}`, background: C.bg, color: C.text, fontSize: 13, outline: "none", boxSizing: "border-box" as const, marginTop: 6 };
  const lbl = { fontSize: 12, color: C.muted, display: "block", marginTop: 12 };
  const hint = { fontSize: 11, color: C.muted, opacity: 0.7, marginTop: 4 };

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000000aa", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20 }}>
      <div style={{ width: 520, maxHeight: "90vh", overflow: "auto", background: C.surf, border: `1px solid ${C.bord}`, borderRadius: 16, padding: 24 }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Messaging Settings</div>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 14 }}>{business.businessName} — {business.userId}</div>

        <label style={{ ...lbl, marginTop: 0 }}>SMS Execution Link</label>
        <input style={inp} value={smsExecutionLink} onChange={e => setSmsExecutionLink(e.target.value)}
          placeholder="https://urbanpos.lk/demo/notification/users/sms_bk.php" />
        <div style={hint}>Leave blank to use the platform default. Called with message, phone_no, sender_id.</div>

        <label style={lbl}>Sender IDs</label>
        <input style={inp} value={senderIds} onChange={e => setSenderIds(e.target.value)}
          placeholder="IDINE, CHAVA" />
        <div style={hint}>Comma separated. The first one is this business's default sender.</div>

        <div style={{ borderTop: `1px solid ${C.bord}`, marginTop: 18, paddingTop: 6 }} />
        <label style={lbl}>WhatsApp Phone Number ID</label>
        <input style={inp} value={whatsappPhoneId} onChange={e => setWhatsappPhoneId(e.target.value)}
          placeholder="Meta Cloud API phone number id" />

        <label style={lbl}>WhatsApp Access Token</label>
        <input style={inp} value={whatsappToken} onChange={e => setWhatsappToken(e.target.value)}
          placeholder="Permanent access token" />
        <div style={hint}>Both fields are required before this business can send on WhatsApp.</div>

        {error && <div style={{ color: C.danger, fontSize: 13, marginTop: 10 }}>{error}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
          <button onClick={onClose} style={{ flex: 1, background: "transparent", border: `1px solid ${C.bord}`, color: C.muted, borderRadius: 8, padding: 10, cursor: "pointer" }}>Cancel</button>
          <button onClick={submit} disabled={loading} style={{ flex: 1, background: C.gold, border: "none", color: "#1a1200", borderRadius: 8, padding: 10, fontWeight: 700, cursor: "pointer" }}>
            {loading ? "Saving…" : "Save Settings"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RechargeModal({ token, C, business, onClose, onSaved }: any) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [transactions, setTransactions] = useState<any[]>([]);

  useEffect(() => {
    idsaReq(token, `/businesses/${business.id}/credits`)
      .then(d => setTransactions(d.transactions || []))
      .catch(() => {});
  }, [business.id]);

  const submit = async () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value === 0) { setError("Enter a non-zero amount"); return; }
    setLoading(true); setError("");
    try {
      await idsaReq(token, `/businesses/${business.id}/credits`, "POST", { amount: value, note });
      onSaved();
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };

  const inp = { width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.bord}`, background: C.bg, color: C.text, fontSize: 13, outline: "none", boxSizing: "border-box" as const, marginTop: 6 };

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000000aa", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20 }}>
      <div style={{ width: 460, maxHeight: "90vh", overflow: "auto", background: C.surf, border: `1px solid ${C.bord}`, borderRadius: 16, padding: 24 }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Recharge SMS Credits</div>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 14 }}>{business.businessName} — {business.userId}</div>

        <div style={{ background: C.surf2, borderRadius: 8, padding: 12, marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: C.muted }}>Current balance</span>
          <strong style={{ fontSize: 18, color: C.gold }}>LKR {Number(business.smsCredits ?? 0).toFixed(2)}</strong>
        </div>

        <label style={{ fontSize: 12, color: C.muted }}>Amount (LKR)</label>
        <input style={inp} value={amount} onChange={e => setAmount(e.target.value)} placeholder="e.g. 5000" type="number" autoFocus />
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          {[1000, 2500, 5000, 10000].map(v => (
            <button key={v} onClick={() => setAmount(String(v))}
              style={{ flex: 1, background: "transparent", border: `1px solid ${C.bord}`, color: C.muted, borderRadius: 6, padding: "6px 0", fontSize: 11, cursor: "pointer" }}>
              {v.toLocaleString()}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: C.muted, opacity: 0.7, marginTop: 6 }}>
          1 LKR = 1 SMS segment. Use a negative amount to deduct. The balance appears in the
          restaurant's Message Platform immediately.
        </div>

        <label style={{ fontSize: 12, color: C.muted, display: "block", marginTop: 12 }}>Note (optional)</label>
        <input style={inp} value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Paid via bank transfer" />

        {error && <div style={{ color: C.danger, fontSize: 13, marginTop: 10 }}>{error}</div>}

        <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
          <button onClick={onClose} style={{ flex: 1, background: "transparent", border: `1px solid ${C.bord}`, color: C.muted, borderRadius: 8, padding: 10, cursor: "pointer" }}>Cancel</button>
          <button onClick={submit} disabled={loading} style={{ flex: 1, background: C.gold, border: "none", color: "#1a1200", borderRadius: 8, padding: 10, fontWeight: 700, cursor: "pointer" }}>
            {loading ? "Saving…" : "Add Credits"}
          </button>
        </div>

        {transactions.length > 0 && (
          <div style={{ marginTop: 20, borderTop: `1px solid ${C.bord}`, paddingTop: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Recent transactions</div>
            <div style={{ maxHeight: 180, overflow: "auto" }}>
              {transactions.map(t => (
                <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${C.bord}33`, fontSize: 11 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: C.text }}>{t.note || t.type}</div>
                    <div style={{ color: C.muted, opacity: 0.7 }}>{new Date(t.createdAt).toLocaleString("en-GB")}</div>
                  </div>
                  <div style={{ textAlign: "right", whiteSpace: "nowrap", marginLeft: 10 }}>
                    <div style={{ color: t.amount > 0 ? C.success : C.danger, fontWeight: 700 }}>
                      {t.amount > 0 ? "+" : ""}{Number(t.amount).toFixed(2)}
                    </div>
                    <div style={{ color: C.muted, opacity: 0.7 }}>bal {Number(t.balanceAfter).toFixed(2)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
