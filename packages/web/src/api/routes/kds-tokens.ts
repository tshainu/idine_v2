import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../database";
import * as schema from "../database/schema";

export const kdsTokens = new Hono().post("/", async (c) => {
  const body = await c.req.json<{ token?: string; branchId?: number; platform?: string; appVersion?: string }>();
  if (!body.token || !body.branchId) return c.json({ error: "token and branchId are required" }, 400);
  const now = new Date();
  const [existing] = await db.select().from(schema.kdsPushTokens).where(eq(schema.kdsPushTokens.token, body.token));
  if (existing) {
    const [updated] = await db.update(schema.kdsPushTokens).set({ branchId: body.branchId, platform: body.platform ?? "android", appVersion: body.appVersion ?? null, lastSeenAt: now, isActive: true }).where(eq(schema.kdsPushTokens.id, existing.id)).returning();
    return c.json({ token: updated }, 200);
  }
  const [created] = await db.insert(schema.kdsPushTokens).values({ token: body.token, branchId: body.branchId, platform: body.platform ?? "android", appVersion: body.appVersion ?? null, lastSeenAt: now, isActive: true }).returning();
  return c.json({ token: created }, 201);
});
