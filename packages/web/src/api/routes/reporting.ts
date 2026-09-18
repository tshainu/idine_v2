import { Hono } from "hono";
import { db } from "../database";
import * as schema from "../database/schema";
import { eq, desc } from "drizzle-orm";

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
  return type === "dine-in" ? "Dine-in" : type === "takeaway" ? "Takeaway" : type === "delivery" ? "Delivery" : type || "—";
}

export const reporting = new Hono().get("/", async (c) => {
  const branchId = Number(c.req.query("branchId") || 0);
  const [jobs, orders, users, tables, printers] = await Promise.all([
    db.select().from(schema.printJobs).where(branchId ? eq(schema.printJobs.branchId, branchId) : undefined).orderBy(desc(schema.printJobs.createdAt)),
    db.select().from(schema.orders).where(branchId ? eq(schema.orders.branchId, branchId) : undefined).orderBy(desc(schema.orders.createdAt)),
    db.select({ id: schema.users.id, name: schema.users.name, role: schema.users.role }).from(schema.users).where(branchId ? eq(schema.users.branchId, branchId) : undefined),
    db.select({ id: schema.tables.id, name: schema.tables.name }).from(schema.tables).where(branchId ? eq(schema.tables.branchId, branchId) : undefined),
    db.select({ id: schema.printers.id, name: schema.printers.name, type: schema.printers.type, ipAddress: schema.printers.ipAddress }).from(schema.printers).where(branchId ? eq(schema.printers.branchId, branchId) : undefined),
  ]);
  const userById = new Map(users.map(u => [u.id, u]));
  const tableById = new Map(tables.map(t => [t.id, t.name]));
  const printerById = new Map(printers.map(p => [p.id, p]));
  const orderById = new Map(orders.map(o => [o.id, o]));

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
      orderType: typeLabel(order?.type || payload.type), invoiceStatus: isInvoiced(order?.status) ? "Converted to invoice" : String(order?.status || "").toLowerCase() === "cancelled" ? "Cancelled" : "Left / not invoiced",
      orderStatus: order?.status || "No linked order", items: Array.isArray(payload.items) ? payload.items.map((i: any) => `${i.name || "Item"} ×${i.qty || 1}`).join(", ") : "—",
    };
  });

  const salesMap = new Map<string, any>();
  for (const order of orderRows.filter(row => isInvoiced(row.status))) {
    const key = `${order.cashierName}||${order.typeLabel}`;
    const row = salesMap.get(key) || { cashierName: order.cashierName, orderType: order.typeLabel, orders: 0, totalSales: 0, cash: 0, card: 0, other: 0 };
    row.orders += 1; row.totalSales += order.total;
    for (const payment of order.payments) {
      const method = payment.method.toLowerCase();
      if (method.includes("cash")) row.cash += payment.amount;
      else if (method.includes("card")) row.card += payment.amount;
      else row.other += payment.amount;
    }
    salesMap.set(key, row);
  }
  const salesRows = Array.from(salesMap.values()).map(row => ({ ...row, totalSales: Number(row.totalSales.toFixed(2)), cash: Number(row.cash.toFixed(2)), card: Number(row.card.toFixed(2)), other: Number(row.other.toFixed(2)) }));
  return c.json({ generatedAt: new Date().toISOString(), users, printers, kotRows, orderRows, salesRows }, 200);
});

export default reporting;

