import { Hono } from "hono";
import { db } from "../database";
import * as schema from "../database/schema";
import { eq, and, desc, inArray, isNull, or, like, gte } from "drizzle-orm";
import { pushOutbox } from "../sync-worker";
import { notifyKitchenReady } from "../push-notifications";
import { triggerSalesTemplate } from "../sales-messaging";
import { verifyAuthorizedPin } from "./users";

// Table occupancy must follow the live orders: the POS never reset it, so tables
// stayed "occupied" long after their order was settled and waiters were blocked.
const OPEN_ORDER_STATUSES = ["pending", "confirmed", "preparing", "ready", "served", "hold"];

async function syncTableStatus(tableId: number | null | undefined) {
  if (!tableId) return;
  const open = await db.select({ id: schema.orders.id })
    .from(schema.orders)
    .where(and(
      eq(schema.orders.tableId, tableId),
      inArray(schema.orders.status, OPEN_ORDER_STATUSES),
    ));
  const [table] = await db.select().from(schema.tables).where(eq(schema.tables.id, tableId));
  if (!table) return;
  const next = open.length > 0
    ? (table.status === "billed" ? "billed" : "occupied")
    : (table.status === "reserved" ? "reserved" : "available");
  if (next !== table.status) {
    await db.update(schema.tables).set({ status: next }).where(eq(schema.tables.id, tableId));
  }
}

async function deductSalesStock(order: any, actorId?: number | null, actorName?: string | null) {
  const items = await db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, order.id));
  const menuIds = [...new Set(items.map(item => item.menuItemId).filter((id): id is number => typeof id === "number"))];
  if (!menuIds.length) return;
  const links = await db.select().from(schema.menuItemStocks).where(inArray(schema.menuItemStocks.menuItemId, menuIds));
  if (!links.length) return;
  const stockIds = [...new Set(links.map(link => link.stockItemId))];
  await db.transaction(async (tx) => {
    const stocks = await tx.select().from(schema.stockItems).where(inArray(schema.stockItems.id, stockIds));
    const stockById = new Map(stocks.map(stock => [stock.id, stock]));
    const previousSales = await tx.select().from(schema.stockMovements).where(and(eq(schema.stockMovements.orderId, order.id), eq(schema.stockMovements.movementType, "sale")));
    for (const stockLink of links) {
      const stock = stockById.get(stockLink.stockItemId);
      const menuItem = items.find(item => item.menuItemId === stockLink.menuItemId);
      if (!stock || !menuItem) continue;
      const qty = Number(menuItem.qty || 0) * Number(stockLink.deductionQty || 1);
      if (qty <= 0 || previousSales.some(movement => movement.stockItemId === stock.id && movement.orderItemId === menuItem.id)) continue;
      const previousQty = Number(stock.quantityOnHand || 0);
      const available = previousQty - Number(stock.quantityReserved || 0);
      if (!stock.allowOverselling && available < qty) throw new Error(`Not enough stock for ${stock.name}. Available: ${Math.max(0, available)}`);
      const nextQty = previousQty - qty;
      // Keep the final guard inside the transaction. Two terminals can read the
      // same old balance; only one is allowed to decrement it when overselling
      // is disabled. A zero-row update means another sale won the race.
      const updateCondition = stock.allowOverselling
        ? eq(schema.stockItems.id, stock.id)
        : and(
            eq(schema.stockItems.id, stock.id),
            // SQLite's numeric comparison makes this an atomic stock check.
            gte(schema.stockItems.quantityOnHand, Number(stock.quantityReserved || 0) + qty),
          );
      const updatedRows = await tx.update(schema.stockItems)
        .set({ quantityOnHand: nextQty, updatedAt: new Date() })
        .where(updateCondition)
        .returning({ id: schema.stockItems.id });
      if (!updatedRows.length && !stock.allowOverselling) {
        throw new Error(`Stock changed for ${stock.name}. Please refresh and try again.`);
      }
      await tx.insert(schema.stockMovements).values({ branchId: order.branchId, stockItemId: stock.id, menuItemId: menuItem.menuItemId, orderId: order.id, orderItemId: menuItem.id, movementType: "sale", qty: -qty, previousQty, newQty: nextQty, note: `Sold on ${order.orderNumber}`, createdById: actorId || order.cashierId || null, createdByName: actorName || order.placedBy || null });
    }
  });
}

