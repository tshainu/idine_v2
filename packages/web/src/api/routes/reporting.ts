import { Hono } from "hono";
import { db } from "../database";
import * as schema from "../database/schema";
import { eq, desc, inArray } from "drizzle-orm";

const INVOICED = new Set(["completed", "billed", "paid"]);
const isInvoiced = (status: unknown) => INVOICED.has(String(status || "").toLowerCase());

function toIso(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") return new Date(value < 100000000000 ? value * 1000 : value).toISOString();
  return value ? new Date(String(value)).toISOString() : null;
}

function payloadOf(value: unknown): any {
  try { return typeof value === "string" ? JSON.parse(value) : (value || {}); } catch { return {}; }
}

function paymentsOf(order: any) {
  let parts: any[] = [];
  try { parts = typeof order.paymentsJson === "string" ? JSON.parse(order.paymentsJson || "[]") : (order.paymentsJson || []); } catch { parts = []; }
  if (!Array.isArray(parts) || parts.length === 0) parts = [{ method: order.paymentMethod || "Other", amount: Number(order.total || 0) }];
  return parts.map((p: any) => ({ method: String(p.method || "Other"), amount: Number(p.amount || 0) }));
}

function typeLabel(type: string | null | undefined) {
  const normalized = String(type || "").trim().toLowerCase().replace(/[_ ]/g, "-");
  return normalized === "dine-in" || normalized === "dinein" ? "Dine-in" : normalized === "takeaway" || normalized === "take-away" ? "Takeaway" : normalized === "delivery" || normalized === "deliver" ? "Delivery" : type || "—";
}

function kotLabel(orderNumber: unknown) {
  const value = String(orderNumber || "");
  const match = value.match(/(?:-|\s)(\d+)$/) || value.match(/(\d+)$/);
  return match ? `KOT # ${match[1].padStart(3, "0")}` : "—";
}

function friendlyActivity(action: unknown, details: unknown, names?: { userById?: Map<number, string>; tableById?: Map<number, string> }) {
  const rawAction = String(action || "Activity");
  const rawDetails = String(details || "");
  let payload: any = null;
  try { payload = rawDetails.trim().startsWith("{") ? JSON.parse(rawDetails) : null; } catch { payload = null; }
  if (!payload) return { action: rawAction.replace(/^\w+\s+\/api\/[^/]+\/?/i, "").replace(/^PATCH$/i, "Details updated"), details: rawDetails || "Activity recorded" };
  const parts: string[] = [];
  if (payload.type) parts.push(`Type: ${typeLabel(payload.type)}`);
  if (payload.status) parts.push(`Status: ${String(payload.status).replace(/_/g, " ")}`);
  if (payload.tableId != null) parts.push(`Table: ${names?.tableById?.get(Number(payload.tableId)) || payload.tableId}`);
  if (payload.waiterId != null) parts.push(`Waiter: ${names?.userById?.get(Number(payload.waiterId)) || `User ${payload.waiterId}`}`);
  if (payload.customerName) parts.push(`Customer: ${payload.customerName}`);
  if (payload.subtotal != null) parts.push(`Subtotal: LKR ${Number(payload.subtotal).toLocaleString(undefined, { minimumFractionDigits: 2 })}`);
  if (payload.discount != null) parts.push(`Discount: LKR ${Number(payload.discount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`);
  if (payload.serviceCharge != null) parts.push(`Service charge: LKR ${Number(payload.serviceCharge).toLocaleString(undefined, { minimumFractionDigits: 2 })}`);
  if (payload.total != null) parts.push(`Total: LKR ${Number(payload.total).toLocaleString(undefined, { minimumFractionDigits: 2 })}`);
  if (payload.paymentMethod) parts.push(`Payment: ${payload.paymentMethod}`);
  if (payload.amountPaid != null) parts.push(`Paid: LKR ${Number(payload.amountPaid).toLocaleString(undefined, { minimumFractionDigits: 2 })}`);
  if (payload.cashGiven != null) parts.push(`Cash received: LKR ${Number(payload.cashGiven).toLocaleString(undefined, { minimumFractionDigits: 2 })}`);
  if (payload.balance != null) parts.push(`Balance/change: LKR ${Number(payload.balance).toLocaleString(undefined, { minimumFractionDigits: 2 })}`);
  const status = String(payload.status || "").toLowerCase();
  const title = status === "confirmed" ? "Order confirmed" : status === "completed" || status === "billed" || status === "paid" ? "Invoice finalized" : rawAction.toLowerCase().includes("patch") ? "Order details updated" : "Order updated";
  return { action: title, details: parts.join(" · ") || "Order details updated" };
}

