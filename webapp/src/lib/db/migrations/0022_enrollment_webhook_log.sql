CREATE TABLE `enrollment_webhook_log` (
  `id` int AUTO_INCREMENT NOT NULL,
  `received_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `external_id` varchar(50),
  `status` enum('received','processed','ignored','invalid_json','invalid_payload','failed') NOT NULL DEFAULT 'received',
  `http_status` int,
  `payload` longtext NOT NULL,
  CONSTRAINT `enrollment_webhook_log_id` PRIMARY KEY (`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_enrollment_webhook_log_received` ON `enrollment_webhook_log` (`received_at`, `id`);
