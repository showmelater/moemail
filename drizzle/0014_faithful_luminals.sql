CREATE TABLE `activation_code` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`status` text DEFAULT 'unused' NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer,
	`used_at` integer,
	`used_by_user_id` text,
	FOREIGN KEY (`used_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `activation_code_code_unique` ON `activation_code` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `activation_code_code_idx` ON `activation_code` (`code`);--> statement-breakpoint
CREATE INDEX `activation_code_status_idx` ON `activation_code` (`status`);--> statement-breakpoint
CREATE INDEX `activation_code_expires_at_idx` ON `activation_code` (`expires_at`);--> statement-breakpoint
ALTER TABLE `email` ADD `is_permanent` integer DEFAULT false NOT NULL;