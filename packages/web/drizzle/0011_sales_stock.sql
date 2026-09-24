CREATE TABLE `stock_items` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `branch_id` integer REFERENCES `branches`(`id`),
  `name` text NOT NULL,
  `quantity_on_hand` real DEFAULT 0 NOT NULL,
  `quantity_reserved` real DEFAULT 0 NOT NULL,
  `low_stock_level` real DEFAULT 10 NOT NULL,
  `allow_overselling` integer DEFAULT false NOT NULL,
  `is_active` integer DEFAULT true NOT NULL,
  `created_by_id` integer REFERENCES `users`(`id`),
  `created_by_name` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `menu_item_stocks` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `stock_item_id` integer NOT NULL REFERENCES `stock_items`(`id`),
  `menu_item_id` integer NOT NULL REFERENCES `menu_items`(`id`),
  `deduction_qty` real DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `stock_movements` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `branch_id` integer REFERENCES `branches`(`id`),
  `stock_item_id` integer NOT NULL REFERENCES `stock_items`(`id`),
  `menu_item_id` integer REFERENCES `menu_items`(`id`),
  `order_id` integer REFERENCES `orders`(`id`),
  `order_item_id` integer REFERENCES `order_items`(`id`),
  `movement_type` text NOT NULL,
  `qty` real DEFAULT 0 NOT NULL,
  `previous_qty` real DEFAULT 0 NOT NULL,
  `new_qty` real DEFAULT 0 NOT NULL,
  `note` text,
  `created_by_id` integer REFERENCES `users`(`id`),
  `created_by_name` text,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `stock_items_branch_idx` ON `stock_items` (`branch_id`);
--> statement-breakpoint
CREATE INDEX `menu_item_stocks_menu_idx` ON `menu_item_stocks` (`menu_item_id`);
--> statement-breakpoint
CREATE INDEX `stock_movements_order_idx` ON `stock_movements` (`order_id`);
