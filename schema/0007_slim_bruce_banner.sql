CREATE TABLE `bank_mandates` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`name` text NOT NULL,
	`iban` text NOT NULL,
	`reference` text NOT NULL,
	`signed_date` text NOT NULL,
	`direction` text NOT NULL,
	`status` text NOT NULL,
	`revision` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bank_mandate_reference` ON `bank_mandates` (`company_id`,`direction`,`reference`);--> statement-breakpoint
CREATE TABLE `bank_product_payments` (
	`product_id` text NOT NULL,
	`installment` integer NOT NULL,
	`batch_id` text NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `bank_products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`batch_id`) REFERENCES `bank_batches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bank_product_installment` ON `bank_product_payments` (`product_id`,`installment`);--> statement-breakpoint
CREATE UNIQUE INDEX `bank_product_batch` ON `bank_product_payments` (`batch_id`);--> statement-breakpoint
CREATE TABLE `bank_products` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`data` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `practice_files` (
	`key` text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE `practice_guards` (
	`id` text PRIMARY KEY NOT NULL,
	`valid` integer NOT NULL,
	CONSTRAINT "practice_guard_valid" CHECK("practice_guards"."valid"=1)
);
