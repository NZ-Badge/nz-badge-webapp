-- Migration: Soft delete support for card_rfid
-- Date: 2026-03-10

ALTER TABLE card_rfid
  MODIFY COLUMN status ENUM('active', 'disabled', 'replaced', 'lost', 'deleted') DEFAULT 'active';
--> statement-breakpoint
ALTER TABLE card_rfid
  ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL AFTER status;
