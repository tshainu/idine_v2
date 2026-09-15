ALTER TABLE `users` ADD COLUMN `default_order_type` text NOT NULL DEFAULT 'dine-in';
ALTER TABLE `orders` ADD COLUMN `discount_name` text;
ALTER TABLE `orders` ADD COLUMN `discount_type` text;
ALTER TABLE `orders` ADD COLUMN `discount_value` real NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS `discounts` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `branch_id` integer REFERENCES `branches`(`id`),
  `name` text NOT NULL,
  `type` text NOT NULL DEFAULT 'percent',
  `value` real NOT NULL DEFAULT 0,
  `is_active` integer NOT NULL DEFAULT 1,
  `created_at` integer NOT NULL
);
CREATE INDEX IF NOT EXISTS `discounts_branch_idx` ON `discounts` (`branch_id`);