function waiterShortId(name: string | null | undefined): string {
  if (!name) return "WW";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

async function generateOrderNumber(queryDb: any, waiterName: string | null | undefined): Promise<string> {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const dayPrefix = `${mm}${dd}`;
  const today = await queryDb
    .select({ orderNumber: schema.orders.orderNumber })
    .from(schema.orders)
    .where(like(schema.orders.orderNumber, `${dayPrefix}%`));
  const maxToday = today.reduce((max, row) => {
    const match = /-(\d+)$/.exec(row.orderNumber || "");
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `${dayPrefix}${waiterShortId(waiterName)}-${String(maxToday + 1).padStart(3, "0")}`;
}

export const orders = new Hono()
  .get("/", async (c) => {
    const branchId = c.req.query("branchId");
    const status = c.req.query("status");
    const source = c.req.query("source");
    const placedBy = c.req.query("placedBy");
    const includeItems = c.req.query("includeItems") !== "0";
    const cashierId = Number(c.req.query("cashierId"));
    const conditions: any[] = [];
    if (branchId) conditions.push(eq(schema.orders.branchId, parseInt(branchId)));
    if (source) conditions.push(eq(schema.orders.source, source));
    if (cashierId) {
      conditions.push(placedBy
        ? or(eq(schema.orders.cashierId, cashierId), and(isNull(schema.orders.cashierId), eq(schema.orders.placedBy, placedBy)))
        : eq(schema.orders.cashierId, cashierId));
    } else if (placedBy) {
      conditions.push(eq(schema.orders.placedBy, placedBy));
    }
    // Only filter by status when the caller explicitly asks for one — previously this
    // silently excluded ALL cancelled orders by default, which broke cancelled-order
    // counts on Registry/Reports/Sales pages that fetch orders without a status filter.
    if (status) conditions.push(eq(schema.orders.status, status));

    const all = conditions.length
      ? await db.select().from(schema.orders).where(and(...conditions)).orderBy(desc(schema.orders.createdAt))
      : await db.select().from(schema.orders).orderBy(desc(schema.orders.createdAt));

    // Always include items and the resolved waiter name. The raw order only stores waiterId;
    // resolving it here keeps every consumer (POS, KDS, reports) consistent.
    let ordersWithItems: any[] = all;
    if (all.length > 0 && includeItems) {
      const orderIds = all.map((o) => o.id);
      const allItems = await db.select().from(schema.orderItems).where(inArray(schema.orderItems.orderId, orderIds));
      const itemsByOrder: Record<number, any[]> = {};
      for (const item of allItems) {
        if (!itemsByOrder[item.orderId!]) itemsByOrder[item.orderId!] = [];
        itemsByOrder[item.orderId!].push(item);
      }

      const waiterIds = [...new Set(all.map((o) => o.waiterId).filter((id): id is number => typeof id === "number"))];
      const waiterNames = new Map<number, string>();
      if (waiterIds.length > 0) {
        const waiterRows = await db
          .select({ id: schema.users.id, name: schema.users.name })
          .from(schema.users)
          .where(inArray(schema.users.id, waiterIds));
        waiterRows.forEach((waiter) => waiterNames.set(waiter.id, waiter.name));
      }

      const tableIds = [...new Set(all.map((o) => o.tableId).filter((id): id is number => typeof id === "number"))];
      const tableRows = tableIds.length
        ? await db.select({ id: schema.tables.id, name: schema.tables.name }).from(schema.tables).where(inArray(schema.tables.id, tableIds))
        : [];
      const tableNames = new Map(tableRows.map((table) => [table.id, table.name]));
      ordersWithItems = all.map((o) => ({
        ...o,
        waiterName: (o.waiterId ? waiterNames.get(o.waiterId) : null) || o.placedBy || null,
        tableName: o.tableId ? tableNames.get(o.tableId) || null : null,
        items: itemsByOrder[o.id] || [],
      }));
    }
    if (!includeItems) {
      ordersWithItems = all.map((o) => ({ ...o, waiterName: o.placedBy || null, tableName: null, items: [] }));
    }
    return c.json({ orders: ordersWithItems }, 200);
  })
  .post("/", async (c) => {
    const body = await c.req.json();
    const orderValues = {
      ...body,
      discount: body.discount == null ? 0 : Number(body.discount),
      discountValue: body.discountValue == null ? 0 : Number(body.discountValue),
      serviceCharge: body.serviceCharge == null ? 0 : Number(body.serviceCharge),
      tipAmount: body.tipAmount == null ? 0 : Number(body.tipAmount),
      total: body.total == null ? 0 : Number(body.total),
      amountPaid: body.amountPaid == null ? 0 : Number(body.amountPaid),
      cashGiven: body.cashGiven == null ? 0 : Number(body.cashGiven),
      balance: body.balance == null ? 0 : Number(body.balance),
    };
    // The server owns the sequence. Ignore client-generated numbers so POS and
    // Waiter always share one daily sequence that restarts at 001 each morning.
    const updated = await db.transaction(async (tx) => {
      const [order] = await tx.insert(schema.orders).values({
        ...orderValues,
        orderNumber: "TEMP",
      }).returning();
      const orderNumber = await generateOrderNumber(tx, body.placedBy);
      const [next] = await tx.update(schema.orders)
        .set({ orderNumber })
        .where(eq(schema.orders.id, order.id))
        .returning();
      return next;
    });
    await syncTableStatus(updated.tableId);
    pushOutbox("orders", "insert", updated.id, updated, updated.branchId ?? undefined);
    return c.json({ order: updated }, 201);
  })
  .get("/:id", async (c) => {
    const id = parseInt(c.req.param("id"));
    const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, id));
    if (!order) return c.json({ error: "Not found" }, 404);
    const items = await db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, id));
    const menuIds = [...new Set(items.map((item) => item.menuItemId).filter((value): value is number => typeof value === "number"))];
    const menuRows = menuIds.length
      ? await db.select({ id: schema.menuItems.id, name: schema.menuItems.name, isPromo: schema.menuItems.isPromo, originalPrice: schema.menuItems.originalPrice })
        .from(schema.menuItems)
        .where(inArray(schema.menuItems.id, menuIds))
      : [];
    const menuById = new Map(menuRows.map((menu) => [menu.id, menu]));
    const enrichedItems = items.map((item) => {
      const menu = item.menuItemId ? menuById.get(item.menuItemId) : undefined;
      const isOffer = Boolean(menu?.isPromo && Number(menu.originalPrice || 0) > Number(item.price || 0));
      return {
        ...item,
        promotionName: item.promotionName || (isOffer ? menu?.name : null),
        promotionOriginalPrice: item.promotionOriginalPrice || (isOffer ? menu?.originalPrice : null),
      };
    });
    let waiterName = order.placedBy || null;
    if (order.waiterId) {
      const [waiter] = await db
        .select({ name: schema.users.name })
        .from(schema.users)
        .where(eq(schema.users.id, order.waiterId));
      waiterName = waiter?.name || waiterName;
    }
    let tableName: string | null = null;
    if (order.tableId) {
      const [table] = await db.select({ name: schema.tables.name }).from(schema.tables).where(eq(schema.tables.id, order.tableId));
      tableName = table?.name ?? null;
    }
    return c.json({ order: { ...order, waiterName, tableName }, items: enrichedItems }, 200);
  })
  .patch("/:id", async (c) => {
    const id = parseInt(c.req.param("id"));
    const body = await c.req.json();
    const { cancellationReason, cancellationUserId, cancellationUserName, authorizationPin, source, ...orderUpdate } = body as any;
    const [before] = await db.select()
      .from(schema.orders)
      .where(eq(schema.orders.id, id));
    if (!before) return c.json({ error: "Order not found" }, 404);
    const isCancelling = orderUpdate.status === "cancelled" && before.status !== "cancelled";
    if (isCancelling && source === "waiter-app" && !(await verifyAuthorizedPin(authorizationPin, before.branchId))) {
      return c.json({ error: "Admin or manager authorization PIN is required to cancel a running order" }, 403);
    }
    const reason = String(cancellationReason || "").trim();
    if (isCancelling && !reason) return c.json({ error: "Cancellation reason is required" }, 400);
    if (["completed", "billed", "paid"].includes(String(orderUpdate.status || "").toLowerCase())) {
      const subtotal = Number(orderUpdate.subtotal ?? before.subtotal ?? 0);
      const existingDiscount = Number(orderUpdate.discount ?? before.discount ?? 0);
      const ruleValue = Number(before.discountValue ?? orderUpdate.discountValue ?? 0);
      const discountType = String(before.discountType ?? orderUpdate.discountType ?? "").toLowerCase();
      const ruleDiscount = existingDiscount > 0
        ? existingDiscount
        : ruleValue > 0
          ? discountType.startsWith("percent") ? subtotal * ruleValue / 100 : ruleValue
          : 0;
      const discount = Number(ruleDiscount.toFixed(2));
      const branchSettings = await db.select({ key: schema.branchSettings.key, value: schema.branchSettings.value })
        .from(schema.branchSettings)
        .where(eq(schema.branchSettings.branchId, Number(orderUpdate.branchId ?? before.branchId)));
      const settingMap = Object.fromEntries(branchSettings.map(row => [row.key, row.value || ""]));
      const serviceRate = parseFloat(String(settingMap.serviceCharge || "0").replace("%", "")) / 100 || 0;
      const afterDiscount = Math.max(0, subtotal - discount);
      const serviceCharge = String(orderUpdate.type ?? before.type) === "dine-in"
        ? Number((afterDiscount * serviceRate).toFixed(2))
        : 0;
      const total = Number((afterDiscount + serviceCharge).toFixed(2));
      let paymentEntries: any[] = [];
      try { paymentEntries = typeof orderUpdate.paymentsJson === "string" ? JSON.parse(orderUpdate.paymentsJson || "[]") : (orderUpdate.paymentsJson || []); } catch { paymentEntries = []; }
      if (Array.isArray(paymentEntries) && paymentEntries.length > 0) {
        const amountPaid = Number(paymentEntries.reduce((sum: number, payment: any) => sum + Number(payment.amount || 0), 0).toFixed(2));
        orderUpdate.discount = discount;
        orderUpdate.serviceCharge = serviceCharge;
        orderUpdate.total = total;
        orderUpdate.amountPaid = amountPaid;
        orderUpdate.balance = Number((amountPaid - total).toFixed(2));
      }
    }
    const willFinalize = ["completed", "billed", "paid"].includes(String(orderUpdate.status || "").toLowerCase());
    const wasFinalized = ["completed", "billed", "paid"].includes(String(before.status || "").toLowerCase());
    if (willFinalize && !wasFinalized) {
      try {
        await deductSalesStock({ ...before, ...orderUpdate }, body.userId || body.cashierId || null, body.userName || body.cashierName || before.placedBy || null);
      } catch (error: any) {
        return c.json({ error: error?.message || "Unable to update sales stock" }, 409);
      }
    }
    const [order] = await db.update(schema.orders)
      .set({ ...orderUpdate, updatedAt: new Date() })
      .where(eq(schema.orders.id, id))
      .returning();
    if (isCancelling) {
      const items = await db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, id));
      let tableName: string | null = null;
      if (order.tableId) {
        const [table] = await db.select({ name: schema.tables.name })
          .from(schema.tables).where(eq(schema.tables.id, order.tableId));
        tableName = table?.name ?? null;
      }
      const auditRows = (items.length ? items : [{ id: null, name: "Entire order", qty: 0 }]).map((item: any) => ({
        branchId: order.branchId ?? null,
        orderId: order.id,
        orderItemId: item.id ?? null,
        orderNumber: order.orderNumber,
        tableName,
        userId: cancellationUserId == null ? (order.cashierId ?? null) : Number(cancellationUserId),
        userName: cancellationUserName || order.placedBy || null,
        itemName: item.name,
        qtyBefore: Number(item.qty || 0),
        qtyAfter: 0,
        qtyReduced: Number(item.qty || 0),
        reason,
      }));
      await db.insert(schema.orderModifications).values(auditRows);
    }
    await syncTableStatus(order.tableId);
    pushOutbox("orders", "update", order.id, order, order.branchId ?? undefined);
    if (order.status === "ready" && before?.status !== "ready") {
      await notifyKitchenReady(order);
    }
    const isPaidState = order.status === "completed" || order.status === "paid";
    const wasPaidState = before?.status === "completed" || before?.status === "paid";
    if (isPaidState && !wasPaidState && order.customerId) {
      const [customer] = await db.select().from(schema.customers).where(eq(schema.customers.id, order.customerId));
      if (customer) {
        const priorPaid = await db.select({ id: schema.orders.id }).from(schema.orders)
          .where(and(eq(schema.orders.customerId, customer.id), eq(schema.orders.status, "completed")));
        if (priorPaid.length === 0) triggerSalesTemplate({ branchId: order.branchId, customer, kind: "first_bill", order });
        triggerSalesTemplate({ branchId: order.branchId, customer, kind: "thank_you_visit", order });
      }
    }
    return c.json({ order }, 200);
  })
  .post("/:id/refund", async (c) => {
    const id = parseInt(c.req.param("id"));
    const body = await c.req.json() as any;
    const { mode, reason, items: refundItems } = body;

    const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, id));
    if (!order) return c.json({ error: "Order not found" }, 404);
    if (order.status !== "completed" && order.status !== "partially_refunded")
      return c.json({ error: "Only completed orders can be refunded" }, 400);

    const allItems = await db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, id));

    let refundTotal = 0;
    let finalRefundItems: any[] = [];

    if (mode === "full") {
      refundTotal = order.total;
      finalRefundItems = allItems.map(it => ({ id: it.id, qty: it.qty, name: it.name, price: it.price }));
    } else {
      if (!refundItems || !refundItems.length) return c.json({ error: "No items selected for partial refund" }, 400);
      finalRefundItems = refundItems;
      refundTotal = refundItems.reduce((s: number, it: any) => s + (it.price * it.qty), 0);
    }

    // Create refund order (negative total)
    const refundNumber = `REF-${order.orderNumber}`;
    const [refund] = await db.insert(schema.orders).values({
      branchId: order.branchId,
      orderNumber: refundNumber,
      type: order.type,
      status: "refunded",
      customerName: order.customerName,
      customerId: order.customerId,
      notes: reason ? `Refund: ${reason}` : `Refund of ${order.orderNumber}`,
      subtotal: -refundTotal,
      total: -refundTotal,
    }).returning();

    // Mark original order
    const newStatus = mode === "full" ? "refunded" : "partially_refunded";
    const [updated] = await db.update(schema.orders)
      .set({ status: newStatus, updatedAt: new Date() })
      .where(eq(schema.orders.id, id))
      .returning();

    pushOutbox("orders", "update", updated.id, updated, updated.branchId ?? undefined);
    pushOutbox("orders", "insert", refund.id, refund, refund.branchId ?? undefined);

    return c.json({ refund: { ...refund, refundItems: finalRefundItems }, original: updated }, 201);
  });
