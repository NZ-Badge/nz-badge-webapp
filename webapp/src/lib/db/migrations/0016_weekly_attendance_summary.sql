CREATE TABLE IF NOT EXISTS `weekly_attendance_summary_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`week_start_date` date NOT NULL,
	`week_end_date` date NOT NULL,
	`subscriber_id` int,
	`recipient_email` varchar(255) NOT NULL,
	`status` enum('sent','skipped','error') NOT NULL DEFAULT 'sent',
	`sent_at` timestamp,
	`error_msg` text,
	`created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `weekly_attendance_summary_log_id` PRIMARY KEY(`id`),
	CONSTRAINT `weekly_attendance_summary_log_subscriber_week_unique` UNIQUE(`subscriber_id`,`week_start_date`)
);

CREATE INDEX `idx_weekly_summary_week` ON `weekly_attendance_summary_log` (`week_start_date`,`week_end_date`);
CREATE INDEX `idx_weekly_summary_recipient` ON `weekly_attendance_summary_log` (`recipient_email`);

ALTER TABLE `weekly_attendance_summary_log`
	ADD CONSTRAINT `weekly_attendance_summary_log_subscriber_id_subscribers_id_fk`
	FOREIGN KEY (`subscriber_id`) REFERENCES `subscribers`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION;

INSERT INTO `settings` (`key`, `value`, `data_type`, `description`) VALUES
	('weekly_attendance_summary_enabled', 'false', 'boolean', 'Invia il riepilogo settimanale delle presenze agli iscritti')
ON DUPLICATE KEY UPDATE `key` = `key`;
