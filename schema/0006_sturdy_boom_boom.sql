CREATE TABLE `social_registry` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`kind` text NOT NULL,
	`identity_key` text NOT NULL,
	`number_key` text NOT NULL,
	`reference` text NOT NULL,
	`title` text NOT NULL,
	`number` text NOT NULL,
	`effective_date` text NOT NULL,
	`created_at` text NOT NULL,
	`data` text NOT NULL,
	`fingerprint` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `social_registry_identity` ON `social_registry` (`company_id`,`kind`,`identity_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `social_registry_number` ON `social_registry` (`company_id`,`kind`,`number_key`);--> statement-breakpoint
CREATE INDEX `social_registry_created` ON `social_registry` (`company_id`,`created_at`);