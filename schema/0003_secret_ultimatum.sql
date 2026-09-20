CREATE TABLE `bank_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`iban` text NOT NULL,
	`balance` integer NOT NULL,
	`revision` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `bank_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`kind` text NOT NULL,
	`fingerprint` text NOT NULL,
	`message_key` text NOT NULL,
	`filename` text NOT NULL,
	`message_id` text NOT NULL,
	`format` text NOT NULL,
	`count` integer NOT NULL,
	`total` integer NOT NULL,
	`delta` integer NOT NULL,
	`before` integer NOT NULL,
	`after` integer NOT NULL,
	`booking_date` text NOT NULL,
	`created_at` text NOT NULL,
	`warnings` text NOT NULL,
	`xml_key` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bank_company_fingerprint` ON `bank_batches` (`company_id`,`fingerprint`);--> statement-breakpoint
CREATE UNIQUE INDEX `bank_company_message` ON `bank_batches` (`company_id`,`message_key`);--> statement-breakpoint
CREATE INDEX `bank_company_created` ON `bank_batches` (`company_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `bank_movements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`company_id` text NOT NULL,
	`batch_id` text NOT NULL,
	`line` integer NOT NULL,
	`name` text NOT NULL,
	`iban` text NOT NULL,
	`amount` integer NOT NULL,
	`delta` integer NOT NULL,
	`balance` integer NOT NULL,
	`concept` text NOT NULL,
	`reference` text NOT NULL,
	`kind` text NOT NULL,
	`requested_date` text NOT NULL,
	`booking_date` text NOT NULL,
	`created_at` text NOT NULL,
	`mandate_id` text NOT NULL,
	`mandate_date` text NOT NULL,
	`source_name` text NOT NULL,
	`source_iban` text NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `bank_batches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bank_batch_line` ON `bank_movements` (`batch_id`,`line`);--> statement-breakpoint
CREATE INDEX `bank_company_movement` ON `bank_movements` (`company_id`,`id`);--> statement-breakpoint
CREATE INDEX `bank_company_date` ON `bank_movements` (`company_id`,`booking_date`);