import { Hono } from "hono";
import { cors } from "hono/cors";
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

const app = new Hono()
  .basePath("api")
  .use(cors({ origin: (origin) => origin ?? "*", credentials: true, exposeHeaders: ["set-auth-token"] }))
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
  .route("/messaging", messaging);

export type AppType = typeof app;
export default app;
