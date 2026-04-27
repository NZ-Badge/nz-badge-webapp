-- Migration: firmware_releases table for OTA updates
-- 2026-03-15

CREATE TABLE IF NOT EXISTS `firmware_releases` (
    `id`                  INT          AUTO_INCREMENT PRIMARY KEY,
    `version`             VARCHAR(32)  NOT NULL UNIQUE,
    `device_type`         VARCHAR(64)  NOT NULL DEFAULT 'reader-station',
    `file_path`           VARCHAR(255) NOT NULL,
    `file_size_bytes`     INT          NOT NULL,
    `sha256`              VARCHAR(64)  NOT NULL,
    `is_active`           BOOLEAN      NOT NULL DEFAULT FALSE,
    `release_notes`       TEXT,
    `created_at`          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    `created_by_user_id`  INT,
    CONSTRAINT `fk_fw_user`
        FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`)
        ON DELETE SET NULL,
    INDEX `idx_fw_device_type` (`device_type`),
    INDEX `idx_fw_active`      (`is_active`)
);
