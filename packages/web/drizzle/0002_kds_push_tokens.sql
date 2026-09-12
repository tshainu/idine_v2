CREATE TABLE IF NOT EXISTS `kds_push_tokens` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `token` text NOT NULL,
  `branch_id` integer NOT NULL,
  `platform` text NOT NULL DEFAULT 'android',
  `app_version` text,
  `is_active` integer NOT NULL DEFAULT 1,
  `last_seen_at` integer,
  FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `kds_push_tokens_token_unique` ON `kds_push_tokens` (`token`);
