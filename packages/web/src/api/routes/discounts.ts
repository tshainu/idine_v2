import { Hono } from "hono";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../database";
import * as schema from "../database/schema";

export const discounts = new Hono()
  .get("/", async (c) => {
    const branchId = Number(c.req.query("branchId"));
    const rows = await db.select().from(schema.discounts).where(
      branchId ? and(eq(schema.discounts.branchId, branchId), eq(schema.discounts.isActive, true)) : eq(schema.discounts.isActive, true)
    ).orderBy(asc(schema.discounts.name));
    return c.json({ discounts: rows }, 200);
  })
  .post("/", async (c) => {
    const body = await c.req.json();
    const name = String(body.name || "").trim();
    const type = body.type === "amount" ? "amount" : "percent";
    const value = Number(body.value);
    const branchId = Number(body.branchId);
    if (!name || !branchId || !Number.isFinite(value) || value < 0 || (type === "percent" && value > 100)) {
      return c.json({ error: "Enter a valid discount name, type, and value." }, 400);
    }
    const [discount] = await db.insert(schema.discounts).values({ branchId, name, type, value }).returning();
    return c.json({ discount }, 201);
  })
  .patch("/:id", async (c) => {
    const id = Number(c.req.param("id"));
    const body = await c.req.json();
    const patch: any = {};
    if (body.name !== undefined) patch.name = String(body.name).trim();
    if (body.type !== undefined) patch.type = body.type === "amount" ? "amount" : "percent";
    if (body.value !== undefined) patch.value = Number(body.value);
    if (body.isActive !== undefined) patch.isActive = Boolean(body.isActive);
    if (patch.type === "percent" && Number(patch.value) > 100) return c.json({ error: "Percentage cannot exceed 100." }, 400);
    const [discount] = await db.update(schema.discounts).set(patch).where(eq(schema.discounts.id, id)).returning();
    if (!discount) return c.json({ error: "Discount not found" }, 404);
    return c.json({ discount }, 200);
  })
  .delete("/:id", async (c) => {
    const id = Number(c.req.param("id"));
    await db.update(schema.discounts).set({ isActive: false }).where(eq(schema.discounts.id, id));
    return c.json({ ok: true }, 200);
  });
