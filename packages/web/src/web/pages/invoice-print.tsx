import { useEffect, useState } from "react";
import { useParams, useSearch } from "wouter";
import { api } from "../lib/api";
import { Printer, X } from "lucide-react";

export default function InvoicePrint() {
  const { id } = useParams<{ id: string }>();
  const search = useSearch();
  const mode = new URLSearchParams(search).get("mode") || "invoice"; // "bill" | "invoice"
  const isBill = mode === "bill";

  const [order, setOrder]               = useState<any>(null);
  const [items, setItems]               = useState<any[]>([]);
  const [branch, setBranch]             = useState<any>(null);
  const [invoiceHeader, setInvoiceHeader] = useState<string | null>(null);
  const [settings, setSettings]         = useState<Record<string, string>>({});
  const [error, setError]               = useState("");

  useEffect(() => {
    document.body.style.background = "#e5e7eb";
    return () => { document.body.style.background = ""; };
  }, []);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const [orderRes, branchRes, settingsRes] = await Promise.all([
          (await api.orders[":id"].$get({ param: { id } })).json() as any,
          (await api.branches.$get()).json() as any,
          fetch("/api/settings?branchId=1").then(r => r.json()) as any,
        ]);
        setOrder(orderRes.order);
        setItems(orderRes.items || []);
        setBranch(branchRes.branches?.[0] || null);
        const s = settingsRes?.settings as Record<string, string> || {};
        setSettings(s);
        if (s.invoiceHeader) setInvoiceHeader(s.invoiceHeader);
      } catch {
        setError("Failed to load invoice");
      }
    })();
  }, [id]);

  useEffect(() => {
    if (order) document.title = `${isBill ? "Bill" : "Invoice"} ${order.orderNumber}`;
  }, [order, isBill]);

  const money = (n: number) => `LKR ${Number(n || 0).toFixed(2)}`;

  const formatDate = (d: string) => {
    const dt = new Date(d);
    return dt.toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  };

  const typeLabel: Record<string, string> = {
    "dine-in": "DINE IN",
    "takeaway": "TAKEAWAY",
    "delivery": "DELIVERY",
  };

  if (error) return (
    <div style={{ fontFamily: "monospace", padding: 32, textAlign: "center", color: "#dc2626" }}>{error}</div>
  );
  if (!order) return (
    <div style={{ fontFamily: "monospace", padding: 32, textAlign: "center", color: "#6b7280" }}>Loading…</div>
  );

  // ── Financials ──────────────────────────────────────────────────────────────
  // Order-item totals are net of line discounts. Restore those line discounts
  // so the invoice subtotal is gross before the order-level discount.
  const offerDiscount = items.reduce((s: number, i: any) => {
    const saving = Math.max(0, Number(i.promotionOriginalPrice || 0) - Number(i.price || 0));
    return s + saving * Number(i.qty || 1);
  }, 0);
  const subtotal = items.reduce((s: number, i: any) => s + Number(i.total || 0) + Number(i.discount || 0), 0) + offerDiscount;

  // For bill: compute service charge from settings rate (since it's not paid yet)
  const serviceChargeRate = parseFloat((settings.serviceCharge || "0").replace("%", "")) / 100;
  const lineDiscount  = items.reduce((s: number, i: any) => s + Number(i.discount || 0), 0);
  const savedDiscount = Number(order.discount || 0);
  const configuredDiscount = Number(order.discountValue || 0);
  const ruleDiscount = configuredDiscount > 0
    ? (String(order.discountType || "").toLowerCase().startsWith("percent")
      ? subtotal * configuredDiscount / 100
      : configuredDiscount)
    : 0;
  const discount      = savedDiscount > 0 ? savedDiscount : Math.max(lineDiscount + offerDiscount, ruleDiscount);
  const discountLabel = order.discountName || items.find((item: any) => item.promotionName)?.promotionName || "Discount";

  // For invoice: use saved value; fall back to live-computed if not stored (old orders)
  const serviceChargeLive = parseFloat(((subtotal - discount) * serviceChargeRate).toFixed(2));
  // For invoice: use saved value if > 0 (actually paid orders); fall back to live-computed for old/migrated orders
  const serviceCharge = isBill
    ? serviceChargeLive
    : (Number(order.serviceCharge) > 0 ? Number(order.serviceCharge) : serviceChargeLive);

  // Always derive total from subtotal + service charge so it's consistent
  const total = parseFloat((subtotal - discount + serviceCharge).toFixed(2));

  const amountPaid    = Number(order.amountPaid || 0);
  const cashGiven     = Number(order.cashGiven || 0);
  const balance       = Number(order.balance || 0);
  const paymentMethod = order.paymentMethod || "Cash";

  let payments: { method: string; amount: number; ref?: string }[] = [];
  try { payments = JSON.parse(order.paymentsJson || "[]"); } catch {}

  const footerText = settings.invoiceFooter || "Thank you for visiting us!\niDine POS";

  // ── Components ──────────────────────────────────────────────────────────────
  const Divider = ({ dashed }: { dashed?: boolean }) => (
    <div style={{
      borderTop: dashed ? "1px dashed #000" : "1px solid #000",
      margin: "6px 0",
    }} />
  );

  const Row = ({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) => (
    <div style={{
      display: "flex", justifyContent: "space-between",
      fontSize: bold ? 14 : 11,
      fontWeight: bold ? 800 : 400,
      color: color || "#000",
      padding: "2px 0",
    }}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; background: #e5e7eb; }

        @media print {
          body { background: #fff !important; }
          .no-print { display: none !important; }
          .receipt { box-shadow: none !important; margin: 0 !important; }
          .page-wrap { padding: 0 !important; background: #fff !important; }
        }

        @page {
          size: 80mm auto;
          margin: 4mm 4mm;
        }
      `}</style>

      {/* Screen toolbar */}
      <div className="no-print" style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 50,
        background: "#111827", padding: "10px 20px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <span style={{ color: "#9ca3af", fontSize: 12, fontWeight: 600, fontFamily: "monospace" }}>
          80mm {isBill ? "Bill" : "Invoice"} — {order?.orderNumber}
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => window.print()} style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "var(--color-gold)", color: "#111827", border: "none",
            padding: "7px 16px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer",
            fontFamily: "sans-serif",
          }}>
            <Printer size={14} /> Print
          </button>
          <button onClick={() => window.close()} style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "transparent", color: "#6b7280", border: "1px solid #374151",
            padding: "7px 14px", borderRadius: 8, fontSize: 13, cursor: "pointer",
            fontFamily: "sans-serif",
          }}>
            <X size={14} /> Close
          </button>
        </div>
      </div>

      {/* Page wrap */}
      <div className="page-wrap" style={{
        paddingTop: 60, paddingBottom: 40, minHeight: "100vh",
        background: "#e5e7eb", display: "flex", justifyContent: "center",
      }}>
        {/* Receipt */}
        <div className="receipt" style={{
          width: 302,
          background: "#fff",
          fontFamily: "'Courier New', Courier, monospace",
          fontSize: 12,
          color: "#000",
          padding: "16px 14px 20px",
          boxShadow: "0 4px 24px rgba(0,0,0,0.18)",
          alignSelf: "flex-start",
          marginTop: 8,
        }}>

          {/* Header: image OR text */}
          {invoiceHeader ? (
            <div style={{ textAlign: "center", marginBottom: 10 }}>
              <img
                src={invoiceHeader}
                alt="Invoice Header"
                style={{ width: "100%", maxWidth: 274, display: "block", margin: "0 auto" }}
              />
            </div>
          ) : (
            <div style={{ textAlign: "center", marginBottom: 10 }}>
              <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: 2, color: "#000" }}>
                {(settings.restaurantName || branch?.name || "RESTAURANT").toUpperCase()}
              </div>
              {branch?.address && (
                <div style={{ fontSize: 10, color: "#000", marginTop: 3, lineHeight: 1.5 }}>
                  {branch.address}
                </div>
              )}
              {branch?.phone && (
                <div style={{ fontSize: 10, color: "#000", marginTop: 1 }}>
                  Tel: {branch.phone}
                </div>
              )}
            </div>
          )}

          {/* Doc type label */}
          <div style={{ textAlign: "center", marginBottom: 6 }}>
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: 2,
              textTransform: "uppercase",
              padding: "2px 10px",
              border: "1px solid #000",
              color: "#000",
            }}>
              {isBill ? "BILL" : "INVOICE"}
            </span>
          </div>

          {/* Order type — big & centered, right under the Bill/Invoice label */}
          <div style={{ textAlign: "center", marginBottom: 8 }}>
            <span style={{
              fontSize: 16, fontWeight: 900, letterSpacing: 1.5,
              textTransform: "uppercase", color: "#000",
            }}>
              {typeLabel[order.type] || order.type}
            </span>
          </div>

          <Divider />

          {/* Order meta */}
          <div style={{ fontSize: 11, lineHeight: 1.7 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#000" }}>Order#</span>
              <span style={{ fontWeight: 700 }}>{order.orderNumber}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#000" }}>Date</span>
              <span>{formatDate(order.createdAt)}</span>
            </div>
            {order.tableId && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#000" }}>Table</span>
                <span>{order.tableId}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#000" }}>Customer</span>
              <span>{order.customerName || "Walk-in"}</span>
            </div>
          </div>

          <Divider />

          {/* Column headers */}
          <div style={{
            display: "flex", justifyContent: "space-between",
            fontSize: 10, color: "#000", fontWeight: 700,
            textTransform: "uppercase", paddingBottom: 4,
          }}>
            <span style={{ flex: 1 }}>Item</span>
            <span style={{ width: 28, textAlign: "center" }}>Qty</span>
            <span style={{ width: 72, textAlign: "right" }}>Amt</span>
          </div>

          <Divider dashed />

          {/* Items */}
          {items.map((it: any, i: number) => (
            <div key={i}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "3px 0" }}>
                <span style={{ flex: 1, lineHeight: 1.4, paddingRight: 4, fontSize: 12 }}>
                  {it.name}
                  {it.promotionName && <div style={{ fontSize: 10, fontStyle: "italic" }}>{it.promotionName}{it.promotionOriginalPrice ? ` (Original: ${Number(it.promotionOriginalPrice).toFixed(2)})` : ""}</div>}
                </span>
                <span style={{ width: 28, textAlign: "center", fontSize: 12 }}>{it.qty}</span>
                <span style={{ width: 72, textAlign: "right", fontSize: 12, fontWeight: 600 }}>
                  {Number(it.total).toFixed(2)}
                </span>
              </div>
              {it.qty > 1 && (
                <div style={{ fontSize: 10, color: "#000", paddingBottom: 2 }}>
                  @ {Number(it.price).toFixed(2)} each
                </div>
              )}
            </div>
          ))}

          <Divider dashed />

          {/* Totals */}
          <div style={{ paddingTop: 2 }}>
            <Row label="Subtotal" value={`LKR ${subtotal.toFixed(2)}`} />
            {discount > 0 && <Row label={discountLabel} value={`- LKR ${discount.toFixed(2)}`} color="#000" />}
            {(serviceCharge > 0 || serviceChargeRate > 0) && <Row label={`Service Charge${serviceChargeRate > 0 ? ` (${(serviceChargeRate*100).toFixed(0)}%)` : ''}`} value={`LKR ${serviceCharge.toFixed(2)}`} />}
          </div>

          <Divider />

          {/* Grand total */}
          <div style={{
            display: "flex", justifyContent: "space-between",
            fontSize: 16, fontWeight: 900, padding: "4px 0 6px",
          }}>
            <span>TOTAL</span>
            <span>{money(total)}</span>
          </div>

          {/* Payment section — invoice only */}
          {!isBill && (
            <>
              <Divider dashed />
              <div style={{ paddingTop: 2 }}>
                {/* Multiple payments */}
                {payments.length > 1 ? (
                  payments.map((p, i) => (
                    <Row key={i}
                      label={`Paid (${p.method})${p.ref ? ` — ${p.ref}` : ""}`}
                      value={`LKR ${p.amount.toFixed(2)}`}
                    />
                  ))
                ) : (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "2px 0", color: "#000" }}>
                    <span>Payment Method</span>
                    <span style={{ fontWeight: 700 }}>{paymentMethod}</span>
                  </div>
                )}
                {paymentMethod === "Cash" && cashGiven > 0 && (
                  <Row label="Cash Given" value={money(cashGiven)} />
                )}
                <Divider />
                <Row label="AMOUNT PAID" value={money(amountPaid)} bold />
                {balance > 0 && (
                  <Row label="Balance (Change)" value={money(balance)} color="#000" />
                )}
                {balance < 0 && (
                  <Row label="Balance Due" value={money(Math.abs(balance))} color="#000" />
                )}
              </div>
            </>
          )}

          {/* Notes */}
          {order.notes && (
            <div style={{ fontSize: 10, color: "#000", margin: "6px 0", lineHeight: 1.5 }}>
              Note: {order.notes}
            </div>
          )}

          <Divider />

          {/* Footer */}
          <div style={{ textAlign: "center", marginTop: 10, fontSize: 11, lineHeight: 1.8 }}>
            {footerText.split("\n").map((line: string, i: number) => (
              <div key={i} style={{ color: "#000", fontWeight: i === 0 ? 700 : 400 }}>
                {line}
              </div>
            ))}
          </div>

        </div>
      </div>
    </>
  );
}
