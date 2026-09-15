import { Hono } from "hono";
import { db } from "../database";
import * as schema from "../database/schema";
import { eq, and } from "drizzle-orm";

export const users = new Hono()
  .get("/", async (c) => {
    const branchId = c.req.query("branchId");
    const query = db.select().from(schema.users);
    const active = eq(schema.users.isActive, true);
    const all = branchId
      ? await db.select().from(schema.users).where(and(eq(schema.users.branchId, parseInt(branchId)), active))
      : await db.select().from(schema.users).where(active);
    const safe = all.map(({ password, ...rest }) => rest);
    return c.json({ users: safe }, 200);
  })
  .post("/", async (c) => {
    const body = await c.req.json();
    if (body.password) body.password = await Bun.password.hash(body.password);
    if (!body.pin) body.pin = "0000"; // legacy column still NOT NULL on older DBs; unused by new auth flow
    const [user] = await db.insert(schema.users).values(body).returning();
    const { password: _pw, ...safe } = user;
    return c.json({ user: safe }, 201);
  })
  .post("/login", async (c) => {
    const { pin, branchId } = await c.req.json();
    const conditions = [eq(schema.users.pin, pin), eq(schema.users.isActive, true)];
    if (branchId) conditions.push(eq(schema.users.branchId, parseInt(branchId)));
    const [user] = await db.select().from(schema.users).where(and(...conditions));
    if (!user) return c.json({ error: "Invalid PIN" }, 401);
    return c.json({ user }, 200);
  })
  .patch("/:id", async (c) => {
    const id = parseInt(c.req.param("id"));
    const body = await c.req.json();
    if (body.password) body.password = await Bun.password.hash(body.password);
    const [user] = await db.update(schema.users).set(body).where(eq(schema.users.id, id)).returning();
    const { password: _pw, ...safe } = user;
    return c.json({ user: safe }, 200);
  })
  .delete("/:id", async (c) => {
    const id = parseInt(c.req.param("id"));
    const [user] = await db.update(schema.users).set({ isActive: false }).where(eq(schema.users.id, id)).returning({ id: schema.users.id });
    if (!user) return c.json({ error: "User not found" }, 404);
    return c.json({ ok: true, id: user.id }, 200);
  });
