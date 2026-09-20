CREATE TABLE `social_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`reference` text NOT NULL,
	`company` text NOT NULL,
	`ccc` text NOT NULL,
	`period_from` text NOT NULL,
	`period_to` text NOT NULL,
	`kinds` text NOT NULL,
	`workers` integer NOT NULL,
	`total` integer,
	`submission_date` text NOT NULL,
	`created_at` text NOT NULL,
	`warnings` text NOT NULL,
	`fingerprint` text NOT NULL,
	`upload_key` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `social_company_created` ON `social_batches` (`company_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `social_documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`company_id` text NOT NULL,
	`batch_id` text NOT NULL,
	`kind` text NOT NULL,
	`identity_key` text NOT NULL,
	`liquidation_key` text NOT NULL,
	`signature` text NOT NULL,
	`data` text NOT NULL,
	`pdf_key` text NOT NULL,
	`file_hash` text NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `social_batches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `social_document_identity` ON `social_documents` (`company_id`,`identity_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `social_batch_kind` ON `social_documents` (`batch_id`,`kind`);--> statement-breakpoint
CREATE INDEX `social_liquidation` ON `social_documents` (`company_id`,`liquidation_key`);