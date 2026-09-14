import { Hono } from "hono";
import { db } from "../database";
import * as schema from "../database/schema";
import { eq, and, asc, inArray, sql } from "drizzle-orm";

export const menuItems = new Hono()
  .get("/best-sellers", async (c) => {
    const branchId = c.req.query("branchId");
    const conditions = [sql`${schema.orders.status} not in ('cancelled', 'draft')`];
    if (branchId) conditions.push(eq(schema.orders.branchId, parseInt(branchId)));
    const rows = await db
      .select({
        menuItemId: schema.orderItems.menuItemId,
        totalQty: sql<number>`sum(${schema.orderItems.qty})`.as("totalQty"),
      })
      .from(schema.orderItems)
      .innerJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id))
      .where(and(...conditions))
      .groupBy(schema.orderItems.menuItemId)
      .orderBy(sql`sum(${schema.orderItems.qty}) desc`);
    return c.json({ bestSellers: rows }, 200);
  })
  .get("/", async (c) => {
    const branchId = c.req.query("branchId");
    const categoryId = c.req.query("categoryId");
    const conditions = [];
    if (branchId) conditions.push(eq(schema.menuItems.branchId, parseInt(branchId)));
    if (categoryId) conditions.push(eq(schema.menuItems.categoryId, parseInt(categoryId)));
    const items = await db
      .select()
      .from(schema.menuItems)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(schema.menuItems.sortOrder));

    // Attach variations to each item using inArray (OR across all item ids)
    const itemIds = items.map(i => i.id);
    const allVariations = itemIds.length > 0
      ? await db.select().from(schema.menuItemVariations)
          .where(inArray(schema.menuItemVariations.menuItemId, itemIds))
      : [];

    const itemsWithVariations = items.map(item => ({
      ...item,
      variations: allVariations.filter(v => v.menuItemId === item.id),
    }));

    return c.json({ menuItems: itemsWithVariations }, 200);
  })
  .post("/", async (c) => {
    const body = await c.req.json();
    const [item] = await db.insert(schema.menuItems).values(body).returning();
    return c.json({ menuItem: item }, 201);
  })
  .patch("/:id", async (c) => {
    const id = parseInt(c.req.param("id"));
    const body = await c.req.json();
    const [item] = await db.update(schema.menuItems).set(body).where(eq(schema.menuItems.id, id)).returning();
    return c.json({ menuItem: item }, 200);
  })
  .delete("/:id", async (c) => {
    const id = parseInt(c.req.param("id"));
    const [item] = await db.select({ id: schema.menuItems.id }).from(schema.menuItems).where(eq(schema.menuItems.id, id));
    if (!item) return c.json({ error: "Menu item not found" }, 404);
    await db.delete(schema.menuItemVariations).where(eq(schema.menuItemVariations.menuItemId, id));
    await db.delete(schema.comboItems).where(eq(schema.comboItems.comboId, id));
    await db.delete(schema.menuItems).where(eq(schema.menuItems.id, id));
    return c.json({ ok: true }, 200);
  });
