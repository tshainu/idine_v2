import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

// Branches (multi-branch support)
export const branches = sqliteTable("branches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  address: text("address"),
  phone: text("phone"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// Users
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  branchId: integer("branch_id").references(() => branches.id),
  name: text("name").notNull(),
  pin: text("pin"),
  userId: text("user_id"),       // shared per-business identifier, e.g. "ELE5236"
  username: text("username"),    // unique login name within the business
  password: text("password"),    // Bun.password hash
  role: text("role").notNull().default("waiter"), // superadmin | admin | waiter | cashier | kitchen
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// Businesses (managed from /idsa — the software owner's super admin panel)
export const businesses = sqliteTable("businesses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull().unique(),      // e.g. "ELE5236"
  businessName: text("business_name").notNull(),
  username: text("username").notNull().default("admin"),
  password: text("password").notNull(),             // Bun.password hash
  passwordPlain: text("password_plain").notNull(),   // kept for super admin reference, like other apps in this fleet
  status: text("status").notNull().default("active"), // active | suspended
  branchId: integer("branch_id").references(() => branches.id),
  // ── Messaging platform (managed from /idsa, consumed by the messaging pages) ──
  smsExecutionLink: text("sms_execution_link"),   // gateway URL this business posts SMS to
  senderIds: text("sender_ids"),                  // comma separated approved sender IDs
  smsCredits: real("sms_credits").notNull().default(0), // LKR balance, 1 LKR per SMS
  whatsappPhoneId: text("whatsapp_phone_id"),     // Meta WhatsApp Cloud API phone number id
  whatsappToken: text("whatsapp_token"),          // Meta permanent access token
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// Categories
export const categories = sqliteTable("categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  branchId: integer("branch_id").references(() => branches.id),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
});

// Printers
export const printers = sqliteTable("printers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  branchId: integer("branch_id").references(() => branches.id),
  name: text("name").notNull(),
  type: text("type").notNull(), // kot | bill
  connection: text("connection").notNull(), // lan | usb
  ipAddress: text("ip_address"),
  port: integer("port").default(9100),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
});

// Menu Items
export const menuItems = sqliteTable("menu_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  branchId: integer("branch_id").references(() => branches.id),
  categoryId: integer("category_id").references(() => categories.id),
  printerId: integer("printer_id").references(() => printers.id),
  name: text("name").notNull(),
  code: text("code"),
  price: real("price").notNull().default(0),          // base / dine-in price (legacy compat)
  priceDineIn: real("price_dine_in").notNull().default(0),
  priceTakeaway: real("price_takeaway").notNull().default(0),
  priceDelivery: real("price_delivery").notNull().default(0),
  description: text("description"),
  imageUrl: text("image_url"),
  costPrice: real("cost_price").notNull().default(0),
  loyaltyPoint: real("loyalty_point").notNull().default(0),
  isVeg: integer("is_veg", { mode: "boolean" }).notNull().default(false),
  isBeverage: integer("is_beverage", { mode: "boolean" }).notNull().default(false),
  isPromo: integer("is_promo", { mode: "boolean" }).notNull().default(false),
  isCombo: integer("is_combo", { mode: "boolean" }).notNull().default(false),
  originalPrice: real("original_price").notNull().default(0), // for promos — the "was" price shown struck-through
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

// Menu item variations (e.g. Small / Medium / Large)
export const menuItemVariations = sqliteTable("menu_item_variations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  menuItemId: integer("menu_item_id").references(() => menuItems.id).notNull(),
  name: text("name").notNull(),
  code: text("code"),
  priceDineIn: real("price_dine_in").notNull().default(0),
  priceTakeaway: real("price_takeaway").notNull().default(0),
  priceDelivery: real("price_delivery").notNull().default(0),
  loyaltyPoint: real("loyalty_point").notNull().default(0),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
});

// Combo included items — which menu items make up a combo (menuItems.isCombo = true row)
export const comboItems = sqliteTable("combo_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  comboId: integer("combo_id").references(() => menuItems.id).notNull(),
  menuItemId: integer("menu_item_id").references(() => menuItems.id),
  name: text("name").notNull(), // snapshot, so it still displays if the source item is later deleted
  qty: integer("qty").notNull().default(1),
});

// Tables (restaurant floor tables)
export const tables = sqliteTable("tables", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  branchId: integer("branch_id").references(() => branches.id),
  name: text("name").notNull(),
  capacity: integer("capacity").default(4),
  status: text("status").notNull().default("available"),
  zone: text("zone").default("Main Hall"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
});

