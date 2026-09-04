import { Hono } from "hono";
import { db } from "../database";
import * as schema from "../database/schema";
import { eq, and, desc, isNull, gte } from "drizzle-orm";

// Staff shifts — clock in / clock out from the waiter app, readable by admin.
export const shifts = new Hono()
  // GET /?branchId=1&userId=3&since=<epoch ms>  → shift list, newest first
  .get("/", async (c) => {
    const branchId = c.req.query("branchId");
    const userId = c.req.query("userId");
    const since = c.req.query("since");
    const conditions: any[] = [];
    if (branchId) conditions.push(eq(schema.shifts.branchId, parseInt(branchId)));
    if (userId) conditions.push(eq(schema.shifts.userId, parseInt(userId)));
    if (since) conditions.push(gte(schema.shifts.clockIn, new Date(parseInt(since))));

    const rows = conditions.length
      ? await db.select().from(schema.shifts).where(and(...conditions)).orderBy(desc(schema.shifts.clockIn))
      : await db.select().from(schema.shifts).orderBy(desc(schema.shifts.clockIn));
    return c.json({ shifts: rows }, 200);
  })

  // GET /active?userId=3 → the open shift for this user, if any
  .get("/active", async (c) => {
    const userId = c.req.query("userId");
    if (!userId) return c.json({ error: "userId required" }, 400);
    const [row] = await db.select().from(schema.shifts)
      .where(and(eq(schema.shifts.userId, parseInt(userId)), isNull(schema.shifts.clockOut)))
      .orderBy(desc(schema.shifts.clockIn));
    return c.json({ shift: row ?? null }, 200);
  })

  // POST /clock-in { userId, branchId, userName, device } → reuses an already-open shift
  .post("/clock-in", async (c) => {
    const body = await c.req.json() as {
      userId?: number; branchId?: number; userName?: string; device?: string;
    };
    if (!body.userId) return c.json({ error: "userId required" }, 400);

    const [open] = await db.select().from(schema.shifts)
      .where(and(eq(schema.shifts.userId, body.userId), isNull(schema.shifts.clockOut)))
      .orderBy(desc(schema.shifts.clockIn));
    if (open) return c.json({ shift: open, alreadyOpen: true }, 200);

    const [shift] = await db.insert(schema.shifts).values({
      userId: body.userId,
      branchId: body.branchId ?? null,
      userName: body.userName ?? null,
      device: body.device ?? "waiter-app",
      clockIn: new Date(),
    }).returning();
    return c.json({ shift }, 201);
  })

  // POST /clock-out { userId } — closes the open shift
  .post("/clock-out", async (c) => {
    const body = await c.req.json() as { userId?: number };
    if (!body.userId) return c.json({ error: "userId required" }, 400);

    const [open] = await db.select().from(schema.shifts)
      .where(and(eq(schema.shifts.userId, body.userId), isNull(schema.shifts.clockOut)))
      .orderBy(desc(schema.shifts.clockIn));
    if (!open) return c.json({ error: "No open shift" }, 404);

    const [shift] = await db.update(schema.shifts)
      .set({ clockOut: new Date() })
      .where(eq(schema.shifts.id, open.id))
      .returning();
    return c.json({ shift }, 200);
  });
