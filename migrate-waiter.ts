// Idempotent migration for the waiter app: orders.tip_amount + the shifts table.
// Usage: bun run migrate-waiter.ts <path-to-local.db>
// drizzle-kit push cannot be used here (drizzle.config.ts is dialect:"turso" and demands an
// authToken while this deployment uses a file: URL), so we ALTER TABLE directly.
import { Database } from "bun:sqlite";

const path = process.argv[2] ?? "local.db";
const db = new Database(path);

function columns(table: string): string[] {
  try {
    return db.query(`PRAGMA table_info(${table})`).all().map((r: any) => r.name);
  } catch {
    return [];
  }
}

function addColumn(table: string, column: string, ddl: string) {
  if (columns(table).includes(column)) {
    console.log(`  = ${table}.${column} already present`);
    return;
  }
  db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  console.log(`  + ${table}.${column}`);
}

console.log(`db=${path}`);

console.log("orders:");
addColumn("orders", "tip_amount", "REAL NOT NULL DEFAULT 0");

console.log("shifts:");
const hasShifts = db
  .query("SELECT name FROM sqlite_master WHERE type='table' AND name='shifts'")
  .all().length > 0;
if (hasShifts) {
  console.log("  = shifts table already present");
} else {
  db.run(`CREATE TABLE shifts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_id INTEGER REFERENCES branches(id),
    user_id INTEGER REFERENCES users(id),
    user_name TEXT,
    clock_in INTEGER,
    clock_out INTEGER,
    device TEXT,
    created_at INTEGER
  )`);
  db.run("CREATE INDEX IF NOT EXISTS idx_shifts_user ON shifts(user_id, clock_out)");
  db.run("CREATE INDEX IF NOT EXISTS idx_shifts_branch ON shifts(branch_id, clock_in)");
  console.log("  + shifts table + indexes");
}

const shiftRows = db.query("SELECT count(*) as n FROM shifts").get() as any;
console.log(`done. shifts rows=${shiftRows.n}, orders.tip_amount present=${columns("orders").includes("tip_amount")}`);
db.close();
