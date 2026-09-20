CREATE TABLE `sepe_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`reference` text NOT NULL,
	`filename` text NOT NULL,
	`count` integer NOT NULL,
	`communication_date` text NOT NULL,
	`created_at` text NOT NULL,
	`warnings` text NOT NULL,
	`fingerprint` text NOT NULL,
	`xml_key` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sepe_company_fingerprint` ON `sepe_batches` (`company_id`,`fingerprint`);--> statement-breakpoint
CREATE INDEX `sepe_company_created` ON `sepe_batches` (`company_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `sepe_contracts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`company_id` text NOT NULL,
	`batch_id` text NOT NULL,
	`line` integer NOT NULL,
	`identity_key` text NOT NULL,
	`name` text NOT NULL,
	`person_id` text NOT NULL,
	`employer_id` text NOT NULL,
	`code` text NOT NULL,
	`data` text NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `sepe_batches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sepe_contract_identity` ON `sepe_contracts` (`company_id`,`identity_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `sepe_batch_line` ON `sepe_contracts` (`batch_id`,`line`);