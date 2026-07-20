CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`description` text,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_org_code_unique` ON `accounts` (`org_id`,`code`);--> statement-breakpoint
CREATE INDEX `accounts_org_type_idx` ON `accounts` (`org_id`,`type`);--> statement-breakpoint
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
CREATE TABLE `journal_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`date` text NOT NULL,
	`description` text NOT NULL,
	`reference` text,
	`status` text DEFAULT 'posted' NOT NULL,
	`reversed_by_entry_id` text,
	`reverses_entry_id` text,
	`created_by_user_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `journal_entries_org_date_idx` ON `journal_entries` (`org_id`,`date`);--> statement-breakpoint
CREATE INDEX `journal_entries_org_status_idx` ON `journal_entries` (`org_id`,`status`);--> statement-breakpoint
CREATE TABLE `journal_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`entry_id` text NOT NULL,
	`account_id` text NOT NULL,
	`direction` text NOT NULL,
	`amount` integer NOT NULL,
	`memo` text,
	`position` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`entry_id`) REFERENCES `journal_entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `journal_lines_entry_idx` ON `journal_lines` (`entry_id`);--> statement-breakpoint
CREATE INDEX `journal_lines_org_account_idx` ON `journal_lines` (`org_id`,`account_id`);--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`fiscal_year_start_month` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organizations_name_unique` ON `organizations` (lower("name"));--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text,
	`name` text,
	`role` text DEFAULT 'admin' NOT NULL,
	`is_superuser` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `users_org_idx` ON `users` (`org_id`);