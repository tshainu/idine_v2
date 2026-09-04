/**
 * Messaging platform migration — additive only.
 *
 * Adds the Customers CRM columns, the per-business SMS config/credit columns,
 * and the four messaging tables. Safe to re-run: every ALTER is wrapped so an
 * already-applied column is skipped instead of aborting the run.
 *
 * Usage: bun run migrate-messaging.ts [path-to-db]   (default ./local.db)
 */
import { Database } from "bun:sqlite";

const dbPath = process.argv[2] ?? "./local.db";
const db = new Database(dbPath);

// Base tables that some older databases predate. Created with the messaging
// columns already in place, so the ALTERs below simply report them as present.
const CREATES_BASE: string[] = [
  `CREATE TABLE IF NOT EXISTS businesses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL UNIQUE,
    business_name TEXT NOT NULL,
    username TEXT NOT NULL DEFAULT 'admin',
    password TEXT NOT NULL,
    password_plain TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    branch_id INTEGER REFERENCES branches(id),
    sms_execution_link TEXT,
    sender_ids TEXT,
    sms_credits REAL NOT NULL DEFAULT 0,
    whatsapp_phone_id TEXT,
    whatsapp_token TEXT,
    created_at INTEGER
  )`,
];

const ALTERS: string[] = [
  "ALTER TABLE customers ADD COLUMN email TEXT",
  "ALTER TABLE customers ADD COLUMN gender TEXT",
  "ALTER TABLE customers ADD COLUMN dob TEXT",
  "ALTER TABLE customers ADD COLUMN wedding_anniversary TEXT",
  "ALTER TABLE customers ADD COLUMN child1_name TEXT",
  "ALTER TABLE customers ADD COLUMN child1_dob TEXT",
  "ALTER TABLE customers ADD COLUMN child2_name TEXT",
  "ALTER TABLE customers ADD COLUMN child2_dob TEXT",
  "ALTER TABLE customers ADD COLUMN child3_name TEXT",
  "ALTER TABLE customers ADD COLUMN child3_dob TEXT",
  "ALTER TABLE customers ADD COLUMN loyalty_points REAL NOT NULL DEFAULT 0",
  "ALTER TABLE customers ADD COLUMN notes TEXT",
  "ALTER TABLE customers ADD COLUMN tags TEXT",
  "ALTER TABLE customers ADD COLUMN sms_opt_out INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE customers ADD COLUMN auto_wishes INTEGER NOT NULL DEFAULT 1",
  "ALTER TABLE businesses ADD COLUMN sms_execution_link TEXT",
  "ALTER TABLE businesses ADD COLUMN sender_ids TEXT",
  "ALTER TABLE businesses ADD COLUMN sms_credits REAL NOT NULL DEFAULT 0",
  "ALTER TABLE businesses ADD COLUMN whatsapp_phone_id TEXT",
  "ALTER TABLE businesses ADD COLUMN whatsapp_token TEXT",
];

const CREATES: string[] = [
  `CREATE TABLE IF NOT EXISTS message_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_id INTEGER NOT NULL REFERENCES branches(id),
    name TEXT NOT NULL,
    channel TEXT NOT NULL DEFAULT 'sms',
    kind TEXT NOT NULL DEFAULT 'custom',
    body TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS message_campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_id INTEGER NOT NULL REFERENCES branches(id),
    name TEXT NOT NULL,
    channel TEXT NOT NULL DEFAULT 'sms',
    kind TEXT NOT NULL DEFAULT 'promo',
    body TEXT NOT NULL,
    sender_id TEXT,
    audience TEXT NOT NULL DEFAULT 'all',
    audience_value TEXT,
    scheduled_at INTEGER,
    status TEXT NOT NULL DEFAULT 'draft',
    total_count INTEGER NOT NULL DEFAULT 0,
    sent_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER,
    completed_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS message_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_id INTEGER NOT NULL REFERENCES branches(id),
    customer_id INTEGER REFERENCES customers(id),
    campaign_id INTEGER REFERENCES message_campaigns(id),
    channel TEXT NOT NULL DEFAULT 'sms',
    kind TEXT NOT NULL DEFAULT 'manual',
    phone TEXT NOT NULL,
    sender_id TEXT,
    body TEXT NOT NULL,
    segments INTEGER NOT NULL DEFAULT 1,
    cost REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    error TEXT,
    gateway_response TEXT,
    sent_at INTEGER,
    created_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS credit_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL REFERENCES businesses(id),
    branch_id INTEGER REFERENCES branches(id),
    type TEXT NOT NULL,
    amount REAL NOT NULL,
    balance_after REAL NOT NULL DEFAULT 0,
    note TEXT,
    created_by TEXT DEFAULT 'system',
    created_at INTEGER
  )`,
  "CREATE INDEX IF NOT EXISTS idx_message_log_branch ON message_log(branch_id, created_at)",
  "CREATE INDEX IF NOT EXISTS idx_message_log_customer ON message_log(customer_id)",
];

let added = 0;
let skipped = 0;

for (const sql of CREATES_BASE) {
  db.run(sql);
}

for (const sql of ALTERS) {
  try {
    db.run(sql);
    added++;
    console.log("  +", sql.replace("ALTER TABLE ", "").replace(" ADD COLUMN", ":"));
  } catch (e: any) {
    if (String(e?.message ?? e).includes("duplicate column")) {
      skipped++;
    } else {
      console.error("  ! FAILED:", sql, "\n   ", e?.message ?? e);
      process.exit(1);
    }
  }
}

for (const sql of CREATES) {
  db.run(sql);
}

console.log(`\nColumns added: ${added}, already present: ${skipped}`);
console.log("Tables ensured: message_templates, message_campaigns, message_log, credit_transactions");
db.close();
