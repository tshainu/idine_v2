/**
 * ESC/POS Print Worker
 *
 * Runs as a background loop inside the Bun server.
 * Every 3 seconds it:
 *   1. Picks up pending/failed (retryable) print jobs from the DB
 *   2. Builds ESC/POS bytes for KOT or bill
 *   3. Opens a raw TCP socket to the printer IP:port
 *   4. Sends the bytes and marks the job done (or failed after 3 attempts)
 *
 * No external print helper or Windows service needed — the server does it.
 */

import * as net from "net";
import { db } from "./database";
import * as schema from "./database/schema";
import { eq, and, lte, or } from "drizzle-orm";

// ── ESC/POS byte helpers ────────────────────────────────────────────────────

// A printer is "network" when the server can reach it over TCP itself.
// Legacy rows stored "lan"; the UI now writes "network". "windows"/"usb" mean the
// printer is attached to a Windows PC, so the browser must drive it instead.
export function isNetworkPrinter(connection?: string | null): boolean {
  return connection === "network" || connection === "lan";
}

const ESC = 0x1b;
const GS  = 0x1d;

function init(): Buffer { return Buffer.from([ESC, 0x40]); }
function cut(): Buffer  { return Buffer.from([GS, 0x56, 0x42, 0x03]); }
function bold(on: boolean): Buffer { return Buffer.from([ESC, 0x45, on ? 1 : 0]); }
function align(a: "left" | "center" | "right"): Buffer {
  const map = { left: 0, center: 1, right: 2 };
  return Buffer.from([ESC, 0x61, map[a]]);
}
function feed(lines = 1): Buffer { return Buffer.from([ESC, 0x64, lines]); }
function text(str: string): Buffer { return Buffer.from(str + "\n", "utf8"); }
function divider(char = "-", width = 42): Buffer { return text(char.repeat(width)); }
function doubleSize(on: boolean): Buffer { return Buffer.from([GS, 0x21, on ? 0x11 : 0x00]); } // double width+height

// ── ESC/POS document builders ───────────────────────────────────────────────

export function buildKOT(job: any): Buffer {
  const payload: any = typeof job.payload === "string" ? JSON.parse(job.payload) : job.payload;
  const parts: Buffer[] = [];

  parts.push(init());
  parts.push(align("center"));
  parts.push(bold(true));
  parts.push(text("*** KITCHEN ORDER TICKET ***"));
  parts.push(bold(false));
  parts.push(divider());

  const orderNum = payload.orderNumber || `ORD-${String(job.orderId).padStart(4, "0")}`;
  const orderTypeLabel = payload.type === "dine-in" ? "DINE IN" : payload.type === "takeaway" ? "TAKEAWAY" : payload.type === "delivery" ? "DELIVERY" : (payload.type || "DINE-IN").toUpperCase();
  const tableInfo = payload.tableName ? `Table: ${payload.tableName}` : "";
  const waiter = payload.waiterName ? `Waiter: ${payload.waiterName}` : "";

  // Order type — big & centered, directly under the KOT title
  parts.push(align("center"));
  parts.push(doubleSize(true));
  parts.push(bold(true));
  parts.push(text(orderTypeLabel));
  parts.push(bold(false));
  parts.push(doubleSize(false));
  parts.push(divider());

  parts.push(align("left"));
  parts.push(bold(true));
  parts.push(text(`Order: ${orderNum}`));
  parts.push(bold(false));
  if (tableInfo) parts.push(text(tableInfo));
  if (waiter) parts.push(text(waiter));
  if (payload.customerName) parts.push(text(`Customer: ${payload.customerName}`));
  if (payload.customerPhone) parts.push(text(`Phone: ${payload.customerPhone}`));
  parts.push(text(`Time: ${new Date().toLocaleTimeString("en-GB")}`));
  parts.push(divider());

  const items: any[] = payload.items || [];
  for (const item of items) {
    const qty = String(item.qty || 1).padEnd(4);
    const name = String(item.name || "").slice(0, 30);
    parts.push(bold(true));
    parts.push(text(`${qty}x ${name}`));
    parts.push(bold(false));
    if (item.notes) parts.push(text(`    >> ${item.notes}`));
    if (item.modifiers && item.modifiers.length > 0) {
      for (const m of item.modifiers) parts.push(text(`    + ${m.name}`));
    }
  }

  parts.push(divider());
  if (payload.notes) {
    parts.push(bold(true));
    parts.push(text(`Note: ${payload.notes}`));
    parts.push(bold(false));
  }
  parts.push(feed(4));
  parts.push(cut());

  return Buffer.concat(parts);
}

