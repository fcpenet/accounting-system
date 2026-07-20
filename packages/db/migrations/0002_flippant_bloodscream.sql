CREATE TABLE `invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`token_hash` text NOT NULL,
	`invited_by_user_id` text,
	`expires_at` integer NOT NULL,
	`accepted_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invited_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invitations_token_unique` ON `invitations` (`token_hash`);--> statement-breakpoint
CREATE INDEX `invitations_org_email_idx` ON `invitations` (`org_id`,`email`);--> statement-breakpoint
ALTER TABLE `users` ADD `role` text DEFAULT 'owner' NOT NULL;--> statement-breakpoint
CREATE INDEX `users_org_idx` ON `users` (`org_id`);