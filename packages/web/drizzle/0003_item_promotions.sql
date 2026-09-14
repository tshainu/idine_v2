ALTER TABLE `promotions` ADD COLUMN `target_item_ids` text DEFAULT '[]';
ALTER TABLE `orders` ADD COLUMN `promotion_id` integer REFERENCES `promotions`(`id`);
ALTER TABLE `orders` ADD COLUMN `promotion_name` text;
