ALTER TABLE `enrollment_sync_log` MODIFY COLUMN `triggered_by` enum('manual','scheduled','webhook') NOT NULL DEFAULT 'manual';
