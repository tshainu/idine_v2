ALTER TABLE `register_settlements` ADD COLUMN `cash_amount` real DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `register_settlements` ADD COLUMN `card_amount` real DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `register_settlements` ADD COLUMN `cash_in_hand` real DEFAULT 0 NOT NULL;
