import { Hono } from "hono";
import { db } from "../database";
import * as schema from "../database/schema";
import { eq, and, asc } from "drizzle-orm";
import { buildKOT, buildBill, sendToThermal, isNetworkPrinter } from "../print-worker";

export const printJobs = new Hono()
  /**
   * Direct print — build ESC/POS and push it to the printer over TCP right now,
   * then report the result. The POS calls this so a network printer prints with
   * no Windows print wizard at all; the browser dialog is only used for printers
   * attached to a Windows PC, which the server cannot reach.
   *
   * Body: { branchId, orderId?, printerId, type: kot|bill|reprint, payload }
   */
  .post("/direct", async (c) => {
    const body = await c.req.json();
    const printerId = Number(body.printerId);
    if (!printerId) return c.json({ ok: false, error: "printerId is required" }, 400);

    const [printer] = await db.select().from(schema.printers).where(eq(schema.printers.id, printerId));
    if (!printer) return c.json({ ok: false, error: `Printer ${printerId} not found` }, 404);
    if (!isNetworkPrinter(printer.connection) || !printer.ipAddress) {
      return c.json(
        { ok: false, fallback: "windows", error: `"${printer.name}" is a Windows printer — print it from the browser.` },
        409,
      );
    }

    const payload = typeof body.payload === "string" ? body.payload : JSON.stringify(body.payload ?? {});
    const type = body.type || "kot";

    // Log the job so failures are visible in the print queue like any other job.
    const [job] = await db
      .insert(schema.printJobs)
      .values({
        branchId: body.branchId ?? printer.branchId ?? null,
        orderId: body.orderId ?? null,
        printerId,
        idempotencyKey: body.idempotencyKey || `direct-${printerId}-${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type,
        status: "printing",
        payload,
        attempts: 1,
        lastAttemptAt: new Date(),
      })
      .returning();

    try {
      const bytes = type === "bill" || type === "invoice" ? buildBill(job) : buildKOT(job);
      await sendToThermal(printer.ipAddress, printer.port ?? 9100, bytes);
      await db.update(schema.printJobs)
        .set({ status: "done", completedAt: new Date() })
        .where(eq(schema.printJobs.id, job.id));
      return c.json({ ok: true, printJob: { ...job, status: "done" }, printer: printer.name }, 200);
    } catch (err: any) {
      // Leave it "pending" so the background worker retries on its own.
      await db.update(schema.printJobs).set({ status: "pending" }).where(eq(schema.printJobs.id, job.id));
      return c.json(
        { ok: false, queued: true, printJob: job, error: `${printer.name}: ${err?.message || "print failed"} — queued for retry.` },
        200,
      );
    }
  })
  // Poll endpoint for Windows print helper
  .get("/", async (c) => {
    const status = c.req.query("status") || "pending";
    const branchId = c.req.query("branchId");
    const conditions: any[] = [eq(schema.printJobs.status, status)];
    if (branchId) conditions.push(eq(schema.printJobs.branchId, parseInt(branchId)));
    const jobs = await db.select().from(schema.printJobs).where(and(...conditions)).orderBy(asc(schema.printJobs.createdAt));
    return c.json({ printJobs: jobs }, 200);
  })
  // Create print jobs (one per printer station for an order)
  .post("/", async (c) => {
    const body = await c.req.json();
    // idempotency: skip if key already exists
    const existing = await db.select().from(schema.printJobs).where(eq(schema.printJobs.idempotencyKey, body.idempotencyKey));
    if (existing.length > 0) return c.json({ printJob: existing[0], duplicate: true }, 200);
    const [job] = await db.insert(schema.printJobs).values(body).returning();
    return c.json({ printJob: job }, 201);
  })
  // Batch create — one call creates all station jobs for an order
  .post("/batch", async (c) => {
    const { jobs } = await c.req.json();
    const created = [];
    for (const job of jobs) {
      const existing = await db.select().from(schema.printJobs).where(eq(schema.printJobs.idempotencyKey, job.idempotencyKey));
      if (existing.length > 0) {
        created.push({ ...existing[0], duplicate: true });
      } else {
        const [j] = await db.insert(schema.printJobs).values(job).returning();
        created.push(j);
      }
    }
    return c.json({ printJobs: created }, 201);
  })
  // Update job status (called by print helper or on completion)
  .patch("/:id", async (c) => {
    const id = parseInt(c.req.param("id"));
    const body = await c.req.json();
    const update: any = { ...body };
    if (body.status === "done") update.completedAt = new Date();
    if (body.status === "printing") update.lastAttemptAt = new Date();
    const [job] = await db.update(schema.printJobs).set(update).where(eq(schema.printJobs.id, id)).returning();
    return c.json({ printJob: job }, 200);
  });