// Customers
export const customers = sqliteTable("customers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  branchId: integer("branch_id").references(() => branches.id),
  name: text("name").notNull(),
  phone: text("phone"),
  address: text("address"),
  email: text("email"),
  gender: text("gender"),                       // male | female | other
  dob: text("dob"),                             // YYYY-MM-DD — birthday wishes
  weddingAnniversary: text("wedding_anniversary"), // YYYY-MM-DD
  child1Name: text("child1_name"),
  child1Dob: text("child1_dob"),
  child2Name: text("child2_name"),
  child2Dob: text("child2_dob"),
  child3Name: text("child3_name"),
  child3Dob: text("child3_dob"),
  loyaltyPoints: real("loyalty_points").notNull().default(0),
  notes: text("notes"),                         // preferences / private notes
  tags: text("tags"),                           // comma separated groups e.g. "vip,regular"
  smsOptOut: integer("sms_opt_out", { mode: "boolean" }).notNull().default(false),
  autoWishes: integer("auto_wishes", { mode: "boolean" }).notNull().default(true), // per-customer automation switch
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// Orders
export const orders = sqliteTable("orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  branchId: integer("branch_id").references(() => branches.id),
  orderNumber: text("order_number").notNull(),
  type: text("type").notNull().default("dine-in"), // dine-in | takeaway | delivery
  status: text("status").notNull().default("pending"), // pending | confirmed | served | paid | cancelled | draft
  tableId: integer("table_id").references(() => tables.id),
  waiterId: integer("waiter_id").references(() => users.id),
  customerId: integer("customer_id").references(() => customers.id),
  customerName: text("customer_name").default("Walk-in Customer"),
  notes: text("notes"),
  placedBy: text("placed_by"), // name of the logged-in staff member who placed the order
  subtotal: real("subtotal").notNull().default(0),
  discount: real("discount").notNull().default(0),
  serviceCharge: real("service_charge").notNull().default(0),
  total: real("total").notNull().default(0),
  paymentMethod: text("payment_method").default("Cash"),
  amountPaid: real("amount_paid").notNull().default(0),
  cashGiven: real("cash_given").notNull().default(0),
  balance: real("balance").notNull().default(0),
  paymentsJson: text("payments_json").default("[]"),
  kotPrinted: integer("kot_printed", { mode: "boolean" }).notNull().default(false),
  source: text("source").notNull().default("pos"), // pos | qr
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// Order Items
export const orderItems = sqliteTable("order_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: integer("order_id").references(() => orders.id),
  menuItemId: integer("menu_item_id").references(() => menuItems.id),
  name: text("name").notNull(),
  price: real("price").notNull(),
  qty: integer("qty").notNull().default(1),
  printerId: integer("printer_id").references(() => printers.id),
  total: real("total").notNull().default(0),
  kotPrinted: integer("kot_printed", { mode: "boolean" }).notNull().default(false),
  note: text("note"), // kitchen instruction e.g. "Low spicy" — prints on the KOT only
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// Print Jobs
export const printJobs = sqliteTable("print_jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  branchId: integer("branch_id").references(() => branches.id),
  orderId: integer("order_id").references(() => orders.id),
  printerId: integer("printer_id").references(() => printers.id),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  type: text("type").notNull(), // kot | bill | reprint
  status: text("status").notNull().default("pending"), // pending | printing | done | failed
  payload: text("payload").notNull(),
  attempts: integer("attempts").notNull().default(0),
  lastAttemptAt: integer("last_attempt_at", { mode: "timestamp" }),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// Suppliers
export const suppliers = sqliteTable("suppliers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  branchId: integer("branch_id").references(() => branches.id),
  name: text("name").notNull(),
  contactName: text("contact_name"),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  notes: text("notes"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// Purchase Items (catalog of purchasable items, separate from menu items)
export const purchaseItems = sqliteTable("purchase_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  branchId: integer("branch_id").references(() => branches.id),
  name: text("name").notNull(),
  unit: text("unit").notNull().default("pcs"), // kg | g | litre | ml | pcs | dozen | box | bag
  lastCost: real("last_cost").notNull().default(0),
  notes: text("notes"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// Purchases
export const purchases = sqliteTable("purchases", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  branchId: integer("branch_id").references(() => branches.id),
  supplierId: integer("supplier_id").references(() => suppliers.id),
  supplierName: text("supplier_name").notNull(),
  purchaseItemId: integer("purchase_item_id").references(() => purchaseItems.id),
  itemDescription: text("item_description").notNull(),
  invoiceNumber: text("invoice_number"),
  qty: real("qty").notNull().default(1),
  unitCost: real("unit_cost").notNull().default(0),
  total: real("total").notNull().default(0),
  amountPaid: real("amount_paid").notNull().default(0),
  dueAmount: real("due_amount").notNull().default(0),
  status: text("status").notNull().default("due"), // paid | partial | due
  purchaseDate: text("purchase_date").notNull(),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// Purchase Payments
export const purchasePayments = sqliteTable("purchase_payments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  purchaseId: integer("purchase_id").references(() => purchases.id).notNull(),
  branchId: integer("branch_id").references(() => branches.id),
  amount: real("amount").notNull().default(0),
  paymentDate: text("payment_date").notNull(),
  method: text("method").notNull().default("cash"), // cash | bank | cheque | card
  reference: text("reference"),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// Expenses
export const expenses = sqliteTable("expenses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  branchId: integer("branch_id").references(() => branches.id),
  category: text("category").notNull().default("General"),
  amount: real("amount").notNull().default(0),
  expenseDate: text("expense_date").notNull(),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// Ingredients (raw materials / stock items)
export const ingredients = sqliteTable("ingredients", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  branchId: integer("branch_id").references(() => branches.id),
  name: text("name").notNull(),
  unit: text("unit").notNull().default("kg"), // kg | g | litre | ml | pcs | dozen
  stockQty: real("stock_qty").notNull().default(0),
  minStockQty: real("min_stock_qty").notNull().default(0),
  costPerUnit: real("cost_per_unit").notNull().default(0),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// Modifiers (add-ons / customizations for menu items)
export const modifiers = sqliteTable("modifiers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  branchId: integer("branch_id").references(() => branches.id),
  name: text("name").notNull(),           // e.g. "Extra Cheese", "No Onion"
  groupName: text("group_name").notNull().default("General"), // e.g. "Toppings", "Preferences"
  price: real("price").notNull().default(0), // 0 = free modifier
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// Branch settings (key-value store per branch)
export const branchSettings = sqliteTable("branch_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  branchId: integer("branch_id").references(() => branches.id).notNull(),
  key: text("key").notNull(),
  value: text("value"),
});

// Promotions (discount rules)
export const promotions = sqliteTable("promotions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  branchId: integer("branch_id").references(() => branches.id),
  name: text("name").notNull(),
  type: text("type").notNull().default("percent"), // percent | flat | bogo
  value: real("value").notNull().default(0),       // % or flat LKR amount
  minOrderAmount: real("min_order_amount").notNull().default(0),
  startDate: text("start_date"),
  endDate: text("end_date"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// Outbox — change events buffered for cloud sync
export const outbox = sqliteTable("outbox", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  branchId: integer("branch_id").references(() => branches.id).notNull(),
  table: text("table").notNull(),         // which table changed
  operation: text("operation").notNull(), // insert | update | delete
  recordId: integer("record_id").notNull(),
  payload: text("payload").notNull(),     // JSON snapshot
  synced: integer("synced", { mode: "boolean" }).notNull().default(false),
  syncedAt: integer("synced_at", { mode: "timestamp" }),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ── Messaging Platform ──────────────────────────────────────────────────────

// Reusable SMS / WhatsApp templates. `body` supports {name} {points} {child} tokens.
export const messageTemplates = sqliteTable("message_templates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  branchId: integer("branch_id").references(() => branches.id).notNull(),
  name: text("name").notNull(),
  channel: text("channel").notNull().default("sms"), // sms | whatsapp
  // birthday | anniversary | child_birthday | festival | event | promo | custom
  kind: text("kind").notNull().default("custom"),
  body: text("body").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// A bulk / group / promotional / festival send.
export const messageCampaigns = sqliteTable("message_campaigns", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  branchId: integer("branch_id").references(() => branches.id).notNull(),
  name: text("name").notNull(),
  channel: text("channel").notNull().default("sms"), // sms | whatsapp
  kind: text("kind").notNull().default("promo"),     // promo | festival | event | custom
  body: text("body").notNull(),
  senderId: text("sender_id"),
  audience: text("audience").notNull().default("all"), // all | tag | selection
  audienceValue: text("audience_value"),               // tag name, or JSON array of customer ids
  scheduledAt: integer("scheduled_at", { mode: "timestamp" }), // null = send now
  status: text("status").notNull().default("draft"), // draft | scheduled | sending | sent | failed
  totalCount: integer("total_count").notNull().default(0),
  sentCount: integer("sent_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  completedAt: integer("completed_at", { mode: "timestamp" }),
});

// Every individual message attempt — the delivery report / cost ledger.
export const messageLog = sqliteTable("message_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  branchId: integer("branch_id").references(() => branches.id).notNull(),
  customerId: integer("customer_id").references(() => customers.id),
  campaignId: integer("campaign_id").references(() => messageCampaigns.id),
  channel: text("channel").notNull().default("sms"), // sms | whatsapp
  // manual | campaign | birthday | anniversary | child_birthday | festival | event
  kind: text("kind").notNull().default("manual"),
  phone: text("phone").notNull(),
  senderId: text("sender_id"),
  body: text("body").notNull(),
  segments: integer("segments").notNull().default(1), // 160-char SMS parts
  cost: real("cost").notNull().default(0),            // LKR charged
  status: text("status").notNull().default("pending"), // pending | sent | failed | skipped
  error: text("error"),
  gatewayResponse: text("gateway_response"),
  sentAt: integer("sent_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// Credit recharges (from /idsa) and debits (from sends).
export const creditTransactions = sqliteTable("credit_transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  businessId: integer("business_id").references(() => businesses.id).notNull(),
  branchId: integer("branch_id").references(() => branches.id),
  type: text("type").notNull(), // recharge | debit | adjustment
  amount: real("amount").notNull(),        // positive for recharge, negative for debit
  balanceAfter: real("balance_after").notNull().default(0),
  note: text("note"),
  createdBy: text("created_by").default("system"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});
