import { Hono } from "hono";
import { and, desc, eq, gte, lt } from "drizzle-orm";
import { db } from "../database";
import * as schema from "../database/schema";

export const settlements = new Hono()
  .get("/", async (c) => {
    const branchId = Number(c.req.query("branchId"));
    const from = c.req.query("from");
    const to = c.req.query("to");
    const conditions = [] as any[];
    if (branchId) conditions.push(eq(schema.registerSettlements.branchId, branchId));
    if (from) conditions.push(gte(schema.registerSettlements.settlementDate, new Date(from)));
    if (to) conditions.push(lt(schema.registerSettlements.settlementDate, new Date(to)));
    const rows = conditions.length
      ? await db.select().from(schema.registerSettlements).where(and(...conditions)).orderBy(desc(schema.registerSettlements.settlementDate))
      : await db.select().from(schema.registerSettlements).orderBy(desc(schema.registerSettlements.settlementDate));
    return c.json({ settlements: rows }, 200);
  })
  .post("/", async (c) => {
    const body = await c.req.json();
    const branchId = Number(body.branchId);
    const billedAmount = Number(body.billedAmount);
    const settledAmount = Number(body.settledAmount);
    const justification = String(body.justification || "").trim();
    if (!branchId || !Number.isFinite(billedAmount) || billedAmount < 0 || !Number.isFinite(settledAmount) || settledAmount < 0) {
      return c.json({ error: "Valid branch, billed amount, and settled amount are required." }, 400);
    }
    if (Math.abs(billedAmount - settledAmount) > 0.005 && justification.length < 3) {
      return c.json({ error: "Justification is required when the settled amount differs from the billed amount." }, 400);
    }
    const settledAt = body.settlementDate ? new Date(body.settlementDate) : new Date();
    if (Number.isNaN(settledAt.getTime())) return c.json({ error: "Invalid settlement date." }, 400);
    const [settlement] = await db.insert(schema.registerSettlements).values({
      branchId,
      settlementDate: settledAt,
      billedAmount: Number(billedAmount.toFixed(2)),
      settledAmount: Number(settledAmount.toFixed(2)),
      justification: justification || null,
      settledById: body.settledById ? Number(body.settledById) : null,
      settledByName: body.settledByName ? String(body.settledByName) : null,
    }).returning();
    return c.json({ settlement }, 201);
  });
