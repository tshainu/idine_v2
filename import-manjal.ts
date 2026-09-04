/**
 * Idempotent Manjal Jaffna menu import.
 *
 * Usage: bun run import-manjal.ts <db-path> <branch-id>
 * Example (VPS): cd /var/www/idine_v2 && bun run import-manjal.ts local.db 2
 *
 * - Inserts the 30 categories (sheet order) if missing.
 * - Upserts 204 menu items matched on (branch_id, name).
 * - price = price_dine_in = price_takeaway = price_delivery (sheet price).
 * - cost_price = price * 0.7  -> the products page shows a 30% margin.
 * - Rewrites menu_item_variations for items that have variations.
 * - Data source: manjal-menu.json (generated from Manjal_Menu_Items_Prntut.xlsx).
 */
import { Database } from "bun:sqlite";

type Variation = { name: string; price: number };
type Item = {
  code: string;
  name: string;
  category: string;
  price: number;
  isVeg: number;
  isBeverage: number;
  image?: string | null;
  variations: Variation[];
};

const dbPath = process.argv[2] ?? "local.db";
const branchId = Number(process.argv[3] ?? 2);
const MARGIN_PCT = 30;

const data = (await Bun.file(new URL("./manjal-menu.json", import.meta.url)).json()) as {
  categories: string[];
  items: Item[];
};

const db = new Database(dbPath);
db.exec("PRAGMA foreign_keys = ON");

const branch = db.query<{ id: number; name: string }, [number]>(
  "select id, name from branches where id = ?",
).get(branchId);
if (!branch) throw new Error(`branch ${branchId} not found in ${dbPath}`);
console.log(`db=${dbPath} branch=${branch.id} (${branch.name})`);

let catsAdded = 0;
const catId = new Map<string, number>();
data.categories.forEach((name, i) => {
  const existing = db
    .query<{ id: number }, [number, string]>(
      "select id from categories where branch_id = ? and name = ?",
    )
    .get(branchId, name);
  if (existing) {
    db.run("update categories set sort_order = ?, is_active = 1 where id = ?", [i + 1, existing.id]);
    catId.set(name, existing.id);
    return;
  }
  db.run("insert into categories (branch_id, name, sort_order, is_active) values (?, ?, ?, 1)", [
    branchId,
    name,
    i + 1,
  ]);
  const id = db.query<{ id: number }, []>("select last_insert_rowid() as id").get()!.id;
  catId.set(name, id);
  catsAdded++;
});

let inserted = 0;
let updated = 0;
let varRows = 0;

const tx = db.transaction(() => {
  data.items.forEach((item, i) => {
    const price = Number(item.price) || 0;
    const cost = Math.round(price * (1 - MARGIN_PCT / 100) * 100) / 100;
    const cid = catId.get(item.category) ?? null;
    const sort = i + 1;

    const existing = db
      .query<{ id: number }, [number, string]>(
        "select id from menu_items where branch_id = ? and name = ?",
      )
      .get(branchId, item.name);

    let id: number;
    if (existing) {
      db.run(
        `update menu_items set category_id = ?, code = ?, price = ?, price_dine_in = ?,
           price_takeaway = ?, price_delivery = ?, cost_price = ?, is_veg = ?, is_beverage = ?,
           is_active = 1, sort_order = ?${item.image ? ", image_url = ?" : ""}
         where id = ?`,
        item.image
          ? [
              cid,
              item.code,
              price,
              price,
              price,
              price,
              cost,
              item.isVeg,
              item.isBeverage,
              sort,
              item.image,
              existing.id,
            ]
          : [cid, item.code, price, price, price, price, cost, item.isVeg, item.isBeverage, sort, existing.id],
      );
      id = existing.id;
      updated++;
    } else {
      db.run(
        `insert into menu_items
           (branch_id, category_id, name, code, price, price_dine_in, price_takeaway, price_delivery,
            cost_price, image_url, loyalty_point, is_veg, is_beverage, is_promo, is_active, sort_order, is_combo)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 0, 1, ?, 0)`,
        [
          branchId,
          cid,
          item.name,
          item.code,
          price,
          price,
          price,
          price,
          cost,
          item.image ?? null,
          item.isVeg,
          item.isBeverage,
          sort,
        ],
      );
      id = db.query<{ id: number }, []>("select last_insert_rowid() as id").get()!.id;
      inserted++;
    }

    db.run("delete from menu_item_variations where menu_item_id = ?", [id]);
    for (const v of item.variations) {
      db.run(
        `insert into menu_item_variations
           (menu_item_id, name, price_dine_in, price_takeaway, price_delivery, loyalty_point, is_active)
         values (?, ?, ?, ?, ?, 0, 1)`,
        [id, v.name, v.price, v.price, v.price],
      );
      varRows++;
    }
  });
});
tx();

console.log(
  `categories: ${data.categories.length} (${catsAdded} new) | items inserted ${inserted}, updated ${updated} | variations ${varRows}`,
);
db.close();
