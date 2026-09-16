import { Hono } from "hono";
import { db } from "../database";
import * as schema from "../database/schema";
import { eq, inArray } from "drizzle-orm";
import { pushOutbox } from "../sync-worker";

function authoritativePrice(menu: any, orderType: string | null | undefined, requested: number, promotionName?: string | null): number {
  if (!menu) return Number(requested || 0);
  const field = orderType === "takeaway" ? "priceTakeaway" : orderType === "delivery" ? "priceDelivery" : "priceDineIn";
  const configured = Number(menu[field] || menu.price || 0);
  // A promo line deliberately carries a lower selling price than the base
  // menu item. Keep that explicit offer price and retain the original price
  // separately for bill/invoice display.
  if (promotionName && Number(requested || 0) > 0 && Number(requested) < configured) return Number(requested);
  return configured > 0 ? configured : Number(requested || 0);
}

function lineTotal(price: number, item: any): number {
  return Math.max(0, price * Number(item.qty || 0) - Number(item.discount || 0));
}

async function recalculateOrder(orderId: number) {
  if (!orderId) return;
  const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
  if (!order) return;
  const items = await db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, orderId));
  // Store the gross item subtotal and apply the order-level discount once.
  const subtotal = items.reduce((sum, item) => sum + Number(item.total || 0) + Number(item.discount || 0), 0);
  const discount = Number(order.discount || 0);
  const serviceCharge = order.type === "dine-in" ? Number(order.serviceCharge || 0) : 0;
  const total = Math.max(0, subtotal - discount + serviceCharge);
  const [updated] = await db.update(schema.orders)
    .set({ subtotal, total, serviceCharge })
    .where(eq(schema.orders.id, orderId))
    .returning();
  if (updated) pushOutbox("orders", "update", updated.id, updated, updated.branchId ?? undefined);
}

export const orderItems = new Hono()
  .get("/", async (c) => {
    const orderId = c.req.query("orderId");
    if (!orderId) return c.json({ error: "orderId required" }, 400);
    const items = await db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, parseInt(orderId)));
    return c.json({ orderItems: items }, 200);
  })
  .post("/", async (c) => {
    const body = await c.req.json();
    const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, Number(body.orderId)));
    const [menu] = body.menuItemId
      ? await db.select().from(schema.menuItems).where(eq(schema.menuItems.id, Number(body.menuItemId)))
      : [];
    const price = authoritativePrice(menu, order?.type, Number(body.price || 0), body.promotionName);
    const total = lineTotal(price, body);
    const [item] = await db.insert(schema.orderItems).values({ ...body, price, total }).returning();
    pushOutbox("order_items", "insert", item.id, item);
    await recalculateOrder(Number(body.orderId));
    return c.json({ orderItem: item }, 201);
  })
  .post("/bulk", async (c) => {
    const { items } = await c.req.json();
    const orderIds = [...new Set(items.map((i: any) => Number(i.orderId)).filter(Boolean))];
    const menuIds = [...new Set(items.map((i: any) => Number(i.menuItemId)).filter(Boolean))];
    const orders = orderIds.length ? await db.select().from(schema.orders).where(inArray(schema.orders.id, orderIds)) : [];
    const menus = menuIds.length ? await db.select().from(schema.menuItems).where(inArray(schema.menuItems.id, menuIds)) : [];
    const orderById = new Map(orders.map((o) => [o.id, o]));
    const menuById = new Map(menus.map((m) => [m.id, m]));
    const withTotals = items.map((i: any) => {
      const price = authoritativePrice(menuById.get(Number(i.menuItemId)), orderById.get(Number(i.orderId))?.type, Number(i.price || 0), i.promotionName);
      return { ...i, price, total: lineTotal(price, i) };
    });
    const created = await db.insert(schema.orderItems).values(withTotals).returning();
    for (const item of created) pushOutbox("order_items", "insert", item.id, item);
    for (const orderId of orderIds) await recalculateOrder(orderId);
    return c.json({ orderItems: created }, 201);
  })
  .patch("/:id", async (c) => {
    const id = parseInt(c.req.param("id"));
    const body = await c.req.json();
    const [existing] = await db.select().from(schema.orderItems).where(eq(schema.orderItems.id, id));
    if (!existing) return c.json({ error: "Order item not found" }, 404);
    const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, existing.orderId));
    const [menu] = existing.menuItemId
      ? await db.select().from(schema.menuItems).where(eq(schema.menuItems.id, existing.menuItemId))
      : [];
    const nextPrice = authoritativePrice(menu, order?.type, body.price ?? existing.price, body.promotionName ?? existing.promotionName);
    const nextQty = body.qty ?? existing.qty;
    const patch = {
      ...body,
      price: nextPrice,
      total: lineTotal(nextPrice, { ...existing, ...body, qty: nextQty }),
    };
    const [item] = await db.update(schema.orderItems).set(patch).where(eq(schema.orderItems.id, id)).returning();
    pushOutbox("order_items", "update", item.id, item);
    await recalculateOrder(existing.orderId);
    return c.json({ orderItem: item }, 200);
  })
  .delete("/:id", async (c) => {
    const id = parseInt(c.req.param("id"));
    const [existing] = await db.select().from(schema.orderItems).where(eq(schema.orderItems.id, id));
    await db.delete(schema.orderItems).where(eq(schema.orderItems.id, id));
    if (existing?.orderId) await recalculateOrder(existing.orderId);
    pushOutbox("order_items", "delete", id, { id });
    return c.json({ ok: true }, 200);
  });
