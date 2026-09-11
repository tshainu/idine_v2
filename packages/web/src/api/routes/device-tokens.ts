import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { db } from "../database";
import * as schema from "../database/schema";

export const deviceTokens = new Hono()
  .post("/", async (c) => {
    const body = await c.req.json<{
      userId?: number;
      branchId?: number | null;
      token?: string;
      platform?: string;
    }>();
    if (!body.userId || !body.token) return c.json({ error: "userId and token are required" }, 400);

    const now = new Date();
    const [existing] = await db
      .select()
      .from(schema.deviceTokens)
      .where(eq(schema.deviceTokens.token, body.token));

    if (existing) {
      const [updated] = await db
        .update(schema.deviceTokens)
        .set({
          userId: body.userId,
          branchId: body.branchId ?? null,
          platform: body.platform ?? "android",
          isActive: true,
          updatedAt: now,
        })
        .where(eq(schema.deviceTokens.id, existing.id))
        .returning();
      return c.json({ deviceToken: updated }, 200);
    }

    const [created] = await db
      .insert(schema.deviceTokens)
      .values({
        userId: body.userId,
        branchId: body.branchId ?? null,
        token: body.token,
        platform: body.platform ?? "android",
        isActive: true,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return c.json({ deviceToken: created }, 201);
  })
  .delete("/", async (c) => {
    const body = await c.req.json<{ token?: string }>();
    if (!body.token) return c.json({ error: "token is required" }, 400);
    await db
      .update(schema.deviceTokens)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(schema.deviceTokens.token, body.token));
    return c.json({ ok: true }, 200);
  });
