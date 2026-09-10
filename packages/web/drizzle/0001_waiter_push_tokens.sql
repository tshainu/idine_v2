CREATE TABLE IF NOT EXISTS `waiter_push_tokens` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `token` text NOT NULL,
  `branch_id` integer NOT NULL,
  `waiter_id` integer NOT NULL,
  `platform` text NOT NULL DEFAULT 'android',
  `app_version` text,
  `last_seen_at` integer,
  `created_at` integer,
  FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`waiter_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `waiter_push_tokens_token_unique` ON `waiter_push_tokens` (`token`);
