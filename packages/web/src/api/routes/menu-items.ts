import { Hono } from "hono";
import { db } from "../database";
import * as schema from "../database/schema";
import { eq, and, asc, inArray, sql } from "drizzle-orm";

function codeBase(name: string): string {
  const words = String(name || "").toUpperCase().match(/[A-Z0-9]+/g) || [];
  if (!words.length) return "ITEM";
  while (words.length > 1 && /^\d+$/.test(words[0])) words.shift();
  if (words.length === 1) return words[0].slice(0, 3);
  const last = words[words.length - 1];
  return words[0][0] + (/^\d/.test(last) ? last : last[0]);
}

async function generatedCode(branchId: number, name: string): Promise<string> {
  void branchId;
  return codeBase(name);
}

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
    const includeInactive = c.req.query("includeInactive") === "true";
    const conditions = [];
    if (branchId) conditions.push(eq(schema.menuItems.branchId, parseInt(branchId)));
    if (categoryId) conditions.push(eq(schema.menuItems.categoryId, parseInt(categoryId)));
    if (!includeInactive) conditions.push(eq(schema.menuItems.isActive, true));
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

    const stockLinks = itemIds.length
      ? await db.select().from(schema.menuItemStocks).where(inArray(schema.menuItemStocks.menuItemId, itemIds))
      : [];
    const stockIds = [...new Set(stockLinks.map(link => link.stockItemId))];
    const stockRows = stockIds.length
      ? await db.select().from(schema.stockItems).where(inArray(schema.stockItems.id, stockIds))
      : [];
    const stockById = new Map(stockRows.map(stock => [stock.id, stock]));
    const itemsWithVariations = items.map(item => {
      const link = stockLinks.find(row => row.menuItemId === item.id);
      const stock = link ? stockById.get(link.stockItemId) : undefined;
      return {
        ...item,
        variations: allVariations.filter(v => v.menuItemId === item.id),
        stockItemId: stock?.id ?? null,
        stockName: stock?.name ?? null,
        stockAvailableQty: stock ? Number(stock.quantityOnHand || 0) - Number(stock.quantityReserved || 0) : null,
        stockLowStockLevel: stock?.lowStockLevel ?? null,
        stockAllowOverselling: stock?.allowOverselling ?? false,
        stockTracked: Boolean(stock),
      };
    });

    return c.json({ menuItems: itemsWithVariations }, 200);
  })
  .post("/", async (c) => {
    const body = await c.req.json();
    const values = { ...body };
    if (!String(values.code || "").trim() && values.branchId && values.name) {
      values.code = await generatedCode(Number(values.branchId), String(values.name));
    }
    const [item] = await db.insert(schema.menuItems).values(values).returning();
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
