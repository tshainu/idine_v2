import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { db } from "../database";
import * as schema from "../database/schema";
import { isExpoPushToken } from "../push-notifications";

export const pushTokens = new Hono()
  .post("/", async (c) => {
    const body = await c.req.json() as {
      token?: unknown;
      branchId?: number;
      waiterId?: number;
      platform?: string;
      appVersion?: string;
    };
    if (!isExpoPushToken(body.token)) return c.json({ error: "Valid Expo push token required" }, 400);
    if (!body.branchId || !body.waiterId) return c.json({ error: "branchId and waiterId required" }, 400);

    const [existing] = await db
      .select({ id: schema.waiterPushTokens.id })
      .from(schema.waiterPushTokens)
      .where(eq(schema.waiterPushTokens.token, body.token));

    if (existing) {
      await db.update(schema.waiterPushTokens)
        .set({
          branchId: body.branchId,
          waiterId: body.waiterId,
          platform: body.platform ?? "android",
          appVersion: body.appVersion ?? null,
          lastSeenAt: new Date(),
        })
        .where(eq(schema.waiterPushTokens.id, existing.id));
    } else {
      await db.insert(schema.waiterPushTokens).values({
        token: body.token,
        branchId: body.branchId,
        waiterId: body.waiterId,
        platform: body.platform ?? "android",
        appVersion: body.appVersion ?? null,
      });
    }
    return c.json({ ok: true }, 200);
  })
  .delete("/", async (c) => {
    const body = await c.req.json() as { token?: unknown; waiterId?: number };
    if (typeof body.token === "string") {
      await db.delete(schema.waiterPushTokens).where(eq(schema.waiterPushTokens.token, body.token));
    } else if (body.waiterId) {
      await db.delete(schema.waiterPushTokens).where(eq(schema.waiterPushTokens.waiterId, body.waiterId));
    }
    return c.json({ ok: true }, 200);
  });
