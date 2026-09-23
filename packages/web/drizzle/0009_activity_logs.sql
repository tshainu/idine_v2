CREATE TABLE `activity_logs` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `branch_id` integer,
  `user_id` integer,
  `user_name` text,
  `user_role` text,
  `action` text NOT NULL,
  `method` text NOT NULL,
  `path` text NOT NULL,
  `entity` text,
  `entity_id` integer,
  `details` text,
  `status_code` integer DEFAULT 200 NOT NULL,
  `created_at` integer,
  FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
