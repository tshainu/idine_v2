import { Hono } from "hono";
import { db } from "../database";
import * as schema from "../database/schema";
import { eq } from "drizzle-orm";
import { pushOutbox } from "../sync-worker";

export const orderItems = new Hono()
  .get("/", async (c) => {
    const orderId = c.req.query("orderId");
    if (!orderId) return c.json({ error: "orderId required" }, 400);
    const items = await db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, parseInt(orderId)));
    return c.json({ orderItems: items }, 200);
  })
  .post("/", async (c) => {
    const body = await c.req.json();
    const total = Math.max(0, body.price * body.qty - Number(body.discount || 0));
    const [item] = await db.insert(schema.orderItems).values({ ...body, total }).returning();
    pushOutbox("order_items", "insert", item.id, item);
    return c.json({ orderItem: item }, 201);
  })
  .post("/bulk", async (c) => {
    const { items } = await c.req.json();
    const withTotals = items.map((i: any) => ({ ...i, total: Math.max(0, i.price * i.qty - Number(i.discount || 0)) }));
    const created = await db.insert(schema.orderItems).values(withTotals).returning();
    for (const item of created) pushOutbox("order_items", "insert", item.id, item);
    return c.json({ orderItems: created }, 201);
  })
  .patch("/:id", async (c) => {
    const id = parseInt(c.req.param("id"));
    const body = await c.req.json();
    const [existing] = await db.select().from(schema.orderItems).where(eq(schema.orderItems.id, id));
    if (!existing) return c.json({ error: "Order item not found" }, 404);

    const nextPrice = body.price ?? existing.price;
    const nextQty = body.qty ?? existing.qty;
    const patch = {
      ...body,
      // `total` is persisted separately, so it must change with quantity or price.
      total: Math.max(0, nextPrice * nextQty - Number(body.discount ?? existing.discount ?? 0)),
    };
    const [item] = await db.update(schema.orderItems).set(patch).where(eq(schema.orderItems.id, id)).returning();
    pushOutbox("order_items", "update", item.id, item);
    return c.json({ orderItem: item }, 200);
  })
  .delete("/:id", async (c) => {
    const id = parseInt(c.req.param("id"));
    await db.delete(schema.orderItems).where(eq(schema.orderItems.id, id));
    pushOutbox("order_items", "delete", id, { id });
    return c.json({ ok: true }, 200);
  });
