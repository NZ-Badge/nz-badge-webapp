-- Staff users, RFID ownership and attendance domain.
-- Subscriber attendance stays in `attendance`; staff events use `staff_attendance`.

ALTER TABLE `users`
  MODIFY COLUMN `role` ENUM('admin', 'staff', 'collaborator') NOT NULL DEFAULT 'staff',
  ADD COLUMN `status` ENUM('active', 'deleted') NOT NULL DEFAULT 'active' AFTER `role`,
  ADD COLUMN `deleted_at` TIMESTAMP NULL AFTER `status`,
  ADD INDEX `idx_users_status` (`status`);
--> statement-breakpoint

ALTER TABLE `card_rfid`
  ADD COLUMN `user_id` INT NULL AFTER `subscriber_id`,
  ADD INDEX `idx_card_user` (`user_id`),
  ADD CONSTRAINT `card_rfid_user_id_users_id_fk`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL;
--> statement-breakpoint

CREATE TABLE `staff_attendance` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `card_uid` VARCHAR(14) NULL,
  `uid_raw` VARCHAR(14) NULL,
  `device_id` VARCHAR(50) NULL,
  `event_type` ENUM('entry', 'exit') NOT NULL,
  `read_timestamp` DATETIME(3) NOT NULL,
  `device_time_raw` DATETIME(3) NULL,
  `timestamp_sync` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `offline_queued` BOOLEAN NOT NULL DEFAULT FALSE,
  `source` ENUM('card', 'manual', 'simulation') NOT NULL,
  `created_by_user_id` INT NULL,
  `is_backdated` BOOLEAN NOT NULL DEFAULT FALSE,
  `raw_payload` JSON NULL,
  `validated` BOOLEAN NOT NULL DEFAULT TRUE,
  `queue_pending` INT NULL,
  `storage_free_percent` INT NULL,
  `note` VARCHAR(255) NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_staff_attendance_user_time` (`user_id`, `read_timestamp`),
  INDEX `idx_staff_attendance_timestamp` (`read_timestamp`),
  INDEX `idx_staff_attendance_card_uid` (`card_uid`),
  INDEX `idx_staff_attendance_device` (`device_id`),
  INDEX `idx_staff_attendance_source` (`source`),
  CONSTRAINT `staff_attendance_user_id_users_id_fk`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `staff_attendance_created_by_user_id_users_id_fk`
    FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`)
);
