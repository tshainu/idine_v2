import { Hono } from "hono";
import { and, eq, inArray, desc } from "drizzle-orm";
import { db } from "../database";
import * as schema from "../database/schema";

const MANAGER_ROLES = new Set(["admin", "manager", "superadmin"]);

async function requireManager(userId: unknown, branchId: number) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return null;
  const [user] = await db.select({ id: schema.users.id, name: schema.users.name, role: schema.users.role, branchId: schema.users.branchId })
    .from(schema.users).where(eq(schema.users.id, id)).limit(1);
  if (!user || !MANAGER_ROLES.has(String(user.role).toLowerCase()) || (branchId && user.branchId && Number(user.branchId) !== branchId)) return null;
  return user;
}

function branchCondition(branchId: number) {
  return branchId ? eq(schema.stockItems.branchId, branchId) : undefined;
}

export const stock = new Hono()
  .get("/", async (c) => {
    const branchId = Number(c.req.query("branchId") || 0);
    const items = await db.select().from(schema.stockItems).where(branchCondition(branchId)).orderBy(schema.stockItems.name);
    const stockIds = items.map(item => item.id);
    const links = stockIds.length ? await db.select().from(schema.menuItemStocks).where(inArray(schema.menuItemStocks.stockItemId, stockIds)) : [];
    const menuIds = [...new Set(links.map(link => link.menuItemId))];
    const menus = menuIds.length ? await db.select({ id: schema.menuItems.id, name: schema.menuItems.name, code: schema.menuItems.code }).from(schema.menuItems).where(inArray(schema.menuItems.id, menuIds)) : [];
    const menuById = new Map(menus.map(item => [item.id, item]));
    return c.json({ stockItems: items.map(item => ({
      ...item,
      availableQty: Number(item.quantityOnHand || 0) - Number(item.quantityReserved || 0),
      menuItems: links.filter(link => link.stockItemId === item.id).map(link => ({ ...link, menuItem: menuById.get(link.menuItemId) || null })),
    })) }, 200);
  })
  .post("/", async (c) => {
    const body = await c.req.json() as any;
    const branchId = Number(body.branchId || 0);
    const user = await requireManager(body.userId, branchId);
    if (!user) return c.json({ error: "Only admin or manager can manage sales stock" }, 403);
    const name = String(body.name || "").trim();
    if (!name) return c.json({ error: "Stock name is required" }, 400);
    const [created] = await db.insert(schema.stockItems).values({
      branchId: branchId || null,
      name,
      quantityOnHand: Math.max(0, Number(body.quantityOnHand || 0)),
      quantityReserved: 0,
      lowStockLevel: Math.max(0, Number(body.lowStockLevel ?? 10)),
      allowOverselling: Boolean(body.allowOverselling),
      isActive: true,
      createdById: user.id,
      createdByName: user.name,
      updatedAt: new Date(),
    }).returning();
    await db.insert(schema.stockMovements).values({ branchId: branchId || null, stockItemId: created.id, movementType: "opening_stock", qty: Number(created.quantityOnHand || 0), previousQty: 0, newQty: Number(created.quantityOnHand || 0), note: "Opening sales stock", createdById: user.id, createdByName: user.name });
    return c.json({ stockItem: created }, 201);
  })
  .patch("/:id", async (c) => {
    const id = Number(c.req.param("id"));
    const body = await c.req.json() as any;
    const [existing] = await db.select().from(schema.stockItems).where(eq(schema.stockItems.id, id));
    if (!existing) return c.json({ error: "Stock item not found" }, 404);
    const user = await requireManager(body.userId, Number(existing.branchId || 0));
    if (!user) return c.json({ error: "Only admin or manager can manage sales stock" }, 403);
    const dailyOpening = Boolean(body.dailyOpening);
    const addQuantity = dailyOpening ? null : body.addQuantity == null ? null : Math.max(0, Number(body.addQuantity || 0));
    const nextQty = dailyOpening
      ? Math.max(0, Number(body.quantityOnHand || 0))
      : addQuantity == null
      ? (body.quantityOnHand == null ? Number(existing.quantityOnHand || 0) : Number(body.quantityOnHand))
      : Number(existing.quantityOnHand || 0) + addQuantity;
    const updates: any = {};
    if (body.name != null) updates.name = String(body.name).trim();
    if (body.quantityOnHand != null || addQuantity != null) updates.quantityOnHand = nextQty;
    if (body.lowStockLevel != null) updates.lowStockLevel = Math.max(0, Number(body.lowStockLevel));
    if (body.allowOverselling != null) updates.allowOverselling = Boolean(body.allowOverselling);
    updates.updatedAt = new Date();
    const [updated] = await db.update(schema.stockItems).set(updates).where(eq(schema.stockItems.id, id)).returning();
    if (dailyOpening) {
      await db.insert(schema.stockMovements).values({ branchId: existing.branchId, stockItemId: id, movementType: "daily_opening", qty: nextQty, previousQty: Number(existing.quantityOnHand || 0), newQty: nextQty, note: body.note || "Today's opening stock", createdById: user.id, createdByName: user.name });
    } else if (addQuantity != null && addQuantity > 0) {
      await db.insert(schema.stockMovements).values({ branchId: existing.branchId, stockItemId: id, movementType: "restock", qty: addQuantity, previousQty: Number(existing.quantityOnHand || 0), newQty: nextQty, note: body.note || "New stock added", createdById: user.id, createdByName: user.name });
    } else if (body.quantityOnHand != null && nextQty !== Number(existing.quantityOnHand || 0)) {
      await db.insert(schema.stockMovements).values({ branchId: existing.branchId, stockItemId: id, movementType: "stock_adjustment", qty: nextQty - Number(existing.quantityOnHand || 0), previousQty: Number(existing.quantityOnHand || 0), newQty: nextQty, note: body.note || "Stock quantity updated", createdById: user.id, createdByName: user.name });
    }
    return c.json({ stockItem: updated }, 200);
  })
  .post("/:id/link", async (c) => {
    const stockItemId = Number(c.req.param("id"));
    const body = await c.req.json() as any;
    const [stockItem] = await db.select().from(schema.stockItems).where(eq(schema.stockItems.id, stockItemId));
    if (!stockItem) return c.json({ error: "Stock item not found" }, 404);
    const user = await requireManager(body.userId, Number(stockItem.branchId || 0));
    if (!user) return c.json({ error: "Only admin or manager can manage sales stock" }, 403);
    const menuItemId = Number(body.menuItemId);
    if (!Number.isInteger(menuItemId) || menuItemId <= 0) return c.json({ error: "Menu item is required" }, 400);
    const [menu] = await db.select({ id: schema.menuItems.id }).from(schema.menuItems).where(eq(schema.menuItems.id, menuItemId));
    if (!menu) return c.json({ error: "Menu item not found" }, 404);
    const [existing] = await db.select().from(schema.menuItemStocks).where(and(eq(schema.menuItemStocks.stockItemId, stockItemId), eq(schema.menuItemStocks.menuItemId, menuItemId)));
    if (existing) return c.json({ link: existing }, 200);
    const [link] = await db.insert(schema.menuItemStocks).values({ stockItemId, menuItemId, deductionQty: Math.max(0.001, Number(body.deductionQty || 1)) }).returning();
    return c.json({ link }, 201);
  })
  .delete("/:id/link/:menuItemId", async (c) => {
    const stockItemId = Number(c.req.param("id"));
    const menuItemId = Number(c.req.param("menuItemId"));
    const body = await c.req.json().catch(() => ({})) as any;
    const [stockItem] = await db.select().from(schema.stockItems).where(eq(schema.stockItems.id, stockItemId));
    if (!stockItem) return c.json({ error: "Stock item not found" }, 404);
    const user = await requireManager(body.userId, Number(stockItem.branchId || 0));
    if (!user) return c.json({ error: "Only admin or manager can manage sales stock" }, 403);
    await db.delete(schema.menuItemStocks).where(and(eq(schema.menuItemStocks.stockItemId, stockItemId), eq(schema.menuItemStocks.menuItemId, menuItemId)));
    return c.json({ ok: true }, 200);
  })
  .get("/report", async (c) => {
    const branchId = Number(c.req.query("branchId") || 0);
    const items = await db.select().from(schema.stockItems).where(branchCondition(branchId)).orderBy(desc(schema.stockItems.updatedAt));
    const ids = items.map(item => item.id);
    const links = ids.length ? await db.select().from(schema.menuItemStocks).where(inArray(schema.menuItemStocks.stockItemId, ids)) : [];
    const menus = links.length ? await db.select({ id: schema.menuItems.id, name: schema.menuItems.name, code: schema.menuItems.code }).from(schema.menuItems).where(inArray(schema.menuItems.id, [...new Set(links.map(l => l.menuItemId))])) : [];
    const menuById = new Map(menus.map(m => [m.id, m]));
    const movements = ids.length ? await db.select().from(schema.stockMovements).where(inArray(schema.stockMovements.stockItemId, ids)).orderBy(desc(schema.stockMovements.createdAt)) : [];
    return c.json({ stockItems: items.map(item => ({ ...item, availableQty: Number(item.quantityOnHand || 0) - Number(item.quantityReserved || 0), linkedMenuItems: links.filter(l => l.stockItemId === item.id).map(l => ({ ...l, menuItem: menuById.get(l.menuItemId) || null })), movements: movements.filter(m => m.stockItemId === item.id) })) }, 200);
  });

export default stock;
