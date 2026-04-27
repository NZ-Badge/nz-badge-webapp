-- Migration: Initial schema baseline
-- Created: 2026-02-27
-- This migration creates the base tables in their ORIGINAL state (pre-0001).
-- All CREATE TABLE statements use IF NOT EXISTS so this is safe to run on
-- databases that were bootstrapped manually before the migration system existed.
--
-- NOTE: Tables are created with the original Italian column names and enum
-- values that existed before subsequent migrations (0001+) renamed/altered them.
-- Do NOT "fix" these to match current schema.ts — the later migrations handle that.

-- ── users ─────────────────────────────────────────────────────────────────────
-- Original state: no `name` column (added by 0010), role has 'operator' (renamed to 'staff' by 0010)
CREATE TABLE IF NOT EXISTS `users` (
  `id`            int          AUTO_INCREMENT PRIMARY KEY,
  `email`         varchar(255) NOT NULL UNIQUE,
  `password_hash` varchar(255) NOT NULL,
  `role`          enum('admin', 'operator') NOT NULL DEFAULT 'operator',
  `created_at`    timestamp    DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    timestamp    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint

-- ── subscribers ───────────────────────────────────────────────────────────────
-- Original state: Italian column names (renamed to English by migration 0001)
CREATE TABLE IF NOT EXISTS `subscribers` (
  `id`               int          AUTO_INCREMENT PRIMARY KEY,
  `shopify_order_id` bigint       UNIQUE,
  `nome`             varchar(100) NOT NULL,
  `cognome`          varchar(100) NOT NULL,
  `email`            varchar(255) NOT NULL,
  `telefono`         varchar(20),
  `codice_fiscale`   varchar(16),
  `course_id`        int,
  `corso_nome`       varchar(255),
  `data_acquisto`    date,
  `data_inizio_corso` date,
  `data_fine_corso`  date,
  `status`           enum('active', 'completed', 'suspended', 'cancelled') DEFAULT 'active',
  `note`             text,
  `created_at`       timestamp    DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       timestamp    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_course`  (`course_id`),
  INDEX `idx_status`  (`status`),
  INDEX `idx_email`   (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint

-- ── card_rfid ─────────────────────────────────────────────────────────────────
-- Original state:
--   data_scrittura (renamed write_date by 0001)
--   no `type` column (added by 0005)
--   no `deleted_at` column (added by 0002)
--   status enum without 'deleted' (added by 0002)
CREATE TABLE IF NOT EXISTS `card_rfid` (
  `id`                 int          AUTO_INCREMENT PRIMARY KEY,
  `subscriber_id`      int,
  `uid`                varchar(14)  NOT NULL UNIQUE,
  `uid_raw`            binary(7),
  `sector_data`        json,
  `key_a`              varchar(12),
  `key_b`              varchar(12),
  `sector`             int          DEFAULT 4,
  `data_scrittura`     timestamp,
  `expiration_date`    date,
  `status`             enum('active', 'disabled', 'replaced', 'lost') DEFAULT 'active',
  `written_by_user_id` int,
  `written_by_device`  varchar(100),
  FOREIGN KEY (`subscriber_id`)      REFERENCES `subscribers`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`written_by_user_id`) REFERENCES `users`(`id`),
  INDEX `idx_uid`        (`uid`),
  INDEX `idx_status`     (`status`),
  INDEX `idx_subscriber` (`subscriber_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint

-- ── attendance ────────────────────────────────────────────────────────────────
-- No subsequent migration touches this table — created in its final form.
CREATE TABLE IF NOT EXISTS `attendance` (
  `id`                   bigint       AUTO_INCREMENT PRIMARY KEY,
  `card_uid`             varchar(14)  NOT NULL,
  `uid_raw`              varchar(14),
  `subscriber_id`        int,
  `device_id`            varchar(50)  NOT NULL,
  `event_type`           enum('entry', 'exit') NOT NULL,
  `read_timestamp`       datetime(3)  NOT NULL,
  `device_time_raw`      datetime(3),
  `timestamp_sync`       timestamp    DEFAULT CURRENT_TIMESTAMP,
  `offline_queued`       boolean      DEFAULT false,
  `raw_payload`          json,
  `validated`            boolean      DEFAULT true,
  `queue_pending`        int,
  `storage_free_percent` int,
  `note`                 varchar(255),
  FOREIGN KEY (`subscriber_id`) REFERENCES `subscribers`(`id`) ON DELETE SET NULL,
  INDEX `idx_card_uid`   (`card_uid`),
  INDEX `idx_timestamp`  (`read_timestamp`),
  INDEX `idx_device`     (`device_id`),
  INDEX `idx_subscriber` (`subscriber_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint

-- ── device_registry ───────────────────────────────────────────────────────────
-- No subsequent migration touches this table — created in its final form.
CREATE TABLE IF NOT EXISTS `device_registry` (
  `id`               int          AUTO_INCREMENT PRIMARY KEY,
  `device_id`        varchar(50)  NOT NULL UNIQUE,
  `device_type`      enum('reader', 'writer') NOT NULL,
  `location`         varchar(100),
  `token_hash`       varchar(255) NOT NULL,
  `last_ping`        timestamp,
  `firmware_version` varchar(20),
  `ip_address`       varchar(45),
  `active`           boolean      DEFAULT true,
  `created_at`       timestamp    DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint

-- ── audit_log ─────────────────────────────────────────────────────────────────
-- No subsequent migration touches this table — created in its final form.
CREATE TABLE IF NOT EXISTS `audit_log` (
  `id`          bigint       AUTO_INCREMENT PRIMARY KEY,
  `user_id`     int,
  `action`      varchar(50)  NOT NULL,
  `entity_type` varchar(50),
  `entity_id`   int,
  `data_before` json,
  `data_after`  json,
  `ip_address`  varchar(45),
  `user_agent`  varchar(500),
  `created_at`  timestamp    DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`),
  INDEX `idx_user`   (`user_id`),
  INDEX `idx_action` (`action`),
  INDEX `idx_time`   (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
