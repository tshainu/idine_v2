import { Hono } from "hono";
import { db } from "../database";
import * as schema from "../database/schema";
import { eq, like, or, desc, and } from "drizzle-orm";

export const customers = new Hono()
  /**
   * Per-customer mini dashboard: visit history by date, the orders behind each
   * visit, lifetime spend, loyalty points and the message history for this
   * customer. Powers the expandable panel on the Customers page.
   */
  .get("/:id/dashboard", async (c) => {
    const id = parseInt(c.req.param("id"));

    const [customer] = await db.select().from(schema.customers).where(eq(schema.customers.id, id));
    if (!customer) return c.json({ error: "Customer not found" }, 404);

    const custOrders = await db
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.customerId, id))
      .orderBy(desc(schema.orders.createdAt));

    // Items across all of this customer's orders, for the favourites list.
    const orderIds = custOrders.map((o) => o.id);
    const items = orderIds.length
      ? await db.select().from(schema.orderItems).where(
          or(...orderIds.map((oid) => eq(schema.orderItems.orderId, oid))),
        )
      : [];

    const messages = await db
      .select()
      .from(schema.messageLog)
      .where(eq(schema.messageLog.customerId, id))
      .orderBy(desc(schema.messageLog.id))
      .limit(50);

    // ── Visits grouped by calendar day ──
    const byDay = new Map<string, { date: string; orders: number; amount: number }>();
    for (const o of custOrders) {
      const day = new Date(o.createdAt ?? Date.now()).toISOString().slice(0, 10);
      const row = byDay.get(day) ?? { date: day, orders: 0, amount: 0 };
      row.orders++;
      row.amount += Number(o.total || 0);
      byDay.set(day, row);
    }
    const visits = [...byDay.values()].sort((a, b) => (a.date < b.date ? 1 : -1));

    // ── Favourite items by quantity ──
    const byItem = new Map<string, { name: string; qty: number; amount: number }>();
    for (const it of items) {
      const row = byItem.get(it.name) ?? { name: it.name, qty: 0, amount: 0 };
      row.qty += Number(it.qty || 0);
      row.amount += Number(it.total || 0);
      byItem.set(it.name, row);
    }
    const favourites = [...byItem.values()].sort((a, b) => b.qty - a.qty).slice(0, 10);

    const totalSpent = custOrders.reduce((s, o) => s + Number(o.total || 0), 0);
    const paidOrders = custOrders.filter((o) => o.status !== "cancelled");

    return c.json(
      {
        customer,
        stats: {
          visitCount: visits.length,
          orderCount: custOrders.length,
          totalSpent,
          avgOrderValue: paidOrders.length ? totalSpent / paidOrders.length : 0,
          loyaltyPoints: Number(customer.loyaltyPoints || 0),
          firstVisit: visits.length ? visits[visits.length - 1].date : null,
          lastVisit: visits.length ? visits[0].date : null,
          messagesSent: messages.filter((m) => m.status === "sent").length,
        },
        visits,
        orders: custOrders.slice(0, 50),
        favourites,
        messages,
      },
      200,
    );
  })
  .get("/", async (c) => {
    const branchId = c.req.query("branchId");
    const search = c.req.query("search");
    let all;
    if (search) {
      all = await db.select().from(schema.customers).where(
        or(like(schema.customers.name, `%${search}%`), like(schema.customers.phone, `%${search}%`))
      );
    } else if (branchId) {
      all = await db.select().from(schema.customers).where(eq(schema.customers.branchId, parseInt(branchId)));
    } else {
      all = await db.select().from(schema.customers);
    }
    return c.json({ customers: all }, 200);
  })
  .post("/", async (c) => {
    const body = await c.req.json();
    const [customer] = await db.insert(schema.customers).values(body).returning();
    return c.json({ customer }, 201);
  })
  .patch("/:id", async (c) => {
    const id = parseInt(c.req.param("id"));
    const body = await c.req.json();
    const [customer] = await db.update(schema.customers).set(body).where(eq(schema.customers.id, id)).returning();
    return c.json({ customer }, 200);
  })
  .delete("/:id", async (c) => {
    const id = parseInt(c.req.param("id"));
    await db.delete(schema.customers).where(eq(schema.customers.id, id));
    return c.json({ ok: true }, 200);
  });
