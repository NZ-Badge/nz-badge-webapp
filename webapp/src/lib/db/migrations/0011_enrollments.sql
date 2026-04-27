CREATE TABLE `enrollments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`external_id` varchar(50) NOT NULL,
	`subscriber_id` int,
	`order_id` varchar(255) NOT NULL,
	`order_name` varchar(50),
	`line_item_id` varchar(255) NOT NULL,
	`product_id` varchar(255),
	`product_title` varchar(255),
	`variant_title` varchar(255),
	`quantity` int NOT NULL DEFAULT 1,
	`customer_email` varchar(255) NOT NULL,
	`customer_display_name` varchar(255),
	`first_name` varchar(100),
	`last_name` varchar(100),
	`phone` varchar(20),
	`fiscal_code` varchar(20),
	`preferred_date` date,
	`notes` text,
	`submitted_at` timestamp,
	`status` enum('PENDING','SUBMITTED','COMPLETED') NOT NULL DEFAULT 'PENDING',
	`external_created_at` timestamp NOT NULL,
	`external_updated_at` timestamp NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `enrollments_id` PRIMARY KEY(`id`),
	CONSTRAINT `enrollments_external_id_unique` UNIQUE(`external_id`)
);
--> statement-breakpoint
CREATE TABLE `enrollment_sync_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`started_at` timestamp DEFAULT (now()),
	`completed_at` timestamp,
	`status` enum('running','success','error') NOT NULL DEFAULT 'running',
	`enrollments_found` int NOT NULL DEFAULT 0,
	`enrollments_created` int NOT NULL DEFAULT 0,
	`subscribers_created` int NOT NULL DEFAULT 0,
	`errors` int NOT NULL DEFAULT 0,
	`error_msg` text,
	`triggered_by` enum('manual','scheduled') NOT NULL DEFAULT 'manual',
	CONSTRAINT `enrollment_sync_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `enrollments` ADD CONSTRAINT `enrollments_subscriber_id_subscribers_id_fk` FOREIGN KEY (`subscriber_id`) REFERENCES `subscribers`(`id`) ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX `idx_enrollment_email` ON `enrollments` (`customer_email`);
--> statement-breakpoint
CREATE INDEX `idx_enrollment_status` ON `enrollments` (`status`);
--> statement-breakpoint
CREATE INDEX `idx_enrollment_subscriber` ON `enrollments` (`subscriber_id`);
--> statement-breakpoint
CREATE INDEX `idx_enrollment_order` ON `enrollments` (`order_id`);
