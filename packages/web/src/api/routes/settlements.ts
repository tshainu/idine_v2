import { Hono } from "hono";
import { and, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { db } from "../database";
import * as schema from "../database/schema";

export const settlements = new Hono()
  .get("/", async (c) => {
    const branchId = Number(c.req.query("branchId"));
    const from = c.req.query("from");
    const to = c.req.query("to");
    const settledById = Number(c.req.query("settledById"));
    const conditions = [] as any[];
    if (branchId) conditions.push(eq(schema.registerSettlements.branchId, branchId));
    if (from) conditions.push(gte(schema.registerSettlements.settlementDate, new Date(from)));
    if (to) conditions.push(lt(schema.registerSettlements.settlementDate, new Date(to)));
    if (settledById) conditions.push(eq(schema.registerSettlements.settledById, settledById));
    const rows = conditions.length
      ? await db.select().from(schema.registerSettlements).where(and(...conditions)).orderBy(desc(schema.registerSettlements.settlementDate))
      : await db.select().from(schema.registerSettlements).orderBy(desc(schema.registerSettlements.settlementDate));
    return c.json({ settlements: rows }, 200);
  })
  .post("/", async (c) => {
    const body = await c.req.json();
    const branchId = Number(body.branchId);
    let billedAmount = Number(body.billedAmount);
    let settledAmount = Number(body.settledAmount);
    let cashAmount = Number(body.cashAmount ?? 0);
    let cardAmount = Number(body.cardAmount ?? 0);
    let qrAmount = Number(body.qrAmount ?? 0);
    const cashInHand = Number(body.cashInHand ?? 0);
    const justification = String(body.justification || "").trim();
    if (!branchId || !Number.isFinite(billedAmount) || billedAmount < 0 || !Number.isFinite(settledAmount) || settledAmount < 0 || !Number.isFinite(cashAmount) || cashAmount < 0 || !Number.isFinite(cardAmount) || cardAmount < 0 || !Number.isFinite(qrAmount) || qrAmount < 0 || !Number.isFinite(cashInHand) || cashInHand < 0) {
      return c.json({ error: "Valid branch, billed amount, and settled amount are required." }, 400);
    }
    const settledAt = body.settlementDate ? new Date(body.settlementDate) : new Date();
    if (Number.isNaN(settledAt.getTime())) return c.json({ error: "Invalid settlement date." }, 400);

    // Never trust client-calculated tender totals for a register settlement.
    // Recompute from the finalized invoices selected by the POS. Cash tender
    // above an invoice total is change and must not become sales or paid value.
    const orderIds = Array.isArray(body.orderIds)
      ? [...new Set(body.orderIds.map((id: unknown) => Number(id)).filter((id: number) => Number.isInteger(id) && id > 0))]
      : [];
    if (orderIds.length) {
      const selectedOrders = await db.select({
        id: schema.orders.id,
        branchId: schema.orders.branchId,
        status: schema.orders.status,
        total: schema.orders.total,
        paymentMethod: schema.orders.paymentMethod,
        paymentsJson: schema.orders.paymentsJson,
      }).from(schema.orders).where(and(eq(schema.orders.branchId, branchId), inArray(schema.orders.id, orderIds)));
      const finalized = selectedOrders.filter(order => ["completed", "billed", "paid"].includes(String(order.status || "").toLowerCase()));
      if (finalized.length !== orderIds.length) return c.json({ error: "Settlement contains an invalid or unfinished order." }, 400);
      const allocated = finalized.reduce((acc, order) => {
        const invoiceTotal = Math.max(0, Number(order.total || 0));
        acc.billed += invoiceTotal;
        let remaining = invoiceTotal;
        let parts: any[] = [];
        try {
          const parsed = typeof order.paymentsJson === "string" ? JSON.parse(order.paymentsJson) : order.paymentsJson;
          if (Array.isArray(parsed) && parsed.length) parts = parsed;
        } catch { /* use the legacy payment fields below */ }
        if (!parts.length) parts = [{ method: order.paymentMethod || "Card", amount: invoiceTotal }];
        for (const part of parts) {
          const amount = Math.min(Math.max(0, Number(part?.amount || 0)), remaining);
          remaining = Math.max(0, remaining - amount);
          const method = String(part?.method || "").toLowerCase();
          if (method === "cash") acc.cash += amount;
          else if (method.includes("qr")) acc.qr += amount;
          else if (method.includes("card")) acc.card += amount;
        }
        return acc;
      }, { billed: 0, cash: 0, card: 0, qr: 0 });
      billedAmount = Number(allocated.billed.toFixed(2));
      cashAmount = Number(allocated.cash.toFixed(2));
      cardAmount = Number(allocated.card.toFixed(2));
      qrAmount = Number(allocated.qr.toFixed(2));
      settledAmount = Number((cashAmount + cardAmount + qrAmount).toFixed(2));
    }
    const [settlement] = await db.insert(schema.registerSettlements).values({
      branchId,
      settlementDate: settledAt,
      billedAmount: Number(billedAmount.toFixed(2)),
      settledAmount: Number(settledAmount.toFixed(2)),
      cashAmount: Number(cashAmount.toFixed(2)),
      cardAmount: Number(cardAmount.toFixed(2)),
      qrAmount: Number(qrAmount.toFixed(2)),
      cashInHand: Number(cashInHand.toFixed(2)),
      justification: justification || null,
      settledById: body.settledById ? Number(body.settledById) : null,
      settledByName: body.settledByName ? String(body.settledByName) : null,
    }).returning();
    return c.json({ settlement }, 201);
  });
