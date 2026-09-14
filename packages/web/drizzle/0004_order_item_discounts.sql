ALTER TABLE `order_items` ADD COLUMN `discount` real NOT NULL DEFAULT 0;
ALTER TABLE `order_items` ADD COLUMN `promotion_name` text;
