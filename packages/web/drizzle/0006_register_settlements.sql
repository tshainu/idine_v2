CREATE TABLE IF NOT EXISTS `register_settlements` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `branch_id` integer REFERENCES `branches`(`id`),
  `settlement_date` integer NOT NULL,
  `billed_amount` real NOT NULL DEFAULT 0,
  `settled_amount` real NOT NULL DEFAULT 0,
  `justification` text,
  `settled_by_id` integer REFERENCES `users`(`id`),
  `settled_by_name` text,
  `created_at` integer NOT NULL
);
CREATE INDEX IF NOT EXISTS `register_settlements_branch_date_idx` ON `register_settlements` (`branch_id`, `settlement_date`);
