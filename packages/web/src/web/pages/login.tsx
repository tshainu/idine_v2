import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { setUser, setBranchId } from "../lib/store";

export default function Login() {
  const [userId, setUserId] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [, navigate] = useLocation();

  const loginMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: userId.trim(), username: username.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data as any)?.error || "Login failed");
      return data as any;
    },
    onSuccess: (data) => {
      const user = data?.user ?? data;
      setUser(user);
      // Scope this session to the logged-in user's own business/branch —
      // without this every business would see branch 1's (demo) data.
      if (user?.branchId) setBranchId(user.branchId);
      const role = user?.role;
      if (role === "kitchen" || role === "kds") navigate("/kds");
      else if (String(role || "").toLowerCase() === "cashier") navigate("/pos");
      else navigate("/home");
    },
    onError: (e: any) => setError(e.message || "Login failed"),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!userId.trim() || !username.trim() || !password) {
      setError("All fields are required");
      return;
    }
    loginMutation.mutate();
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "var(--color-surface-2)",
    border: "1px solid var(--color-border)",
    borderRadius: 10,
    color: "var(--color-text)",
    padding: "12px 14px",
    fontSize: 14,
    outline: "none",
    fontFamily: "inherit",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    color: "var(--color-text-muted)",
    fontSize: 12,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "radial-gradient(circle at top, var(--color-surface-2), var(--color-bg) 70%)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 20,
    }}>
      <div style={{ width: 400, maxWidth: "100%" }}>
        {/* Logo / Brand */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <img src="/logo-login.png" alt="iDine"
            style={{ width: 200, maxWidth: "60vw", height: "auto", margin: "0 auto", display: "block", objectFit: "contain" }} />
          <p style={{ color: "var(--color-text-muted)", fontSize: 13, marginTop: 12 }}>Sign in to your business account</p>
        </div>

        {/* Card */}
        <form onSubmit={submit} style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: 20,
          padding: "32px 28px",
          boxShadow: "0 24px 64px #0006",
        }}>
          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>Business User ID</label>
            <input style={inputStyle} value={userId} onChange={e => setUserId(e.target.value)}
              placeholder="e.g. ELE5236" autoComplete="off" />
          </div>

          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>Username</label>
            <input style={inputStyle} value={username} onChange={e => setUsername(e.target.value)}
              placeholder="e.g. admin" autoComplete="off" />
          </div>

          <div style={{ marginBottom: 8 }}>
            <label style={labelStyle}>Password</label>
            <div style={{ position: "relative" }}>
              <input style={{ ...inputStyle, paddingRight: 44 }} type={showPw ? "text" : "password"}
                value={password} onChange={e => setPassword(e.target.value)}
                placeholder="Enter password" autoComplete="off" />
              <button type="button" onClick={() => setShowPw(v => !v)}
                style={{
                  position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                  background: "transparent", border: "none", color: "var(--color-text-dim)",
                  cursor: "pointer", fontSize: 12,
                }}>
                {showPw ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {error && (
            <div style={{
              color: "var(--color-danger)", fontSize: 13, marginTop: 12, marginBottom: 4,
              textAlign: "center", background: "var(--color-surface-2)", borderRadius: 8, padding: "8px 10px",
            }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loginMutation.isPending}
            style={{
              width: "100%",
              marginTop: 18,
              padding: "13px",
              borderRadius: 10,
              border: "none",
              background: "linear-gradient(135deg, var(--color-gold), var(--color-gold-dark))",
              color: "#1a1200",
              fontWeight: 700,
              fontSize: 15,
              cursor: loginMutation.isPending ? "default" : "pointer",
              opacity: loginMutation.isPending ? 0.7 : 1,
              boxShadow: "0 8px 24px var(--color-gold)33",
            }}>
            {loginMutation.isPending ? "Signing in…" : "Sign In"}
          </button>
        </form>

        <p style={{ color: "var(--color-text-dim)", fontSize: 12, textAlign: "center", marginTop: 20 }}>
          iDine POS · Multi-Branch Edition
        </p>
      </div>
    </div>
  );
}
