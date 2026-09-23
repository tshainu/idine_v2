import { Hono } from "hono";
import { cors } from "hono/cors";
import { eq } from "drizzle-orm";
import { branches } from "./routes/branches";
import { users } from "./routes/users";
import { categories } from "./routes/categories";
import { menuItems } from "./routes/menu-items";
import { tables } from "./routes/tables";
import { printers } from "./routes/printers";
import { orders } from "./routes/orders";
import { orderItems } from "./routes/order-items";
import { printJobs } from "./routes/print-jobs";
import { customers } from "./routes/customers";
import { purchases } from "./routes/purchases";
import { suppliers } from "./routes/suppliers";
import { purchaseItems } from "./routes/purchase-items";
import { purchasePayments } from "./routes/purchase-payments";
import { expenses } from "./routes/expenses";
import { ingredients } from "./routes/ingredients";
import { modifiers } from "./routes/modifiers";
import { promotions } from "./routes/promotions";
import { settings } from "./routes/settings";
import { variations } from "./routes/variations";
import { sync } from "./routes/sync";
import { menuToken } from "./routes/menu-token";
import { auth } from "./routes/auth";
import { idsa } from "./routes/idsa";
import { menuExtract } from "./routes/menu-extract";
import { comboItems } from "./routes/combo-items";
import { messaging } from "./routes/messaging";
import { shifts } from "./routes/shifts";
import { deviceTokens } from "./routes/device-tokens";
import { kdsTokens } from "./routes/kds-tokens";
import { settlements } from "./routes/settlements";
import { discounts } from "./routes/discounts";
import { reporting } from "./routes/reporting";
import { modifications } from "./routes/modifications";
import { activityLogs } from "./routes/activity-logs";
import { db } from "./database";
import * as schema from "./database/schema";

const app = new Hono()
  .basePath("api")
  .use(cors({ origin: (origin) => origin ?? "*", credentials: true, exposeHeaders: ["set-auth-token"] }))
  .use("*", async (c, next) => {
    const method = c.req.method.toUpperCase();
    const shouldLog = ["POST", "PUT", "PATCH", "DELETE"].includes(method) && !c.req.path.endsWith("/activity-logs");
    let body: any = {};
    if (shouldLog) {
      try { body = await c.req.raw.clone().json(); } catch { body = {}; }
    }
    await next();
    if (shouldLog) {
      try {
        const path = c.req.path;
        const segments = path.split("/").filter(Boolean);
        const entity = segments[1] || segments[0] || "api";
        const last = segments[segments.length - 1];
        const entityId = /^\d+$/.test(last || "") ? Number(last) : null;
        const userId = body.userId ?? body.cancellationUserId ?? body.settledById ?? body.cashierId ?? body.placedById ?? null;
        const userName = body.userName ?? body.cancellationUserName ?? body.settledByName ?? body.placedBy ?? body.createdBy ?? null;
        const branchId = body.branchId == null ? null : Number(body.branchId);
        const actorId = userId == null || !Number.isFinite(Number(userId)) ? null : Number(userId);
        const [actor] = actorId == null ? [] : await db.select({ branchId: schema.users.branchId }).from(schema.users).where(eq(schema.users.id, actorId)).limit(1);
        const resolvedBranchId = Number.isFinite(branchId) ? branchId : (actor?.branchId ?? null);
        const action = `${method} ${path}`;
        const safeBody = { ...body };
        delete safeBody.password; delete safeBody.pin; delete safeBody.passwordPlain;
        await db.insert(schema.activityLogs).values({
          branchId: resolvedBranchId,
          userId: actorId,
          userName: userName == null ? null : String(userName),
          userRole: body.role == null ? null : String(body.role),
          action, method, path, entity, entityId,
          details: JSON.stringify(safeBody).slice(0, 4000), statusCode: c.res.status,
        });
      } catch (error) { console.error("[activity-log] failed", error); }
    }
  })
  .get("/ping", (c) => c.json({ message: `Pong! ${Date.now()}` }, 200))
  .get("/health", (c) => c.json({ status: "ok" }, 200))
  .route("/branches", branches)
  .route("/users", users)
  .route("/categories", categories)
  .route("/menu-items", menuItems)
  .route("/tables", tables)
  .route("/printers", printers)
  .route("/orders", orders)
  .route("/order-items", orderItems)
  .route("/print-jobs", printJobs)
  .route("/customers", customers)
  .route("/purchases", purchases)
  .route("/suppliers", suppliers)
  .route("/purchase-items", purchaseItems)
  .route("/purchase-payments", purchasePayments)
  .route("/expenses", expenses)
  .route("/ingredients", ingredients)
  .route("/modifiers", modifiers)
  .route("/promotions", promotions)
  .route("/settings", settings)
  .route("/variations", variations)
  .route("/sync", sync)
  .route("/menu", menuToken)
  .route("/auth", auth)
  .route("/idsa", idsa)
  .route("/menu-extract", menuExtract)
  .route("/combo-items", comboItems)
  .route("/messaging", messaging)
  .route("/shifts", shifts)
  .route("/device-tokens", deviceTokens)
  .route("/kds-tokens", kdsTokens)
  .route("/settlements", settlements)
  .route("/discounts", discounts)
  .route("/reporting", reporting)
  .route("/modifications", modifications)
  .route("/activity-logs", activityLogs);


export type AppType = typeof app;
export default app;