export const reporting = new Hono().get("/", async (c) => {
  const branchId = Number(c.req.query("branchId") || 0);
  const view = c.req.query("view") || "all";
  const [jobs, orders, users, tables, printers, modifications, orderItems] = await Promise.all([
    db.select().from(schema.printJobs).where(branchId ? eq(schema.printJobs.branchId, branchId) : undefined).orderBy(desc(schema.printJobs.createdAt)),
    db.select().from(schema.orders).where(branchId ? eq(schema.orders.branchId, branchId) : undefined).orderBy(desc(schema.orders.createdAt)),
    db.select({ id: schema.users.id, name: schema.users.name, role: schema.users.role }).from(schema.users).where(branchId ? eq(schema.users.branchId, branchId) : undefined),
    db.select({ id: schema.tables.id, name: schema.tables.name }).from(schema.tables).where(branchId ? eq(schema.tables.branchId, branchId) : undefined),
    db.select({ id: schema.printers.id, name: schema.printers.name, type: schema.printers.type, ipAddress: schema.printers.ipAddress }).from(schema.printers).where(branchId ? eq(schema.printers.branchId, branchId) : undefined),
    db.select().from(schema.orderModifications).where(branchId ? eq(schema.orderModifications.branchId, branchId) : undefined).orderBy(desc(schema.orderModifications.createdAt)),
    db.select().from(schema.orderItems).where(
      branchId
        ? inArray(schema.orderItems.orderId, db.select({ id: schema.orders.id }).from(schema.orders).where(eq(schema.orders.branchId, branchId)))
        : undefined,
    ),
  ]);
  const userById = new Map(users.map(u => [u.id, u]));
  const tableById = new Map(tables.map(t => [t.id, t.name]));
  const printerById = new Map(printers.map(p => [p.id, p]));
  const orderById = new Map(orders.map(o => [o.id, o]));
  const itemsByOrder = new Map<number, any[]>();
  for (const item of orderItems as any[]) {
    const list = itemsByOrder.get(Number(item.orderId)) || [];
    list.push(item);
    itemsByOrder.set(Number(item.orderId), list);
  }

  const orderRows = orders.map((o: any) => ({
    id: o.id, orderNumber: o.orderNumber, dateTime: toIso(o.createdAt), type: o.type, typeLabel: typeLabel(o.type), status: o.status,
    saleStatus: isInvoiced(o.status) ? "Converted to sale" : String(o.status).toLowerCase() === "cancelled" ? "Cancelled" : "Left / not invoiced",
    tableName: o.tableId ? tableById.get(o.tableId) || `Table ${o.tableId}` : "—", tableId: o.tableId,
    customerName: o.customerName || "Walk-in Customer", userName: o.placedBy || (o.cashierId ? userById.get(o.cashierId)?.name : null) || "—",
    cashierName: o.cashierId ? userById.get(o.cashierId)?.name || o.placedBy || "—" : o.placedBy || "—",
    total: Number(o.total || 0), paymentMethod: o.paymentMethod || "Other", payments: paymentsOf(o),
  }));

  const kotRows = jobs.map((job: any) => {
    const payload = payloadOf(job.payload);
    const order = job.orderId ? orderById.get(job.orderId) : null;
    const printer = job.printerId ? printerById.get(job.printerId) : null;
    return {
      id: job.id, orderId: job.orderId, kotNumber: `KOT-${job.id}`, orderNumber: order?.orderNumber || payload.orderNumber || "—",
      dateTime: toIso(job.createdAt) || toIso(payload.printedAt), completedAt: toIso(job.completedAt), jobType: job.type, printStatus: job.status,
      userName: payload.waiterName || payload.placedBy || order?.placedBy || (order?.cashierId ? userById.get(order.cashierId)?.name : null) || "—",
      tableName: payload.tableName || (order?.tableId ? tableById.get(order.tableId) || `Table ${order.tableId}` : "—"),
      printerName: printer?.name || (job.printerId ? `Printer ${job.printerId}` : "—"), printerId: job.printerId,
      orderType: typeLabel(order?.type || payload.type || payload.orderType || payload.billingType), invoiceStatus: isInvoiced(order?.status) ? "Converted to invoice" : String(order?.status || "").toLowerCase() === "cancelled" ? "Cancelled" : "Left / not invoiced",
      orderStatus: order?.status || "No linked order", items: Array.isArray(payload.items) && payload.items.length ? payload.items.map((i: any) => `${i.name || "Item"} ×${i.qty || 1}`).join(", ") : (itemsByOrder.get(Number(job.orderId)) || []).map((i: any) => `${i.name || "Item"} ×${i.qty || 1}`).join(", ") || "—",
    };
  });
  // Some historical/mobile flows created the order but did not persist a
  // print_jobs row. Keep those KOTs visible without falsely calling them
  // printed: the report explicitly marks them as "Not recorded".
  const linkedOrderIds = new Set(jobs.map((job: any) => Number(job.orderId)).filter((id: number) => id > 0));
  for (const order of orders as any[]) {
    if (linkedOrderIds.has(Number(order.id)) || String(order.status || "").toLowerCase() === "draft") continue;
    kotRows.push({
      id: `order-${order.id}`, orderId: order.id, kotNumber: kotLabel(order.orderNumber), orderNumber: order.orderNumber,
      dateTime: toIso(order.createdAt), completedAt: null, jobType: "order-fallback", printStatus: "Not recorded",
      userName: order.placedBy || (order.cashierId ? userById.get(order.cashierId)?.name : null) || "—",
      tableName: order.tableId ? tableById.get(order.tableId) || `Table ${order.tableId}` : "—",
      printerName: "—", printerId: null, orderType: typeLabel(order.type),
      invoiceStatus: isInvoiced(order.status) ? "Converted to invoice" : String(order.status || "").toLowerCase() === "cancelled" ? "Cancelled" : "Left / not invoiced",
      orderStatus: order.status || "—", items: (itemsByOrder.get(Number(order.id)) || []).map((item: any) => `${item.name || "Item"} ×${item.qty || 1}`).join(", ") || "—",
    });
  }

  const modifiedKotRows = modifications.map((modification: any) => {
    const order = modification.orderId ? orderById.get(modification.orderId) : null;
    return {
      id: modification.id,
      orderId: modification.orderId,
      kotNumber: kotLabel(modification.orderNumber || order?.orderNumber),
      orderNumber: modification.orderNumber || order?.orderNumber || "—",
      dateTime: toIso(modification.createdAt),
      tableName: modification.tableName || (order?.tableId ? tableById.get(order.tableId) || `Table ${order.tableId}` : "—"),
      orderType: typeLabel(order?.type),
      itemName: modification.itemName,
      qtyBefore: Number(modification.qtyBefore || 0),
      qtyAfter: Number(modification.qtyAfter || 0),
      qtyReduced: Number(modification.qtyReduced || 0),
      authorizedBy: modification.userName || (modification.userId ? userById.get(modification.userId)?.name : null) || "—",
      reason: modification.reason || "—",
    };
  });

  const salesMap = new Map<string, any>();
  for (const order of orderRows.filter(row => isInvoiced(row.status))) {
    const key = `${order.cashierName}||${order.typeLabel}`;
    const row = salesMap.get(key) || { cashierName: order.cashierName, orderType: order.typeLabel, orders: 0, totalSales: 0, cash: 0, card: 0, qr: 0, other: 0 };
    row.orders += 1; row.totalSales += order.total;
    for (const payment of order.payments) {
      const method = payment.method.toLowerCase();
      if (method.includes("cash")) row.cash += payment.amount;
      else if (method.includes("card")) row.card += payment.amount;
      else if (method.includes("qr")) row.qr += payment.amount;
      else row.other += payment.amount;
    }
    salesMap.set(key, row);
  }
  const salesRows = Array.from(salesMap.values()).map(row => ({ ...row, totalSales: Number(row.totalSales.toFixed(2)), cash: Number(row.cash.toFixed(2)), card: Number(row.card.toFixed(2)), qr: Number(row.qr.toFixed(2)), other: Number(row.other.toFixed(2)) }));
  const response: Record<string, unknown> = { generatedAt: new Date().toISOString() };
  if (view === "orders" || view === "sales") response.orderRows = orderRows;
  if (view === "kot") response.kotRows = kotRows;
  if (view === "kot") response.modifiedKotRows = modifiedKotRows;
  if (view === "sales") response.salesRows = salesRows;
  if (view === "all") Object.assign(response, { users, printers, kotRows, modifiedKotRows, orderRows, salesRows });
  return c.json(response, 200);
}).get("/invoice-history/:orderId", async (c) => {
  const orderId = Number(c.req.param("orderId"));
  const branchId = Number(c.req.query("branchId") || 0);
  if (!Number.isInteger(orderId) || orderId <= 0) return c.json({ error: "Invalid order ID" }, 400);
  const order = (await db.select().from(schema.orders).where(eq(schema.orders.id, orderId))).find((item: any) => !branchId || Number(item.branchId) === branchId);
  if (!order) return c.json({ error: "Order not found" }, 404);
  const [customer, items, jobs, modifications, activity, users, tables] = await Promise.all([
    order.customerId ? db.select().from(schema.customers).where(eq(schema.customers.id, order.customerId)) : Promise.resolve([]),
    db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, orderId)),
    db.select().from(schema.printJobs).where(eq(schema.printJobs.orderId, orderId)).orderBy(desc(schema.printJobs.createdAt)),
    db.select().from(schema.orderModifications).where(eq(schema.orderModifications.orderId, orderId)).orderBy(desc(schema.orderModifications.createdAt)),
    db.select().from(schema.activityLogs).where(eq(schema.activityLogs.entityId, orderId)).orderBy(desc(schema.activityLogs.createdAt)),
    db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(branchId ? eq(schema.users.branchId, branchId) : undefined),
    db.select({ id: schema.tables.id, name: schema.tables.name }).from(schema.tables).where(branchId ? eq(schema.tables.branchId, branchId) : undefined),
  ]);
  const userById = new Map(users.map((user: any) => [Number(user.id), user.name]));
  const tableById = new Map(tables.map((table: any) => [Number(table.id), table.name]));
  const events: any[] = [];
  const add = (at: any, action: string, details: string, actor?: string, kind = "info") => events.push({ at: toIso(at), action, details, actor: actor || "—", kind });
  if (customer[0]) add(customer[0].createdAt, "Customer created", `${customer[0].name}${customer[0].phone ? ` · ${customer[0].phone}` : ""}`, "—");
  add(order.createdAt, "Order placed", `${order.orderNumber} · ${typeLabel(order.type)}`, order.placedBy || undefined);
  for (const job of jobs as any[]) {
    const payload = payloadOf(job.payload);
    add(job.createdAt, job.type === "reprint" ? "KOT reprinted" : "KOT initiated", `${job.status || "pending"}${payload.printerName ? ` · ${payload.printerName}` : ""}`, payload.waiterName || payload.placedBy || order.placedBy, job.status === "failed" ? "danger" : "info");
  }
  for (const modification of modifications as any[]) {
    const change = `${modification.itemName}: ${modification.qtyBefore} → ${modification.qtyAfter}`;
    add(modification.createdAt, modification.qtyReduced > 0 ? "KOT modified — quantity reduced" : "KOT modified — quantity added", `${change} · Reason: ${modification.reason || "—"}`, modification.userName || undefined, modification.qtyReduced > 0 ? "warning" : "info");
  }
  for (const log of activity as any[]) {
    const action = String(log.action || "").toLowerCase();
    if (action.includes("cancel")) add(log.createdAt, "Order cancelled", log.details || "Cancellation recorded", log.userName || undefined, "danger");
    else if (log.action) { const simple = friendlyActivity(log.action, log.details || log.path, { userById, tableById }); add(log.createdAt, simple.action, simple.details, log.userName || order.placedBy || undefined); }
  }
  if (String(order.status || "").toLowerCase() === "cancelled" && !events.some(e => e.action === "Order cancelled")) add(order.updatedAt, "Order cancelled", "Order status changed to cancelled", order.placedBy || undefined, "danger");
  if (isInvoiced(order.status)) {
    add(order.updatedAt, "Invoice finalized", `Total ${Number(order.total || 0).toFixed(2)} · Discount ${Number(order.discount || 0).toFixed(2)} · Service charge ${Number(order.serviceCharge || 0).toFixed(2)}`, order.placedBy || undefined, "success");
    const payments = paymentsOf(order).map((payment: any) => `${payment.method}: ${Number(payment.amount || 0).toFixed(2)}`).join(" + ");
    add(order.updatedAt, "Payment recorded", `${payments || order.paymentMethod || "Other"} · Amount paid ${Number(order.amountPaid || 0).toFixed(2)} · Cash received ${Number(order.cashGiven || 0).toFixed(2)} · Balance/change ${Number(order.balance || 0).toFixed(2)}`, order.placedBy || undefined, "success");
  }
  events.sort((a, b) => new Date(a.at || 0).getTime() - new Date(b.at || 0).getTime());
  return c.json({ order, customer: customer[0] || null, items, events }, 200);
});

export default reporting;
