import { Hono } from "hono";
import { and, count, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "../database";
import * as schema from "../database/schema";

const INVOICED = new Set(["completed", "billed", "paid"]);

export const home = new Hono().get("/summary", async (c) => {
  const branchId = Number(c.req.query("branchId") || 0);
  const cashierId = Number(c.req.query("cashierId") || 0);
  const placedBy = c.req.query("placedBy") || "";
  const conditions: any[] = [];
  if (branchId) conditions.push(eq(schema.orders.branchId, branchId));
  if (cashierId) {
    conditions.push(placedBy
      ? or(eq(schema.orders.cashierId, cashierId), and(isNull(schema.orders.cashierId), eq(schema.orders.placedBy, placedBy)))
      : eq(schema.orders.cashierId, cashierId));
  } else if (placedBy) conditions.push(eq(schema.orders.placedBy, placedBy));

  const orders = await db.select({
    id: schema.orders.id,
    orderNumber: schema.orders.orderNumber,
    status: schema.orders.status,
    type: schema.orders.type,
    tableId: schema.orders.tableId,
    total: schema.orders.total,
    createdAt: schema.orders.createdAt,
  }).from(schema.orders)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(schema.orders.createdAt));

  const orderIds = orders.map(order => order.id);
  const items = orderIds.length
    ? await db.select({ orderId: schema.orderItems.orderId, menuItemId: schema.orderItems.menuItemId, name: schema.orderItems.name, qty: schema.orderItems.qty, price: schema.orderItems.price })
      .from(schema.orderItems).where(inArray(schema.orderItems.orderId, orderIds))
    : [];
  const itemsByOrder = new Map<number, typeof items>();
  for (const item of items) {
    const existing = itemsByOrder.get(item.orderId!) || [];
    existing.push(item);
    itemsByOrder.set(item.orderId!, existing);
  }
  const withItems = orders.map(order => ({ ...order, items: itemsByOrder.get(order.id) || [] }));
  const isInvoiced = (order: any) => INVOICED.has(String(order.status || "").toLowerCase());
  const today = new Date();
  const todayKey = today.toDateString();
  const todayOrders = withItems.filter(order => new Date(order.createdAt || 0).toDateString() === todayKey);
  const todayInvoiced = todayOrders.filter(isInvoiced);
  const itemMap = new Map<string, { name: string; qty: number; revenue: number }>();
  for (const order of todayInvoiced) for (const item of order.items) {
    const key = String(item.menuItemId || item.name);
    const current = itemMap.get(key) || { name: item.name || `Item #${key}`, qty: 0, revenue: 0 };
    current.qty += Number(item.qty || 0);
    current.revenue += Number(item.price || 0) * Number(item.qty || 0);
    itemMap.set(key, current);
  }
  const topItems = [...itemMap.values()].sort((a, b) => b.qty - a.qty).slice(0, 6);
  const year = today.getFullYear();
  const month = today.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthBars = Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    const key = new Date(year, month, day).toDateString();
    return { day, rev: withItems.filter(order => isInvoiced(order) && new Date(order.createdAt || 0).toDateString() === key).reduce((sum, order) => sum + Number(order.total || 0), 0) };
  });
  const activeTables = new Set(todayOrders.filter(order => ["pending", "confirmed", "preparing", "ready", "served", "hold", "open"].includes(String(order.status || "")) && order.tableId).map(order => order.tableId)).size;
  const [menuCounts, activeMenuCounts] = await Promise.all([
    db.select({ total: count(schema.menuItems.id) }).from(schema.menuItems).where(branchId ? eq(schema.menuItems.branchId, branchId) : undefined),
    db.select({ total: count(schema.menuItems.id) }).from(schema.menuItems).where(and(branchId ? eq(schema.menuItems.branchId, branchId) : undefined, eq(schema.menuItems.isActive, true))),
  ]);

  return c.json({
    generatedAt: new Date().toISOString(),
    today: {
      revenue: todayInvoiced.reduce((sum, order) => sum + Number(order.total || 0), 0),
      invoicedOrders: todayInvoiced.length,
      activeTables,
      pendingKitchen: todayOrders.filter(order => order.status === "open" || order.status === "confirmed").length,
      topSellingItem: topItems[0]?.name || "—",
      topSellingQty: topItems[0]?.qty || 0,
      dineIn: todayInvoiced.filter(order => order.type === "dine-in").length,
      takeaway: todayInvoiced.filter(order => order.type === "takeaway").length,
      delivery: todayInvoiced.filter(order => order.type === "delivery").length,
    },
    topItems,
    monthBars,
    recent: withItems.slice(0, 8).map(({ items: _items, ...order }) => order),
    menu: { total: Number(menuCounts[0]?.total || 0), available: Number(activeMenuCounts[0]?.total || 0) },
  }, 200);
});

export default home;
