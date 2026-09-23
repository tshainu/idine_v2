import { Hono } from "hono";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "../database";
import * as schema from "../database/schema";

export const activityLogs = new Hono()
  .get("/", async (c) => {
    const branchId = c.req.query("branchId");
    const userId = c.req.query("userId");
    const action = c.req.query("action");
    const from = c.req.query("from");
    const to = c.req.query("to");
    const filters = [] as any[];
    if (branchId) filters.push(eq(schema.activityLogs.branchId, Number(branchId)));
    if (userId) filters.push(eq(schema.activityLogs.userId, Number(userId)));
    if (action) filters.push(eq(schema.activityLogs.action, action));
    if (from) filters.push(gte(schema.activityLogs.createdAt, new Date(`${from}T00:00:00`)));
    if (to) filters.push(lte(schema.activityLogs.createdAt, new Date(`${to}T23:59:59.999`)));
    const rows = await db.select().from(schema.activityLogs)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(schema.activityLogs.createdAt));
    return c.json({ activityLogs: rows }, 200);
  });
