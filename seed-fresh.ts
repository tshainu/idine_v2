// Seeds a fresh iDine v2 database with one business, one branch, an admin and a waiter.
// Run from the repo root:  bun seed-fresh.ts
import { createClient } from "@libsql/client";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL missing");
const db = createClient({ url });

const BUSINESS_ID = "IDV2001";
const ADMIN_PW = "admin123";
const WAITER_PW = "waiter123";

const now = Date.now();

const existing = await db.execute("select count(*) as c from businesses");
if (Number(existing.rows[0].c) > 0) {
  console.log("Database already seeded — nothing to do.");
  process.exit(0);
}

// Branch
await db.execute({
  sql: "insert into branches (name, address, phone, is_active, created_at) values (?, ?, ?, 1, ?)",
  args: ["Main Branch", "Colombo", "0000000000", now],
});
const branchId = 1;

// Business (login gate for the waiter app + POS)
await db.execute({
  sql: `insert into businesses (user_id, business_name, username, password, password_plain, status, branch_id, created_at)
        values (?, ?, ?, ?, ?, 'active', ?, ?)`,
  args: [
    BUSINESS_ID,
    "iDine V2",
    "admin",
    await Bun.password.hash(ADMIN_PW),
    ADMIN_PW,
    branchId,
    now,
  ],
});

// Admin + waiter users
await db.execute({
  sql: `insert into users (branch_id, name, pin, user_id, username, password, role, is_active, created_at)
        values (?, ?, ?, ?, ?, ?, 'admin', 1, ?)`,
  args: [branchId, "Administrator", "1234", BUSINESS_ID, "admin", await Bun.password.hash(ADMIN_PW), now],
});
await db.execute({
  sql: `insert into users (branch_id, name, pin, user_id, username, password, role, is_active, created_at)
        values (?, ?, ?, ?, ?, ?, 'waiter', 1, ?)`,
  args: [branchId, "Waiter One", "1111", BUSINESS_ID, "waiter1", await Bun.password.hash(WAITER_PW), now],
});

// A couple of tables so the waiter app has something to show
for (const [name, cap] of [["T1", 4], ["T2", 4], ["T3", 6], ["T4", 2]] as const) {
  await db.execute({
    sql: "insert into tables (branch_id, name, capacity, is_active) values (?, ?, ?, 1)",
    args: [branchId, name, cap],
  });
}

console.log("Seeded.");
console.log(`  Business / User ID : ${BUSINESS_ID}`);
console.log(`  Admin              : admin / ${ADMIN_PW}`);
console.log(`  Waiter             : waiter1 / ${WAITER_PW}`);
