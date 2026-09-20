CREATE TABLE `mail_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`sender_name` text NOT NULL,
	`sender_address` text NOT NULL,
	`recipient` text NOT NULL,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`source` text NOT NULL,
	`folder` text NOT NULL,
	`home_folder` text NOT NULL,
	`is_read` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`reply_to` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `mail_company_folder_created` ON `mail_messages` (`company_id`,`folder`,`created_at`);--> statement-breakpoint
CREATE TABLE `mail_rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`hits` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `mail_rate_expiry` ON `mail_rate_limits` (`expires_at`);