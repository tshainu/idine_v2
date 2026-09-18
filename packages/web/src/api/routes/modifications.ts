import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../database";
import * as schema from "../database/schema";

export const modifications = new Hono()
  .get("/", async (c) => {
    const branchId = c.req.query("branchId");
    const rows = branchId
      ? await db.select().from(schema.orderModifications).where(eq(schema.orderModifications.branchId, Number(branchId))).orderBy(desc(schema.orderModifications.createdAt))
      : await db.select().from(schema.orderModifications).orderBy(desc(schema.orderModifications.createdAt));
    return c.json({ modifications: rows }, 200);
  })
  .post("/", async (c) => {
    const body = await c.req.json();
    if (!body?.itemName || !body?.reason || !body?.orderId) return c.json({ error: "orderId, itemName and reason are required" }, 400);
    const [row] = await db.insert(schema.orderModifications).values({
      branchId: body.branchId == null ? null : Number(body.branchId),
      orderId: Number(body.orderId),
      orderItemId: body.orderItemId == null ? null : Number(body.orderItemId),
      orderNumber: body.orderNumber ?? null,
      tableName: body.tableName ?? null,
      userId: body.userId == null ? null : Number(body.userId),
      userName: body.userName ?? null,
      itemName: String(body.itemName),
      qtyBefore: Number(body.qtyBefore ?? 0),
      qtyAfter: Number(body.qtyAfter ?? 0),
      qtyReduced: Number(body.qtyReduced ?? 0),
      reason: String(body.reason).trim(),
    }).returning();
    return c.json({ modification: row }, 201);
  });