export function buildBill(job: any): Buffer {
  const payload: any = typeof job.payload === "string" ? JSON.parse(job.payload) : job.payload;
  const parts: Buffer[] = [];

  parts.push(init());
  parts.push(align("center"));
  parts.push(bold(true));
  parts.push(text(payload.restaurantName || "iDine Restaurant"));
  parts.push(bold(false));
  if (payload.address) parts.push(text(payload.address));
  if (payload.phone) parts.push(text(`Tel: ${payload.phone}`));
  parts.push(divider("="));

  // Order type — big & centered, right under the header
  const billTypeLabel = payload.type === "dine-in" ? "DINE IN" : payload.type === "takeaway" ? "TAKEAWAY" : payload.type === "delivery" ? "DELIVERY" : null;
  if (billTypeLabel) {
    parts.push(align("center"));
    parts.push(doubleSize(true));
    parts.push(bold(true));
    parts.push(text(billTypeLabel));
    parts.push(bold(false));
    parts.push(doubleSize(false));
    parts.push(divider());
  }

  parts.push(align("left"));
  const orderNum = payload.orderNumber || `ORD-${String(job.orderId).padStart(4, "0")}`;
  parts.push(text(`Bill No: ${orderNum}`));
  parts.push(text(`Date: ${new Date().toLocaleString("en-GB")}`));
  if (payload.tableName) parts.push(text(`Table: ${payload.tableName}`));
  if (payload.waiterName) parts.push(text(`Served by: ${payload.waiterName}`));
  parts.push(divider());

  // Header row
  parts.push(bold(true));
  parts.push(text("Item                   Qty  Price    Total"));
  parts.push(bold(false));
  parts.push(divider());

  const items: any[] = payload.items || [];
  for (const item of items) {
    const name = String(item.name || "").slice(0, 22).padEnd(22);
    const qty  = String(item.qty || 1).padStart(3);
    const price = Number(item.price || 0).toFixed(2).padStart(8);
    const total = (Number(item.price || 0) * Number(item.qty || 1)).toFixed(2).padStart(8);
    parts.push(text(`${name}${qty}${price}${total}`));
  }

  parts.push(divider());
  const sub  = Number(payload.subtotal || 0).toFixed(2);
  const disc = Number(payload.discount || 0).toFixed(2);
  const tax  = Number(payload.tax || 0).toFixed(2);
  const tot  = Number(payload.total || 0).toFixed(2);

  const svc  = Number(payload.serviceCharge || 0).toFixed(2);

  parts.push(text(`${"Subtotal:".padEnd(30)}${sub.padStart(10)}`));
  if (Number(disc) > 0) parts.push(text(`${"Discount:".padEnd(30)}-${disc.padStart(9)}`));
  // Service charge must print on the bill — it is part of what the guest pays.
  if (Number(svc) > 0) {
    const label = payload.serviceChargeLabel || "Service Charge:";
    parts.push(text(`${label.padEnd(30)}${svc.padStart(10)}`));
  }
  if (Number(tax) > 0)  parts.push(text(`${"Tax:".padEnd(30)}${tax.padStart(10)}`));
  parts.push(bold(true));
  parts.push(text(`${"TOTAL:".padEnd(30)}${tot.padStart(10)}`));
  parts.push(bold(false));
  parts.push(divider("="));

  if (payload.paymentMethod) parts.push(text(`Payment: ${payload.paymentMethod}`));
  parts.push(align("center"));
  parts.push(text("Thank you! Please visit again."));
  parts.push(feed(4));
  parts.push(cut());

  return Buffer.concat(parts);
}

// ── TCP sender ──────────────────────────────────────────────────────────────

export function sendToThermal(ip: string, port: number, data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    const timeout = 6000;

    socket.setTimeout(timeout);
    socket.connect(port, ip, () => {
      socket.write(data, (err) => {
        if (err) { socket.destroy(); reject(err); return; }
        // Small delay then close — some printers need it
        setTimeout(() => { socket.end(); resolve(); }, 300);
      });
    });

    socket.on("timeout", () => { socket.destroy(); reject(new Error("TCP timeout")); });
    socket.on("error", (err) => { socket.destroy(); reject(err); });
  });
}

// ── Worker loop ─────────────────────────────────────────────────────────────

const MAX_ATTEMPTS = 3;

export async function runPrintWorker(): Promise<void> {
  console.log("[print-worker] started — polling every 3s");

  async function tick() {
    try {
      // Pick up jobs: pending OR failed with attempts < MAX_ATTEMPTS
      const jobs = await db
        .select()
        .from(schema.printJobs)
        .where(
          or(
            eq(schema.printJobs.status, "pending"),
            and(
              eq(schema.printJobs.status, "failed"),
              lte(schema.printJobs.attempts, MAX_ATTEMPTS - 1)
            )
          )
        )
        .limit(20);

      for (const job of jobs) {
        // Mark as printing + increment attempts
        await db.update(schema.printJobs)
          .set({ status: "printing", attempts: (job.attempts ?? 0) + 1, lastAttemptAt: new Date() })
          .where(eq(schema.printJobs.id, job.id));

        try {
          // Look up the printer
          const [printer] = job.printerId
            ? await db.select().from(schema.printers).where(eq(schema.printers.id, job.printerId))
            : [];

          if (!printer) throw new Error(`Printer ${job.printerId} not found`);
          if (!isNetworkPrinter(printer.connection) || !printer.ipAddress) {
            // USB / unknown — skip TCP, just mark done (USB handled by local agent)
            await db.update(schema.printJobs)
              .set({ status: "done", completedAt: new Date() })
              .where(eq(schema.printJobs.id, job.id));
            continue;
          }

          // Build ESC/POS bytes
          const bytes = job.type === "bill" ? buildBill(job) : buildKOT(job);

          // Send over TCP
          await sendToThermal(printer.ipAddress, printer.port ?? 9100, bytes);

          await db.update(schema.printJobs)
            .set({ status: "done", completedAt: new Date() })
            .where(eq(schema.printJobs.id, job.id));

          console.log(`[print-worker] job ${job.id} → ${printer.name} (${printer.ipAddress}) ✓`);
        } catch (err: any) {
          const attempts = (job.attempts ?? 0) + 1;
          const finalStatus = attempts >= MAX_ATTEMPTS ? "failed" : "pending";
          await db.update(schema.printJobs)
            .set({ status: finalStatus })
            .where(eq(schema.printJobs.id, job.id));
          console.warn(`[print-worker] job ${job.id} failed (attempt ${attempts}): ${err.message}`);
        }
      }
    } catch (err: any) {
      console.error("[print-worker] tick error:", err.message);
    }
  }

  // Run immediately then every 3s
  await tick();
  setInterval(tick, 3000);
}
